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
