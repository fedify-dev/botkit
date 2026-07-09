// app.db: the feed poller's own state, kept separate from bot.db (which
// belongs entirely to @fedify/botkit-sqlite's SqliteRepository).
//
// node:sqlite's DatabaseSync API is fully synchronous -- none of the calls
// below need (or accept) an `await`.
//
// A feed's `identifier` is its opaque, immutable key: it's baked into the
// actor URI once federated, so it must never be derived from anything that
// could change (the feed's URL, its title).  `slug` is the human-readable
// part of the handle, mapped to and from `identifier` via mapUsername.

import { DatabaseSync } from "node:sqlite";

export interface FeedRow {
  readonly identifier: string;
  readonly url: string;
  readonly slug: string;
  readonly title: string | null;
  readonly baselined: boolean;
}

function toFeedRow(row: Record<string, unknown>): FeedRow {
  return {
    identifier: row.identifier as string,
    url: row.url as string,
    slug: row.slug as string,
    title: row.title as string | null,
    baselined: (row.baselined as number) !== 0,
  };
}

export function openAppDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      identifier TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT,
      baselined INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  migrateLegacyPostedItems(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS posted_items (
      feed_identifier TEXT NOT NULL,
      item_id TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      PRIMARY KEY (feed_identifier, item_id)
    )
  `);
  return db;
}

// Part 1's app.db had posted_items(item_id, posted_at), with no concept of
// which feed an item belonged to, since there was only ever one.  Its rows
// are carried forward here under the "bot" identifier, the only identifier
// that could have posted them, before CREATE TABLE IF NOT EXISTS in
// openAppDb() would otherwise leave the old (incompatible) table in place.
function migrateLegacyPostedItems(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(posted_items)").all() as {
    readonly name: string;
  }[];
  const isLegacy = columns.length > 0 &&
    !columns.some((column) => column.name === "feed_identifier");
  if (!isLegacy) return;
  db.exec("ALTER TABLE posted_items RENAME TO posted_items_legacy");
  db.exec(`
    CREATE TABLE posted_items (
      feed_identifier TEXT NOT NULL,
      item_id TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      PRIMARY KEY (feed_identifier, item_id)
    )
  `);
  db.exec(`
    INSERT INTO posted_items (feed_identifier, item_id, posted_at)
    SELECT 'bot', item_id, posted_at FROM posted_items_legacy
  `);
  db.exec("DROP TABLE posted_items_legacy");
}

function slugify(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/\./g, "-");
}

export function getFeedByIdentifier(
  db: DatabaseSync,
  identifier: string,
): FeedRow | undefined {
  const row = db.prepare("SELECT * FROM feeds WHERE identifier = ?").get(
    identifier,
  );
  return row == null ? undefined : toFeedRow(row);
}

export function getFeedBySlug(
  db: DatabaseSync,
  slug: string,
): FeedRow | undefined {
  const row = db.prepare("SELECT * FROM feeds WHERE slug = ?").get(slug);
  return row == null ? undefined : toFeedRow(row);
}

export function getFeedByUrl(
  db: DatabaseSync,
  url: string,
): FeedRow | undefined {
  const row = db.prepare("SELECT * FROM feeds WHERE url = ?").get(url);
  return row == null ? undefined : toFeedRow(row);
}

export function listFeeds(db: DatabaseSync): readonly FeedRow[] {
  const rows = db.prepare("SELECT * FROM feeds").all();
  return rows.map(toFeedRow);
}

// Used once, at startup, to carry an existing single-bot deployment's feed
// forward as a row here.  A no-op on every run after the first, since
// `identifier` is the primary key.
export function seedFeed(
  db: DatabaseSync,
  feed: { identifier: string; url: string; slug: string },
): void {
  db.prepare(
    "INSERT OR IGNORE INTO feeds (identifier, url, slug, created_at) VALUES (?, ?, ?, ?)",
  ).run(feed.identifier, feed.url, feed.slug, new Date().toISOString());
  migrateLegacyBaselined(db, feed.identifier);
}

// Part 1's app.db tracked "has the first poll happened yet" in a separate
// app_meta table, since there was only one feed to ask that about.  Once
// this feed's row exists (just above), that flag is carried onto it and
// app_meta is dropped; a no-op on every run after the first, since app_meta
// won't exist anymore to check.
function migrateLegacyBaselined(db: DatabaseSync, identifier: string): void {
  const hasAppMeta = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'",
  ).get() != null;
  if (!hasAppMeta) return;
  const wasBaselined = db.prepare(
    "SELECT 1 FROM app_meta WHERE key = 'baselined'",
  ).get() != null;
  if (wasBaselined) markFeedBaselined(db, identifier);
  db.exec("DROP TABLE app_meta");
}

// Registers a newly mentioned feed URL under a fresh, opaque identifier.
// The identifier is never derived from the URL or title, since either can
// change after the fact; the slug (the human-readable handle) is, and gets
// a numeric suffix if it collides with one already in use.
export function addFeed(db: DatabaseSync, url: string): FeedRow {
  const baseSlug = slugify(url);
  let slug = baseSlug;
  for (let suffix = 2; getFeedBySlug(db, slug) != null; suffix++) {
    slug = `${baseSlug}-${suffix}`;
  }
  const identifier = `feed_${
    crypto.randomUUID().replace(/-/g, "").slice(0, 12)
  }`;
  db.prepare(
    "INSERT INTO feeds (identifier, url, slug, created_at) VALUES (?, ?, ?, ?)",
  ).run(identifier, url, slug, new Date().toISOString());
  return { identifier, url, slug, title: null, baselined: false };
}

export function updateFeedTitle(
  db: DatabaseSync,
  identifier: string,
  title: string,
): void {
  db.prepare("UPDATE feeds SET title = ? WHERE identifier = ?").run(
    title,
    identifier,
  );
}

export function markFeedBaselined(db: DatabaseSync, identifier: string): void {
  db.prepare("UPDATE feeds SET baselined = 1 WHERE identifier = ?").run(
    identifier,
  );
}

export function isPosted(
  db: DatabaseSync,
  feedIdentifier: string,
  itemId: string,
): boolean {
  return (
    db.prepare(
      "SELECT 1 FROM posted_items WHERE feed_identifier = ? AND item_id = ?",
    ).get(feedIdentifier, itemId) != null
  );
}

export function markPosted(
  db: DatabaseSync,
  feedIdentifier: string,
  itemId: string,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO posted_items (feed_identifier, item_id, posted_at) VALUES (?, ?, ?)",
  ).run(feedIdentifier, itemId, new Date().toISOString());
}
