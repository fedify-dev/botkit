// A bot that polls an RSS/Atom/RDF feed on an interval and posts new
// entries to the fediverse.
//
// Run:  deno serve --allow-net --allow-env --allow-read=./data --allow-write=./data --watch bot.ts
//   or: npx srvx serve --port 8000 --entry ./bot.ts
// Set:  ORIGIN=https://your-domain
//       FEED_URL=https://example.com/feed.xml (defaults to Hacker News)
//       POLL_INTERVAL_MS=600000 (defaults to 10 minutes)
//       BEHIND_PROXY=true (when running behind a tunnel or reverse proxy)

import {
  createBot,
  InProcessMessageQueue,
  link,
  MemoryKvStore,
  text,
} from "@fedify/botkit";
import { SqliteRepository } from "@fedify/botkit-sqlite";
import { mkdirSync } from "node:fs";
import { fetchFeed } from "./feed.ts";
import type { FeedItem } from "./feed.ts";
import {
  isBaselined,
  isPosted,
  markBaselined,
  markPosted,
  openAppDb,
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

const bot = createBot<void>({
  username: "rssbot",
  name: "RSS Bot",
  summary: text`I watch ${link(FEED_URL)} and post new entries here.`,
  kv: new MemoryKvStore(),
  queue: new InProcessMessageQueue(),
  repository: new SqliteRepository({ path: "./data/bot.db" }),
  behindProxy: BEHIND_PROXY,
});

const appDb = openAppDb("./data/app.db");

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

let feedTitle: string | null = null;

bot.onMention = async (_session, message) => {
  await message.reply(
    text`I'm watching ${
      link(feedTitle ?? FEED_URL, FEED_URL)
    } and check for new posts every ${formatInterval(POLL_INTERVAL_MS)}.`,
  );
};

async function poll(): Promise<void> {
  const feed = await fetchFeed(FEED_URL);
  feedTitle = feed.title;
  const items = [...feed.items].reverse(); // feeds list newest-first

  // Don't flood followers with the feed's entire current front page the
  // very first time this bot ever runs.  Only items that show up in later
  // polls count as "new".  This is tracked in app.db, so it only happens
  // once ever, not once per restart.
  const isFirstEverPoll = !isBaselined(appDb);

  const session = bot.getSession(ORIGIN);
  let publishedCount = 0;
  for (const item of items) {
    const key = itemKey(item);
    if (key == null || isPosted(appDb, key)) continue;
    if (!isFirstEverPoll) {
      await session.publish(
        text`${item.title ?? "(untitled)"}

${link(item.url ?? FEED_URL)}`,
      );
      publishedCount++;
    }
    markPosted(appDb, key);
  }
  if (isFirstEverPoll) markBaselined(appDb);
  console.log(
    isFirstEverPoll
      ? `Baseline: ${items.length} existing item(s) from ${FEED_URL}.`
      : `Posted ${publishedCount} new item(s) from ${FEED_URL}.`,
  );
}

let polling = false;

async function pollOnce(): Promise<void> {
  if (polling) return; // skip if the previous poll is still running
  polling = true;
  try {
    await poll();
  } catch (error) {
    console.error("Failed to poll feed:", error);
  } finally {
    polling = false;
  }
}

pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);

export default bot;
