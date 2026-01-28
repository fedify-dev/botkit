// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2025 Hong Minhee <https://hongminhee.org/>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
import type {
  Repository,
  RepositoryGetFollowersOptions,
  RepositoryGetMessagesOptions,
  Uuid,
} from "@fedify/botkit/repository";
import { exportJwk, importJwk } from "@fedify/fedify/sig";
import {
  Activity,
  type Actor,
  Announce,
  Create,
  Follow,
  isActor,
  Object,
} from "@fedify/fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { DatabaseSync } from "node:sqlite";

const logger = getLogger(["botkit", "sqlite"]);

/**
 * Options for creating a SQLite repository.
 * @since 0.3.0
 */
export interface SqliteRepositoryOptions {
  /**
   * The path to the SQLite database file.
   * If not provided, an in-memory database will be used.
   */
  readonly path?: string;

  /**
   * Whether to enable Write-Ahead Logging (WAL) mode.
   * @default true
   */
  readonly wal?: boolean;

  /**
   * The bot identifier to scope the repository to.
   * When provided, all data will be scoped to this bot identifier,
   * allowing multiple bots to share the same database.
   *
   * If not provided, the repository will use an empty string as the bot ID,
   * which is suitable for single-bot instances.
   *
   * @default ""
   * @since 0.4.0
   */
  readonly botId?: string;
}

/**
 * A repository for storing bot data using SQLite.
 * @since 0.3.0
 */
export class SqliteRepository implements Repository, Disposable {
  private readonly db: DatabaseSync;
  private readonly botId: string;

  /**
   * Creates a new SQLite repository.
   * @param options The options for creating the repository.
   */
  constructor(options: SqliteRepositoryOptions = {}) {
    const { path = ":memory:", wal = true, botId = "" } = options;

    this.db = new DatabaseSync(path);
    this.botId = botId;

    // Enable foreign key constraints
    this.db.exec("PRAGMA foreign_keys = ON;");

    if (wal && path !== ":memory:") {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }

    this.initializeTables();
  }

  [Symbol.dispose]() {
    this.close();
  }

  /**
   * Closes the database connection.
   */
  close(): void {
    this.db.close();
  }

  private initializeTables(): void {
    // Key pairs table (with bot_id for multi-bot support)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS key_pairs (
        id INTEGER PRIMARY KEY,
        bot_id TEXT NOT NULL DEFAULT '',
        private_key_jwk TEXT NOT NULL,
        public_key_jwk TEXT NOT NULL
      )
    `);

    // Add bot_id column if it doesn't exist (migration)
    this.migrateAddBotIdColumn("key_pairs");

    // Create index on bot_id for key_pairs
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_key_pairs_bot_id ON key_pairs(bot_id)
    `);

    // Messages table (with bot_id for multi-bot support)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT NOT NULL,
        bot_id TEXT NOT NULL DEFAULT '',
        activity_json TEXT NOT NULL,
        published INTEGER,
        PRIMARY KEY (id, bot_id)
      )
    `);

    // Add bot_id column if it doesn't exist (migration)
    this.migrateAddBotIdColumn("messages");

    // Create index on published timestamp for efficient ordering
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_bot_published
      ON messages(bot_id, published)
    `);

    // Followers table (with bot_id for multi-bot support)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS followers (
        follower_id TEXT NOT NULL,
        bot_id TEXT NOT NULL DEFAULT '',
        actor_json TEXT NOT NULL,
        PRIMARY KEY (follower_id, bot_id)
      )
    `);

    // Add bot_id column if it doesn't exist (migration)
    this.migrateAddBotIdColumn("followers");

    // Follow requests mapping table (with bot_id for multi-bot support)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS follow_requests (
        follow_request_id TEXT NOT NULL,
        bot_id TEXT NOT NULL DEFAULT '',
        follower_id TEXT NOT NULL,
        PRIMARY KEY (follow_request_id, bot_id)
      )
    `);

    // Add bot_id column if it doesn't exist (migration)
    this.migrateAddBotIdColumn("follow_requests");

    // Sent follows table (with bot_id for multi-bot support)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sent_follows (
        id TEXT NOT NULL,
        bot_id TEXT NOT NULL DEFAULT '',
        follow_json TEXT NOT NULL,
        PRIMARY KEY (id, bot_id)
      )
    `);

    // Add bot_id column if it doesn't exist (migration)
    this.migrateAddBotIdColumn("sent_follows");

    // Followees table (with bot_id for multi-bot support)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS followees (
        followee_id TEXT NOT NULL,
        bot_id TEXT NOT NULL DEFAULT '',
        follow_json TEXT NOT NULL,
        PRIMARY KEY (followee_id, bot_id)
      )
    `);

    // Add bot_id column if it doesn't exist (migration)
    this.migrateAddBotIdColumn("followees");

    // Poll votes table (with bot_id for multi-bot support)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS poll_votes (
        message_id TEXT NOT NULL,
        bot_id TEXT NOT NULL DEFAULT '',
        voter_id TEXT NOT NULL,
        option TEXT NOT NULL,
        PRIMARY KEY (message_id, bot_id, voter_id, option)
      )
    `);

    // Add bot_id column if it doesn't exist (migration)
    this.migrateAddBotIdColumn("poll_votes");

    // Create index for efficient vote counting
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_poll_votes_bot_message_option
      ON poll_votes(bot_id, message_id, option)
    `);
  }

  /**
   * Migrates a table to add bot_id column if it doesn't exist.
   * This is for backward compatibility with existing databases.
   */
  private migrateAddBotIdColumn(tableName: string): void {
    try {
      const stmt = this.db.prepare(
        `SELECT COUNT(*) as count FROM pragma_table_info('${tableName}') WHERE name = 'bot_id'`,
      );
      const row = stmt.get() as { count: number };
      if (row.count === 0) {
        // bot_id column doesn't exist, add it
        this.db.exec(
          `ALTER TABLE ${tableName} ADD COLUMN bot_id TEXT NOT NULL DEFAULT ''`,
        );
        logger.info(
          `Migrated table ${tableName} to add bot_id column for multi-bot support`,
        );
      }
    } catch {
      // Table might have been just created with bot_id, ignore
    }
  }

  async setKeyPairs(keyPairs: CryptoKeyPair[]): Promise<void> {
    const deleteStmt = this.db.prepare(
      "DELETE FROM key_pairs WHERE bot_id = ?",
    );
    const insertStmt = this.db.prepare(`
      INSERT INTO key_pairs (bot_id, private_key_jwk, public_key_jwk)
      VALUES (?, ?, ?)
    `);

    this.db.exec("BEGIN TRANSACTION");
    try {
      deleteStmt.run(this.botId);

      for (const keyPair of keyPairs) {
        const privateJwk = await exportJwk(keyPair.privateKey);
        const publicJwk = await exportJwk(keyPair.publicKey);
        insertStmt.run(
          this.botId,
          JSON.stringify(privateJwk),
          JSON.stringify(publicJwk),
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async getKeyPairs(): Promise<CryptoKeyPair[] | undefined> {
    const stmt = this.db.prepare(`
      SELECT private_key_jwk, public_key_jwk FROM key_pairs WHERE bot_id = ?
    `);
    const rows = stmt.all(this.botId) as Array<{
      private_key_jwk: string;
      public_key_jwk: string;
    }>;

    if (rows.length === 0) return undefined;

    const keyPairs: CryptoKeyPair[] = [];
    for (const row of rows) {
      const privateJwk = JSON.parse(row.private_key_jwk);
      const publicJwk = JSON.parse(row.public_key_jwk);

      keyPairs.push({
        privateKey: await importJwk(privateJwk, "private"),
        publicKey: await importJwk(publicJwk, "public"),
      });
    }

    return keyPairs;
  }

  async addMessage(id: Uuid, activity: Create | Announce): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, bot_id, activity_json, published)
      VALUES (?, ?, ?, ?)
    `);

    const activityJson = JSON.stringify(
      await activity.toJsonLd({ format: "compact" }),
    );
    const published = activity.published?.epochMilliseconds ?? null;

    stmt.run(id, this.botId, activityJson, published);
  }

  async updateMessage(
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    const selectStmt = this.db.prepare(`
      SELECT activity_json FROM messages WHERE id = ? AND bot_id = ?
    `);
    const row = selectStmt.get(id, this.botId) as
      | { activity_json: string }
      | undefined;

    if (!row) return false;

    const activityData = JSON.parse(row.activity_json);
    const activity = await Activity.fromJsonLd(activityData);

    if (!(activity instanceof Create || activity instanceof Announce)) {
      return false;
    }

    const newActivity = await updater(activity);
    if (newActivity == null) return false;

    const updateStmt = this.db.prepare(`
      UPDATE messages
      SET activity_json = ?, published = ?
      WHERE id = ? AND bot_id = ?
    `);

    const newActivityJson = JSON.stringify(
      await newActivity.toJsonLd({ format: "compact" }),
    );
    const published = newActivity.published?.epochMilliseconds ?? null;

    updateStmt.run(newActivityJson, published, id, this.botId);
    return true;
  }

  async removeMessage(id: Uuid): Promise<Create | Announce | undefined> {
    const selectStmt = this.db.prepare(`
      SELECT activity_json FROM messages WHERE id = ? AND bot_id = ?
    `);
    const row = selectStmt.get(id, this.botId) as
      | { activity_json: string }
      | undefined;

    if (!row) return undefined;

    const deleteStmt = this.db.prepare(`
      DELETE FROM messages WHERE id = ? AND bot_id = ?
    `);
    deleteStmt.run(id, this.botId);

    try {
      const activityData = JSON.parse(row.activity_json);
      const activity = await Activity.fromJsonLd(activityData);

      if (activity instanceof Create || activity instanceof Announce) {
        return activity;
      }
    } catch (error) {
      logger.warn("Failed to parse removed message activity", { id, error });
    }

    return undefined;
  }

  async *getMessages(
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    const { order = "newest", until, since, limit } = options;

    let sql = "SELECT activity_json FROM messages WHERE bot_id = ?";
    const params: (number | string)[] = [this.botId];

    if (since != null) {
      sql += " AND published >= ?";
      params.push(since.epochMilliseconds);
    }

    if (until != null) {
      sql += " AND published <= ?";
      params.push(until.epochMilliseconds);
    }

    sql += order === "oldest"
      ? " ORDER BY published ASC"
      : " ORDER BY published DESC";

    if (limit != null) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<{ activity_json: string }>;

    for (const row of rows) {
      try {
        const activityData = JSON.parse(row.activity_json);
        const activity = await Activity.fromJsonLd(activityData);

        if (activity instanceof Create || activity instanceof Announce) {
          yield activity;
        }
      } catch (error) {
        logger.warn("Failed to parse message activity", { error });
        continue;
      }
    }
  }

  async getMessage(id: Uuid): Promise<Create | Announce | undefined> {
    const stmt = this.db.prepare(`
      SELECT activity_json FROM messages WHERE id = ? AND bot_id = ?
    `);
    const row = stmt.get(id, this.botId) as
      | { activity_json: string }
      | undefined;

    if (!row) return undefined;

    try {
      const activityData = JSON.parse(row.activity_json);
      const activity = await Activity.fromJsonLd(activityData);

      if (activity instanceof Create || activity instanceof Announce) {
        return activity;
      }
    } catch (error) {
      logger.warn("Failed to parse message activity", { id, error });
    }

    return undefined;
  }

  countMessages(): Promise<number> {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE bot_id = ?",
    );
    const row = stmt.get(this.botId) as { count: number };
    return Promise.resolve(row.count);
  }

  async addFollower(followRequestId: URL, follower: Actor): Promise<void> {
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }

    const followerJson = JSON.stringify(
      await follower.toJsonLd({ format: "compact" }),
    );

    const insertFollowerStmt = this.db.prepare(`
      INSERT OR REPLACE INTO followers (follower_id, bot_id, actor_json)
      VALUES (?, ?, ?)
    `);

    const insertRequestStmt = this.db.prepare(`
      INSERT OR REPLACE INTO follow_requests (follow_request_id, bot_id, follower_id)
      VALUES (?, ?, ?)
    `);

    this.db.exec("BEGIN TRANSACTION");
    try {
      insertFollowerStmt.run(follower.id.href, this.botId, followerJson);
      insertRequestStmt.run(followRequestId.href, this.botId, follower.id.href);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async removeFollower(
    followRequestId: URL,
    actorId: URL,
  ): Promise<Actor | undefined> {
    // Check if the follow request exists and matches the actor
    const checkStmt = this.db.prepare(`
      SELECT fr.follower_id, f.actor_json
      FROM follow_requests fr
      JOIN followers f ON fr.follower_id = f.follower_id AND fr.bot_id = f.bot_id
      WHERE fr.follow_request_id = ? AND fr.bot_id = ? AND fr.follower_id = ?
    `);

    const row = checkStmt.get(followRequestId.href, this.botId, actorId.href) as
      | {
        follower_id: string;
        actor_json: string;
      }
      | undefined;

    if (!row) return undefined;

    // Remove the follower and follow request
    const deleteRequestStmt = this.db.prepare(`
      DELETE FROM follow_requests WHERE follow_request_id = ? AND bot_id = ?
    `);

    const deleteFollowerStmt = this.db.prepare(`
      DELETE FROM followers WHERE follower_id = ? AND bot_id = ?
    `);

    this.db.exec("BEGIN TRANSACTION");
    try {
      deleteRequestStmt.run(followRequestId.href, this.botId);
      deleteFollowerStmt.run(actorId.href, this.botId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    try {
      const actorData = JSON.parse(row.actor_json);
      const actor = await Object.fromJsonLd(actorData);

      if (isActor(actor)) {
        return actor;
      }
    } catch (error) {
      logger.warn("Failed to parse removed follower actor", { error });
    }

    return undefined;
  }

  hasFollower(followerId: URL): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT 1 FROM followers WHERE follower_id = ? AND bot_id = ?
    `);
    const row = stmt.get(followerId.href, this.botId);
    return Promise.resolve(row != null);
  }

  async *getFollowers(
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    const { offset = 0, limit } = options;

    let sql =
      "SELECT actor_json FROM followers WHERE bot_id = ? ORDER BY follower_id";
    const params: (string | number)[] = [this.botId];

    if (limit != null) {
      sql += " LIMIT ? OFFSET ?";
      params.push(limit, offset);
    } else if (offset > 0) {
      sql += " LIMIT -1 OFFSET ?";
      params.push(offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as { actor_json: string }[];

    for (const row of rows) {
      try {
        const actorData = JSON.parse(row.actor_json);
        const actor = await Object.fromJsonLd(actorData);

        if (isActor(actor)) {
          yield actor;
        }
      } catch (error) {
        logger.warn("Failed to parse follower actor", { error });
        continue;
      }
    }
  }

  countFollowers(): Promise<number> {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM followers WHERE bot_id = ?",
    );
    const row = stmt.get(this.botId) as { count: number };
    return Promise.resolve(row.count);
  }

  async addSentFollow(id: Uuid, follow: Follow): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sent_follows (id, bot_id, follow_json)
      VALUES (?, ?, ?)
    `);

    const followJson = JSON.stringify(
      await follow.toJsonLd({ format: "compact" }),
    );

    stmt.run(id, this.botId, followJson);
  }

  async removeSentFollow(id: Uuid): Promise<Follow | undefined> {
    const follow = await this.getSentFollow(id);
    if (follow == null) return undefined;

    const stmt = this.db.prepare(
      "DELETE FROM sent_follows WHERE id = ? AND bot_id = ?",
    );
    stmt.run(id, this.botId);

    return follow;
  }

  async getSentFollow(id: Uuid): Promise<Follow | undefined> {
    const stmt = this.db.prepare(`
      SELECT follow_json FROM sent_follows WHERE id = ? AND bot_id = ?
    `);
    const row = stmt.get(id, this.botId) as { follow_json: string } | undefined;

    if (!row) return undefined;

    try {
      const followData = JSON.parse(row.follow_json);
      return await Follow.fromJsonLd(followData);
    } catch (error) {
      logger.warn("Failed to parse sent follow activity", { id, error });
      return undefined;
    }
  }

  async addFollowee(followeeId: URL, follow: Follow): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO followees (followee_id, bot_id, follow_json)
      VALUES (?, ?, ?)
    `);

    const followJson = JSON.stringify(
      await follow.toJsonLd({ format: "compact" }),
    );

    stmt.run(followeeId.href, this.botId, followJson);
  }

  async removeFollowee(followeeId: URL): Promise<Follow | undefined> {
    const follow = await this.getFollowee(followeeId);
    if (follow == null) return undefined;

    const stmt = this.db.prepare(
      "DELETE FROM followees WHERE followee_id = ? AND bot_id = ?",
    );
    stmt.run(followeeId.href, this.botId);

    return follow;
  }

  async getFollowee(followeeId: URL): Promise<Follow | undefined> {
    const stmt = this.db.prepare(`
      SELECT follow_json FROM followees WHERE followee_id = ? AND bot_id = ?
    `);
    const row = stmt.get(followeeId.href, this.botId) as
      | { follow_json: string }
      | undefined;

    if (!row) return undefined;

    try {
      const followData = JSON.parse(row.follow_json);
      return await Follow.fromJsonLd(followData);
    } catch (error) {
      logger.warn("Failed to parse followee activity", {
        followeeId: followeeId.href,
        error,
      });
      return undefined;
    }
  }

  vote(messageId: Uuid, voterId: URL, option: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO poll_votes (message_id, bot_id, voter_id, option)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(messageId, this.botId, voterId.href, option);
    return Promise.resolve();
  }

  countVoters(messageId: Uuid): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(DISTINCT voter_id) as count
      FROM poll_votes
      WHERE message_id = ? AND bot_id = ?
    `);
    const row = stmt.get(messageId, this.botId) as { count: number };
    return Promise.resolve(row.count);
  }

  countVotes(messageId: Uuid): Promise<Readonly<Record<string, number>>> {
    const stmt = this.db.prepare(`
      SELECT option, COUNT(*) as count
      FROM poll_votes
      WHERE message_id = ? AND bot_id = ?
      GROUP BY option
    `);
    const rows = stmt.all(messageId, this.botId) as Array<{
      option: string;
      count: number;
    }>;

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.option] = row.count;
    }

    return Promise.resolve(result);
  }
}
