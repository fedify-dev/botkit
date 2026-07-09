---
description: >-
  Build an RSS/Atom feed bot with BotKit, test it on the fediverse, then
  grow it into a multi-bot instance and deploy it.
---

Building an RSS bot
===================

BotKit's [*Getting started*](../start.md) guide gets a bot running in a few
minutes, with a hello-world handler and nothing to poll. This tutorial keeps
going: it builds a bot that watches an RSS, Atom, or RDF feed and posts new
entries to the fediverse, and along the way it touches most of what BotKit
does, from scheduled work and persistence to replying to mentions and,
once one feed becomes several, [`createInstance()`](../concepts/instance.md)
and dynamic bot groups.

The first part builds a single bot that watches one feed. The second turns
it into an instance that can host one bot per feed, registered by mentioning
the instance with a feed's URL. Each part ends with the bot exposed to the
public internet and tested from ActivityPub.Academy: followed, mentioned,
and watched from a real Mastodon account.

This tutorial assumes you've read *Getting started* already, so it won't
re-explain `createBot()` or [`Text`](../concepts/text.md) from scratch. The
finished project is also browsable in BotKit's repository, under
[*examples/rss-bot/*][1].

[1]: https://github.com/fedify-dev/botkit/tree/main/examples/rss-bot


A single bot
------------

### Setting up the project

Create a new directory for the bot and install BotKit along with
[*@rowanmanning/feed-parser*],
the library that will turn a feed's raw XML into a plain object:

::: code-group

~~~~ bash [Deno]
mkdir rss-bot && cd rss-bot
deno add jsr:@fedify/botkit npm:@rowanmanning/feed-parser
~~~~

~~~~ bash [npm]
mkdir rss-bot && cd rss-bot
npm init -y
npm add @fedify/botkit @rowanmanning/feed-parser
~~~~

~~~~ bash [pnpm]
mkdir rss-bot && cd rss-bot
pnpm init
pnpm add @fedify/botkit @rowanmanning/feed-parser
~~~~

~~~~ bash [Yarn]
mkdir rss-bot && cd rss-bot
yarn init -y
yarn add @fedify/botkit @rowanmanning/feed-parser
~~~~

:::

[*@rowanmanning/feed-parser*]: https://github.com/rowanmanning/feed-parser

### Fetching and parsing the feed

*@rowanmanning/feed-parser* parses RSS 0.9x, RSS 2.0, RDF Site Summary 1.0
(RSS 1.0), and Atom 0.3/1.0 feeds, all through the same `parseFeed()`
function and the same resulting `Feed`/`FeedItem` shape. The bot's own code
never has to branch on which format a particular feed happens to use.

What `parseFeed()` doesn't do is fetch anything. It only turns an XML string
you already have into an object; getting that string is the caller's job.
The bot's code keeps that same split: a `feed.ts` module that does the
fetching, separate from whatever polls it on a schedule.

~~~~ typescript [feed.ts] twoslash
import { parseFeed } from "@rowanmanning/feed-parser";

// @rowanmanning/feed-parser's public entry only exports the `parseFeed`
// function, not its `Feed`/`FeedItem` types, so we derive them here instead
// of reaching into its internal module paths.
export type Feed = ReturnType<typeof parseFeed>;
export type FeedItem = Feed["items"][number];

export async function fetchFeed(
  url: string | URL,
  signal?: AbortSignal,
): Promise<Feed> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch feed: ${response.status} ${response.statusText}`,
    );
  }
  return parseFeed(await response.text());
}
~~~~

The type derivation at the top is a small workaround.
*@rowanmanning/feed-parser*'s package only exports the `parseFeed` function
itself, not the `Feed` and `FeedItem` classes it returns, so importing
`type { Feed }` directly from the package fails. `ReturnType<typeof parseFeed>`
sidesteps that by asking TypeScript to work the type out from the function's
own signature instead of naming it directly.

### Polling and publishing

The bot itself starts out simple: create it, poll the feed on an interval,
and publish whatever's new. Its identifier and everything else about it
follow the pattern from *Getting started*, except the
[`kv`](../concepts/bot.md#createbotoptions-kv) store and
[`queue`](../concepts/bot.md#createbotoptions-queue) here are the in-memory ones
meant for local development. They'll be replaced once restarts start to matter.

~~~~ typescript [bot.ts] twoslash
// @noErrors: 2307
import {
  createBot,
  InProcessMessageQueue,
  link,
  MemoryKvStore,
  text,
} from "@fedify/botkit";
import { fetchFeed } from "./feed.ts";
import type { FeedItem } from "./feed.ts";

const FEED_URL = process.env.FEED_URL ?? "https://news.ycombinator.com/rss";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:8000";

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
});

function itemKey(item: FeedItem): string | null {
  return item.id ?? item.url;
}

const posted = new Set<string>();
let firstPoll = true;

async function poll(): Promise<void> {
  const feed = await fetchFeed(FEED_URL);
  const items = [...feed.items].reverse(); // feeds list newest-first

  if (firstPoll) {
    // Don't flood followers with the feed's entire current front page on
    // the very first poll.  Only items that show up in later polls count
    // as "new".
    firstPoll = false;
    for (const item of items) {
      const key = itemKey(item);
      if (key != null) posted.add(key);
    }
    console.log(`Baseline: ${posted.size} existing item(s) from ${FEED_URL}.`);
    return;
  }

  const session = bot.getSession(ORIGIN);
  let publishedCount = 0;
  for (const item of items) {
    const key = itemKey(item);
    if (key == null || posted.has(key)) continue;
    await session.publish(
      text`${item.title ?? "(untitled)"}

${link(item.url ?? FEED_URL)}`,
    );
    posted.add(key);
    publishedCount++;
  }
  console.log(`Posted ${publishedCount} new item(s) from ${FEED_URL}.`);
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
~~~~

The very first poll only records what's already in the feed; it doesn't
publish any of it. Without that check, the bot's first run would dump the
feed's entire current front page onto its followers the moment it started,
which is not what “new entries” should mean. Only items that show up in a
*later* poll count as new.

`pollOnce()` wraps the actual polling logic with a `polling` flag so a slow
fetch can't overlap with the next scheduled tick. `setInterval()` doesn't
wait for its callback to finish before scheduling the next one, so without
this guard, a feed request that takes longer than `POLL_INTERVAL_MS` could
run two polls at once, each one publishing the same items.

`POLL_INTERVAL_MS` gets parsed once at startup and checked for being a
finite, positive number. An unset or malformed value falling through to
`setInterval(fn, NaN)` doesn't error; it just runs on close to every tick of
the event loop, hammering the feed. Better to fail loudly at startup than
silently at runtime.

`FEED_URL` defaults to Hacker News's front-page feed. Any RSS, Atom, or RDF
feed works, but one that changes often is worth using while you're testing:
it means not having to wait long to see the bot actually post something.

### Running the bot

Export the bot as the default export, the same way *Getting started*
does, and run it:

::: code-group

~~~~ bash [Deno]
deno serve --allow-net --allow-env --watch bot.ts
~~~~

~~~~ bash [Node.js]
npx srvx serve --port 8000 --entry ./bot.ts
~~~~

:::

The console should show a baseline count within a few seconds, then, once
`POLL_INTERVAL_MS` has passed, either `Posted 0 new item(s)` or an actual
post if the feed picked up something new in the meantime. If you want to see
a real post without waiting ten minutes, set a shorter interval for now:

~~~~ bash
POLL_INTERVAL_MS=60000 deno serve --allow-net --allow-env --watch bot.ts
~~~~

> [!TIP]
> [`fedify lookup`][2] resolves any actor or object by URL or handle and
> prints its ActivityPub representation. Running
> `fedify lookup http://localhost:8000/ap/actor/bot` here is a quick way to
> confirm the bot's actor document looks right before going any further.

[2]: https://fedify.dev/cli#fedify-lookup-looking-up-an-activitypub-object

### Replying to mentions

A bot that only posts and never responds feels dead even when it's working.
`onMention` gives it something to say back: which feed it's watching, and
how often it checks.

~~~~ typescript [bot.ts] {3-10,13-19} twoslash
import { createBot, link, MemoryKvStore, text } from "@fedify/botkit";
declare const FEED_URL: string;
declare const POLL_INTERVAL_MS: number;
const bot = createBot<void>({
  username: "rssbot",
  kv: new MemoryKvStore(),
});
// ---cut-before---
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
~~~~

`feedTitle` gets set from the feed's own `<title>` each time `poll()` runs
(add `feedTitle = feed.title;` right after `fetchFeed()` returns), so the
reply always reflects what the bot actually just checked, not a name typed
in once and never updated. Before the first poll completes, it falls back to
printing the feed's URL instead.

`formatInterval()` exists because `POLL_INTERVAL_MS` might be set to
anything from `60000` while testing to the ten-minute default in
production, and “every 600000 milliseconds” is not a sentence a bot should
say to anyone.

### Surviving restarts

There's still a bug in this version, and it only shows up on a restart. If
the bot running against a feed that updates often gets restarted right
after the feed gains a new item but before the next scheduled poll reaches
it, that item never gets posted, and nothing about the failure is visible.
`firstPoll` and `posted` both reset on restart, since they only ever lived
in the process's memory, so the bot treats its very next poll as if it had
never run before. It baselines whatever the feed currently shows, folding
that “new” item into the “already seen” set instead of ever posting it. A
bot that looks like it's working can be quietly dropping posts around every
restart or deploy.

The fix is to keep both the bot's own state and the poller's state on disk.
Two separate SQLite databases, not one:

`bot.db` is entirely [`@fedify/botkit-sqlite`](../concepts/repository.md)'s.
It's where BotKit persists the actor's cryptographic keys, sent activities,
and everything else a `Repository` is responsible for. The bot's own code
never has to know what's inside it, and shouldn't try to.

`app.db` is this project's own schema: which items have already been
posted, so restarts don't forget.

Install *@fedify/botkit-sqlite*:

::: code-group

~~~~ bash [Deno]
deno add jsr:@fedify/botkit-sqlite
~~~~

~~~~ bash [npm]
npm add @fedify/botkit-sqlite
~~~~

~~~~ bash [pnpm]
pnpm add @fedify/botkit-sqlite
~~~~

~~~~ bash [Yarn]
yarn add @fedify/botkit-sqlite
~~~~

:::

`app.db` is opened directly, with Node's built-in `node:sqlite` module:

~~~~ typescript [db.ts] twoslash
// app.db: the feed poller's own state, kept separate from bot.db (which
// belongs entirely to @fedify/botkit-sqlite's SqliteRepository).  For now
// this only tracks which feed items have already been posted, so restarts
// don't forget what's already been seen.
//
// node:sqlite's DatabaseSync API is fully synchronous -- none of the calls
// below need (or accept) an `await`.

import { DatabaseSync } from "node:sqlite";

export function openAppDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS posted_items (
      item_id TEXT PRIMARY KEY,
      posted_at TEXT NOT NULL
    )
  `);
  // A tiny key-value table for state that isn't about a specific item.
  // Whether the very first poll has happened lives here instead of being
  // inferred from posted_items, since a feed that happens to be empty (or
  // whose items lack a usable id/url) on that first poll would otherwise
  // never count as baselined.
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  return db;
}

export function isBaselined(db: DatabaseSync): boolean {
  return (
    db.prepare("SELECT 1 FROM app_meta WHERE key = 'baselined'").get() != null
  );
}

export function markBaselined(db: DatabaseSync): void {
  db.prepare(
    "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('baselined', '1')",
  ).run();
}

export function isPosted(db: DatabaseSync, itemId: string): boolean {
  return (
    db.prepare("SELECT 1 FROM posted_items WHERE item_id = ?").get(
      itemId,
    ) != null
  );
}

export function markPosted(db: DatabaseSync, itemId: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO posted_items (item_id, posted_at) VALUES (?, ?)",
  ).run(itemId, new Date().toISOString());
}
~~~~

> [!NOTE]
> On Node.js versions before `node:sqlite` was promoted out of its
> experimental flag (22.13.0 and 23.4.0), you'll see an
> `ExperimentalWarning: SQLite is an experimental feature` line at startup.
> That's expected; the module still works.

`isBaselined()` is checked separately from `posted_items` on purpose. Using
`posted_items`'s row count to answer “has the first poll happened yet”
would work almost all the time, except when a feed happens to return zero
items, or only items without a usable `id`/`url`, on that very first poll.
`app_meta` tracks the milestone itself, independent of how many items
happened to be markable when it was reached.

`bot.ts` now creates both databases and swaps `posted`/`firstPoll` for the
persisted equivalents:

~~~~ typescript [bot.ts] {8-9,17,21,30,45,53-54,57,60,64} twoslash
// @noErrors: 2307
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

declare const POLL_INTERVAL_MS: number;

const bot = createBot<void>({
  username: "rssbot",
  name: "RSS Bot",
  summary: text`I watch ${link(FEED_URL)} and post new entries here.`,
  kv: new MemoryKvStore(),
  queue: new InProcessMessageQueue(),
  repository: new SqliteRepository({ path: "./data/bot.db" }),
});

const appDb = openAppDb("./data/app.db");

function itemKey(item: FeedItem): string | null {
  return item.id ?? item.url;
}

let feedTitle: string | null = null;

async function poll(): Promise<void> {
  const feed = await fetchFeed(FEED_URL);
  feedTitle = feed.title;
  const items = [...feed.items].reverse(); // feeds list newest-first

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
~~~~

Both database files need somewhere to live, and Deno's permission model is a
good reason to keep them out of the project root: `mkdirSync("./data", ...)`
creates a dedicated directory for them, so the process only needs read and
write access to that one path instead of the whole filesystem.

Run the bot again with the wider permissions this now needs:

::: code-group

~~~~ bash [Deno]
deno serve --allow-net --allow-env --allow-read=./data --allow-write=./data --watch bot.ts
~~~~

~~~~ bash [Node.js]
npx srvx serve --port 8000 --entry ./bot.ts
~~~~

:::

Restart it the same way as before, right after a new item lands. This time
it shows up in the next poll instead of disappearing into the baseline.

### Going live

So far the bot has only had to work on `localhost`. Other fediverse servers
need a public address to reach it at.

Tunneling services solve the “public address” half without requiring a
server of your own yet. Since they act as an L7 reverse proxy in front of
the bot, turn on
[`behindProxy`](../concepts/bot.md#createbotoptions-behindproxy) so it trusts
the `X-Forwarded-*` headers they add, and read it from an environment variable
so local development and a tunneled run can use the same code:

~~~~ typescript twoslash
// @noErrors: 2345
import { createBot } from "@fedify/botkit";

const BEHIND_PROXY = process.env.BEHIND_PROXY?.trim()?.toLowerCase() ===
  "true";

const bot = createBot<void>({
  // Omitted other options for brevity
  behindProxy: BEHIND_PROXY,
});
~~~~

Then bring up a tunnel. [`fedify tunnel`][3] is the one used throughout the
rest of this tutorial, but any of these work the same way if you'd rather
use a service you're already set up with:

::: code-group

~~~~ bash [fedify tunnel]
fedify tunnel 8000
~~~~

~~~~ bash [ngrok]
ngrok http 8000
~~~~

~~~~ bash [Tailscale Funnel]
tailscale funnel 8000
~~~~

~~~~ bash [Cloudflare Tunnel]
cloudflared tunnel --url http://localhost:8000
~~~~

:::

`fedify tunnel` prints a public hostname once it's up:

~~~~
✔ Your local server at 8000 is now publicly accessible:

https://c4d3933be87bc2.lhr.life/

Press ^C to close the tunnel.
~~~~

Run the bot once more, this time with `ORIGIN` and `BEHIND_PROXY` pointed at
that address:[^1]

::: code-group

~~~~ bash [Deno]
ORIGIN=https://c4d3933be87bc2.lhr.life BEHIND_PROXY=true \
  deno serve --allow-net --allow-env --allow-read=./data --allow-write=./data --watch bot.ts
~~~~

~~~~ bash [Node.js]
ORIGIN=https://c4d3933be87bc2.lhr.life BEHIND_PROXY=true \
  npx srvx serve --port 8000 --entry ./bot.ts
~~~~

:::

Visit that address in a browser and the bot's own profile page should
render:

![The bot's web-rendered profile page, showing its name, handle, summary,
and a follower/post count of zero](./rss-bot/01-bot-profile.png)

[^1]: The hostname will be different in your case, and depends on which
      tunneling service you used.

[3]: https://fedify.dev/cli#fedify-tunnel-exposing-a-local-http-server-to-the-public-internet

### Testing with ActivityPub.Academy

[ActivityPub.Academy] gives you an ephemeral Mastodon account in a few
seconds, good for exactly this: following and mentioning a bot and watching
what comes back. Accounts are deleted after a day, so there's nothing to
clean up afterward.

Sign up, then search for the bot by its fediverse handle:
`@rssbot@c4d3933be87bc2.lhr.life`, substituting your own tunnel's hostname.

![Searching for the bot's handle on ActivityPub.Academy, with the bot
appearing as a search result](./rss-bot/02-academy-search.png)

Open the result and click *Follow*:

![The bot's profile on ActivityPub.Academy, with a Follow button in the
top-right corner](./rss-bot/03-academy-profile.png)

![The same profile after following, now showing “1 Follower” and an
Unfollow button](./rss-bot/04-academy-followed.png)

Then mention it:

~~~~
Hey @rssbot@c4d3933be87bc2.lhr.life, what are you up to?
~~~~

The reply arrives within a few seconds:

![A thread showing the mention and the bot's reply: “I'm watching Hacker
News and check for new posts every 2
minutes.”](./rss-bot/05-academy-mention-reply.png)

The next time the bot's poll picks up a genuinely new item, it shows up in
the timeline like any other post:

![The home timeline on ActivityPub.Academy, showing a freshly posted item
from the bot above its earlier mention
reply](./rss-bot/06-academy-timeline-post.png)

[ActivityPub.Academy]: https://activitypub.academy/
