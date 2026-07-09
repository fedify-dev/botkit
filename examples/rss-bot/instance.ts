// An instance hosting one bot per registered RSS/Atom/RDF feed, plus a
// static "registry" bot that adds a new feed whenever it's mentioned with
// a URL.
//
// Run:  deno serve --allow-net --allow-env --allow-read=./data --allow-write=./data --watch instance.ts
//   or: npx srvx serve --port 8000 --entry ./instance.ts
// Set:  ORIGIN=https://your-domain
//       FEED_URL=https://example.com/feed.xml (the original single-feed
//         bot's feed; only used to seed its row on first run)
//       POLL_INTERVAL_MS=600000 (defaults to 10 minutes)
//       BEHIND_PROXY=true (when running behind a tunnel or reverse proxy)

import {
  createInstance,
  InProcessMessageQueue,
  link,
  MemoryKvStore,
  mention,
  text,
} from "@fedify/botkit";
import { SqliteRepository } from "@fedify/botkit-sqlite";
import { mkdirSync } from "node:fs";
import { fetchFeed } from "./feed.ts";
import type { FeedItem } from "./feed.ts";
import {
  addFeed,
  type FeedRow,
  getFeedByIdentifier,
  getFeedBySlug,
  getFeedByUrl,
  isPosted,
  listFeeds,
  markFeedBaselined,
  markPosted,
  openAppDb,
  seedFeed,
  updateFeedTitle,
} from "./db.ts";

mkdirSync("./data", { recursive: true });

const FEED_URL = process.env.FEED_URL ?? "https://news.ycombinator.com/rss";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:8000";
const BEHIND_PROXY = process.env.BEHIND_PROXY?.trim()?.toLowerCase() ===
  "true";

const rawPollIntervalMs = process.env.POLL_INTERVAL_MS;
const POLL_INTERVAL_MS = rawPollIntervalMs == null || rawPollIntervalMs === ""
  ? 1000 * 60 * 10
  : Number(rawPollIntervalMs);
if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS <= 0) {
  throw new RangeError(
    `POLL_INTERVAL_MS must be a positive number of milliseconds: ${rawPollIntervalMs}`,
  );
}

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
  queue: new InProcessMessageQueue(),
  repository: new SqliteRepository({ path: "./data/bot.db" }),
  behindProxy: BEHIND_PROXY,
  // The single-bot deployment from part 1 never set an explicit
  // `identifier`, so createBot() defaulted it to "bot" -- "rssbot" was
  // only ever its username, the human-readable part of the handle.
  // Reusing that same identifier (not legacyObjectUris below) is what
  // keeps the actor's URI, keys, and follower relationships intact;
  // legacyObjectUris only rewrites the *old* format of individual object
  // URIs (posts, follows) that remote servers may still have cached from
  // before this bot moved onto an instance.
  legacyObjectUris: { identifier: "bot" },
});

const appDb = openAppDb("./data/app.db");

// Carries the original feed forward as a row here, under the bot's actual
// (default) identifier and its existing username, so it's handled by the
// same dynamic bot group as every feed registered from now on.  A no-op
// after the first run.
seedFeed(appDb, { identifier: "bot", url: FEED_URL, slug: "rssbot" });

function itemKey(item: FeedItem): string | null {
  return item.id ?? item.url;
}

function formatInterval(ms: number): string {
  if (ms < 60_000) {
    const seconds = Math.round(ms / 1000);
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.round(ms / 60_000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function extractUrl(input: string): string | null {
  const match = input.match(/https?:\/\/\S+/)?.[0];
  return match != null && URL.canParse(match) ? match : null;
}

// A dynamic bot group: one bot per row in the feeds table, resolved on
// demand.  This is what turns "one bot per feed" into a single
// registration up front, instead of an imperative createBot() call every
// time a feed is added -- see registryBot.onMention below.
const feedBots = instance.createBot(
  (_ctx, identifier) => {
    const feed = getFeedByIdentifier(appDb, identifier);
    if (feed == null) return null;
    return { username: feed.slug, name: feed.title ?? feed.url };
  },
  {
    mapUsername(_ctx, username) {
      const feed = getFeedBySlug(appDb, username);
      return feed?.identifier ?? null;
    },
  },
);

feedBots.onMention = async (session, message) => {
  const feed = getFeedByIdentifier(appDb, session.bot.identifier);
  if (feed == null) return;
  await message.reply(
    text`I'm watching ${
      link(feed.title ?? feed.url, feed.url)
    } and check for new posts every ${formatInterval(POLL_INTERVAL_MS)}.`,
  );
};

// A static bot: the registration desk.  Mentioning it with a feed URL adds
// a row to the feeds table; feedBots's dispatcher picks up the new row on
// its own the next time that identifier is resolved.
//
// This doesn't check who sent the mention, and doesn't validate the URL
// before it's fetched by the polling loop below.  See the tutorial's
// "Advanced exercises" section for what a real deployment needs here.
const registryBot = instance.createBot("registry", {
  username: "registry",
  name: "Feed Registry",
  summary: text`Mention me with a feed URL to register a new feed bot.`,
});

registryBot.onMention = async (_session, message) => {
  const url = extractUrl(message.text);
  if (url == null) {
    await message.reply(text`Please include a feed URL in your mention.`);
    return;
  }
  const existing = getFeedByUrl(appDb, url);
  if (existing != null) {
    await message.reply(
      text`Already watching that feed: ${
        mention(`@${existing.slug}@${new URL(ORIGIN).host}`)
      }.`,
    );
    return;
  }
  const feed = addFeed(appDb, url);
  await message.reply(
    text`Registered! Give it a few minutes, then look for ${
      mention(`@${feed.slug}@${new URL(ORIGIN).host}`)
    }.`,
  );
};

const FETCH_TIMEOUT_MS = 30_000;

async function pollFeed(feed: FeedRow): Promise<void> {
  const parsed = await fetchFeed(
    feed.url,
    AbortSignal.timeout(FETCH_TIMEOUT_MS),
  );
  if (parsed.title != null && parsed.title !== feed.title) {
    updateFeedTitle(appDb, feed.identifier, parsed.title);
  }
  const items = [...parsed.items].reverse(); // feeds list newest-first

  // Don't flood followers with the feed's entire current front page the
  // very first time this feed is polled.  Only items that show up in
  // later polls count as "new".
  const isFirstEverPoll = !feed.baselined;

  const session = await feedBots.getSession(ORIGIN, feed.identifier);
  let publishedCount = 0;
  for (const item of items) {
    const key = itemKey(item);
    if (key == null || isPosted(appDb, feed.identifier, key)) continue;
    if (!isFirstEverPoll) {
      await session.publish(
        text`${item.title ?? "(untitled)"}

${link(item.url ?? feed.url)}`,
      );
      publishedCount++;
    }
    markPosted(appDb, feed.identifier, key);
  }
  if (isFirstEverPoll) markFeedBaselined(appDb, feed.identifier);
  console.log(
    isFirstEverPoll
      ? `Baseline: ${items.length} existing item(s) from ${feed.url}.`
      : `Posted ${publishedCount} new item(s) from ${feed.url}.`,
  );
}

async function pollAll(): Promise<void> {
  for (const feed of listFeeds(appDb)) {
    try {
      await pollFeed(feed);
    } catch (error) {
      console.error(`Failed to poll feed ${feed.url}:`, error);
    }
  }
}

let polling = false;

async function pollAllOnce(): Promise<void> {
  if (polling) return; // skip if the previous poll cycle is still running
  polling = true;
  try {
    await pollAll();
  } finally {
    polling = false;
  }
}

pollAllOnce();
setInterval(pollAllOnce, POLL_INTERVAL_MS);

export default instance;
