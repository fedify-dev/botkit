// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2025–2026 Hong Minhee <https://hongminhee.org/>
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
import {
  ActorScopedRepository,
  type Repository,
  type RepositoryGetFollowersOptions,
  type RepositoryGetMessagesOptions,
  type Uuid,
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
  QuoteAuthorization,
} from "@fedify/vocab";
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
}

/**
 * A repository for storing bot data using SQLite.
 * @since 0.3.0
 */
export class SqliteRepository implements Repository, Disposable {
  private readonly db: DatabaseSync;

  /**
   * Creates a new SQLite repository.
   * @param options The options for creating the repository.
   */
  constructor(options: SqliteRepositoryOptions = {}) {
    const { path = ":memory:", wal = true } = options;

    this.db = new DatabaseSync(path);

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

  private tableExists(table: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `);
    const row = stmt.get(table) as { count: number };
    return row.count > 0;
  }

  private hasBotIdColumn(table: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM pragma_table_info(?)
      WHERE name = 'bot_id'
    `);
    const row = stmt.get(table) as { count: number };
    return row.count > 0;
  }

  private hasColumn(table: string, column: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM pragma_table_info(?)
      WHERE name = ?
    `);
    const row = stmt.get(table, column) as { count: number };
    return row.count > 0;
  }

  /**
   * Rebuilds tables created by \@fedify/botkit-sqlite 0.4 or earlier, which
   * had no `bot_id` column, into the bot-scoped schema.  Existing rows get
   * the empty-string bot ID; use {@link SqliteRepository.migrate} to assign
   * them to a bot actor identifier.
   */
  private rebuildLegacyTables(): void {
    const tables = [
      "key_pairs",
      "messages",
      "followers",
      "follow_requests",
      "sent_follows",
      "followees",
      "quote_authorizations",
      "poll_votes",
    ].filter((table) => this.tableExists(table) && !this.hasBotIdColumn(table));
    if (tables.length < 1) return;
    logger.info(
      "Rebuilding legacy tables without a bot_id column: {tables}.",
      { tables },
    );
    // The marker lets migrate() distinguish rows carried over from a legacy
    // database (bot_id = '') from data legitimately stored under an
    // empty-string identifier:
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS botkit_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    // SQLite cannot add a column to a composite primary key, so the tables
    // are rebuilt (create new, copy, drop, rename) in a single transaction.
    // Foreign key enforcement is turned off during the rebuild since
    // follow_requests references followers.
    this.db.exec("PRAGMA foreign_keys = OFF;");
    this.db.exec("BEGIN TRANSACTION");
    try {
      if (tables.includes("key_pairs")) {
        // The primary key does not change; adding the column suffices:
        this.db.exec(`
          ALTER TABLE key_pairs ADD COLUMN bot_id TEXT NOT NULL DEFAULT ''
        `);
      }
      if (tables.includes("messages")) {
        this.db.exec(`
          CREATE TABLE messages_new (
            bot_id TEXT NOT NULL,
            id TEXT NOT NULL,
            activity_json TEXT NOT NULL,
            published INTEGER,
            PRIMARY KEY (bot_id, id)
          )
        `);
        this.db.exec(`
          INSERT INTO messages_new (bot_id, id, activity_json, published)
          SELECT '', id, activity_json, published FROM messages
        `);
        this.db.exec("DROP TABLE messages");
        this.db.exec("ALTER TABLE messages_new RENAME TO messages");
      }
      if (tables.includes("followers")) {
        this.db.exec(`
          CREATE TABLE followers_new (
            bot_id TEXT NOT NULL,
            follower_id TEXT NOT NULL,
            actor_json TEXT NOT NULL,
            PRIMARY KEY (bot_id, follower_id)
          )
        `);
        this.db.exec(`
          INSERT INTO followers_new (bot_id, follower_id, actor_json)
          SELECT '', follower_id, actor_json FROM followers
        `);
        this.db.exec("DROP TABLE followers");
        this.db.exec("ALTER TABLE followers_new RENAME TO followers");
      }
      if (tables.includes("follow_requests")) {
        this.db.exec(`
          CREATE TABLE follow_requests_new (
            bot_id TEXT NOT NULL,
            follow_request_id TEXT NOT NULL,
            follower_id TEXT NOT NULL,
            PRIMARY KEY (bot_id, follow_request_id),
            FOREIGN KEY (bot_id, follower_id)
              REFERENCES followers(bot_id, follower_id)
          )
        `);
        this.db.exec(`
          INSERT INTO follow_requests_new
            (bot_id, follow_request_id, follower_id)
          SELECT '', follow_request_id, follower_id FROM follow_requests
        `);
        this.db.exec("DROP TABLE follow_requests");
        this.db.exec(
          "ALTER TABLE follow_requests_new RENAME TO follow_requests",
        );
      }
      if (tables.includes("sent_follows")) {
        this.db.exec(`
          CREATE TABLE sent_follows_new (
            bot_id TEXT NOT NULL,
            id TEXT NOT NULL,
            follow_json TEXT NOT NULL,
            PRIMARY KEY (bot_id, id)
          )
        `);
        this.db.exec(`
          INSERT INTO sent_follows_new (bot_id, id, follow_json)
          SELECT '', id, follow_json FROM sent_follows
        `);
        this.db.exec("DROP TABLE sent_follows");
        this.db.exec("ALTER TABLE sent_follows_new RENAME TO sent_follows");
      }
      if (tables.includes("followees")) {
        this.db.exec(`
          CREATE TABLE followees_new (
            bot_id TEXT NOT NULL,
            followee_id TEXT NOT NULL,
            follow_json TEXT NOT NULL,
            PRIMARY KEY (bot_id, followee_id)
          )
        `);
        this.db.exec(`
          INSERT INTO followees_new (bot_id, followee_id, follow_json)
          SELECT '', followee_id, follow_json FROM followees
        `);
        this.db.exec("DROP TABLE followees");
        this.db.exec("ALTER TABLE followees_new RENAME TO followees");
      }
      if (tables.includes("quote_authorizations")) {
        this.db.exec(`
          CREATE TABLE quote_authorizations_new (
            bot_id TEXT NOT NULL,
            id TEXT NOT NULL,
            interacting_object TEXT NOT NULL,
            authorization_json TEXT NOT NULL,
            PRIMARY KEY (bot_id, id),
            UNIQUE (bot_id, interacting_object)
          )
        `);
        this.db.exec(`
          INSERT INTO quote_authorizations_new
            (bot_id, id, interacting_object, authorization_json)
          SELECT '', id, interacting_object, authorization_json
          FROM quote_authorizations
        `);
        this.db.exec("DROP TABLE quote_authorizations");
        this.db.exec(
          "ALTER TABLE quote_authorizations_new RENAME TO quote_authorizations",
        );
      }
      if (tables.includes("poll_votes")) {
        this.db.exec(`
          CREATE TABLE poll_votes_new (
            bot_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            voter_id TEXT NOT NULL,
            option TEXT NOT NULL,
            PRIMARY KEY (bot_id, message_id, voter_id, option)
          )
        `);
        this.db.exec(`
          INSERT INTO poll_votes_new (bot_id, message_id, voter_id, option)
          SELECT '', message_id, voter_id, option FROM poll_votes
        `);
        this.db.exec("DROP TABLE poll_votes");
        this.db.exec("ALTER TABLE poll_votes_new RENAME TO poll_votes");
      }
      this.db.exec(`
        INSERT OR REPLACE INTO botkit_metadata (key, value)
        VALUES ('legacy_data', '1')
      `);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.exec("PRAGMA foreign_keys = ON;");
      throw error;
    }
    this.db.exec("PRAGMA foreign_keys = ON;");
    logger.info("Finished rebuilding legacy tables.");
  }

  /**
   * Migrates data stored by \@fedify/botkit-sqlite 0.4 or earlier, which was
   * not scoped by bot actor identifiers, so that it belongs to the given
   * identifier.  Rows carried over from a legacy database have the
   * empty-string bot ID; this method assigns them to the identifier in
   * a single transaction.  It only acts when the database was actually
   * rebuilt from a legacy schema, so data legitimately stored under an
   * empty-string identifier is never touched, and calling it again is
   * a no-op.
   * @param identifier The identifier of the bot actor that adopts the legacy
   *                   data.
   * @since 0.5.0
   */
  migrate(identifier: string): Promise<void> {
    if (!this.tableExists("botkit_metadata")) return Promise.resolve();
    const marker = this.db.prepare(
      "SELECT value FROM botkit_metadata WHERE key = 'legacy_data'",
    ).get() as { value: string } | undefined;
    if (marker == null) return Promise.resolve();
    this.db.exec("BEGIN TRANSACTION");
    // Updating followers and follow_requests rows in tandem temporarily
    // breaks the foreign key between them; defer the check to the commit:
    this.db.exec("PRAGMA defer_foreign_keys = ON");
    try {
      for (
        const table of [
          "key_pairs",
          "messages",
          "followers",
          "follow_requests",
          "sent_follows",
          "followees",
          "quote_authorizations",
          "poll_votes",
        ]
      ) {
        this.db.prepare(`UPDATE ${table} SET bot_id = ? WHERE bot_id = ''`)
          .run(identifier);
      }
      this.db.exec("DELETE FROM botkit_metadata WHERE key = 'legacy_data'");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return Promise.resolve();
  }

  private initializeTables(): void {
    this.rebuildLegacyTables();
    this.db.exec(`CREATE TABLE IF NOT EXISTS bot_successors (
      bot_id TEXT PRIMARY KEY NOT NULL,
      successor_id TEXT NOT NULL
    )`);

    // Key pairs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS key_pairs (
        id INTEGER PRIMARY KEY,
        bot_id TEXT NOT NULL,
        private_key_jwk TEXT NOT NULL,
        public_key_jwk TEXT NOT NULL
      )
    `);

    // Create index on bot_id for efficient per-bot lookup
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_key_pairs_bot_id ON key_pairs(bot_id)
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        bot_id TEXT NOT NULL,
        id TEXT NOT NULL,
        activity_json TEXT NOT NULL,
        published INTEGER,
        PRIMARY KEY (bot_id, id)
      )
    `);

    // Create index on published timestamp for efficient ordering
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_bot_published
      ON messages(bot_id, published)
    `);

    // Followers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS followers (
        bot_id TEXT NOT NULL,
        follower_id TEXT NOT NULL,
        actor_json TEXT NOT NULL,
        PRIMARY KEY (bot_id, follower_id)
      )
    `);

    // Follow requests mapping table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS follow_requests (
        bot_id TEXT NOT NULL,
        follow_request_id TEXT NOT NULL,
        follower_id TEXT NOT NULL,
        PRIMARY KEY (bot_id, follow_request_id),
        FOREIGN KEY (bot_id, follower_id)
          REFERENCES followers(bot_id, follower_id)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_follow_requests_follower
      ON follow_requests(follower_id)
    `);

    // Sent follows table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sent_follows (
        bot_id TEXT NOT NULL,
        id TEXT NOT NULL,
        follow_json TEXT NOT NULL,
        PRIMARY KEY (bot_id, id)
      )
    `);

    // Followees table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS followees (
        bot_id TEXT NOT NULL,
        followee_id TEXT NOT NULL,
        follow_json TEXT NOT NULL,
        PRIMARY KEY (bot_id, followee_id)
      )
    `);

    // Create index for reverse lookup of bots following an actor
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_followees_followee_id
      ON followees(followee_id)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quote_authorizations (
        bot_id TEXT NOT NULL,
        id TEXT NOT NULL,
        interacting_object TEXT NOT NULL,
        authorization_json TEXT NOT NULL,
        PRIMARY KEY (bot_id, id),
        UNIQUE (bot_id, interacting_object)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quote_authorization_refs (
        bot_id TEXT NOT NULL,
        authorization TEXT NOT NULL,
        message_id TEXT NOT NULL,
        attribution TEXT,
        PRIMARY KEY (bot_id, authorization)
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_quote_authorization_refs_authorization
      ON quote_authorization_refs(authorization)
    `);
    if (!this.hasColumn("quote_authorization_refs", "attribution")) {
      this.db.exec(`
        ALTER TABLE quote_authorization_refs ADD COLUMN attribution TEXT
      `);
    }

    // Poll votes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS poll_votes (
        bot_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        voter_id TEXT NOT NULL,
        option TEXT NOT NULL,
        PRIMARY KEY (bot_id, message_id, voter_id, option)
      )
    `);

    // Create index for efficient vote counting
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_poll_votes_bot_message_option
      ON poll_votes(bot_id, message_id, option)
    `);
  }

  /** {@inheritDoc Repository.getSuccessor} */
  async getSuccessor(
    identifier: string,
    signal?: AbortSignal,
  ): Promise<URL | undefined> {
    signal?.throwIfAborted();
    const row = this.db.prepare(
      "SELECT successor_id FROM bot_successors WHERE bot_id = ?",
    ).get(identifier);
    return await Promise.resolve(
      row === undefined ? undefined : new URL(String(row.successor_id)),
    );
  }

  /** {@inheritDoc Repository.setSuccessor} */
  async setSuccessor(
    identifier: string,
    successorId: URL,
    signal?: AbortSignal,
  ): Promise<boolean> {
    signal?.throwIfAborted();
    const href = successorId.href;
    const result = this.db.prepare(
      "INSERT INTO bot_successors (bot_id, successor_id) VALUES (?, ?) ON CONFLICT (bot_id) DO NOTHING",
    ).run(identifier, href);
    return await Promise.resolve(result.changes > 0);
  }

  async setKeyPairs(
    identifier: string,
    keyPairs: CryptoKeyPair[],
  ): Promise<void> {
    const deleteStmt = this.db.prepare(
      "DELETE FROM key_pairs WHERE bot_id = ?",
    );
    const insertStmt = this.db.prepare(`
      INSERT INTO key_pairs (bot_id, private_key_jwk, public_key_jwk)
      VALUES (?, ?, ?)
    `);

    this.db.exec("BEGIN TRANSACTION");
    try {
      deleteStmt.run(identifier);

      for (const keyPair of keyPairs) {
        const privateJwk = await exportJwk(keyPair.privateKey);
        const publicJwk = await exportJwk(keyPair.publicKey);
        insertStmt.run(
          identifier,
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

  async getKeyPairs(identifier: string): Promise<CryptoKeyPair[] | undefined> {
    const stmt = this.db.prepare(`
      SELECT private_key_jwk, public_key_jwk FROM key_pairs
      WHERE bot_id = ? ORDER BY id
    `);
    const rows = stmt.all(identifier) as Array<{
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

  async addMessage(
    identifier: string,
    id: Uuid,
    activity: Create | Announce,
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO messages (bot_id, id, activity_json, published)
      VALUES (?, ?, ?, ?)
    `);

    const activityJson = JSON.stringify(
      await activity.toJsonLd({ format: "compact" }),
    );
    const published = activity.published?.epochMilliseconds ?? null;

    stmt.run(identifier, id, activityJson, published);
  }

  async updateMessage(
    identifier: string,
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    const selectStmt = this.db.prepare(`
      SELECT activity_json FROM messages WHERE bot_id = ? AND id = ?
    `);
    const row = selectStmt.get(identifier, id) as
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
      WHERE bot_id = ? AND id = ?
    `);

    const newActivityJson = JSON.stringify(
      await newActivity.toJsonLd({ format: "compact" }),
    );
    const published = newActivity.published?.epochMilliseconds ?? null;

    updateStmt.run(newActivityJson, published, identifier, id);
    return true;
  }

  async removeMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    const selectStmt = this.db.prepare(`
      SELECT activity_json FROM messages WHERE bot_id = ? AND id = ?
    `);
    const row = selectStmt.get(identifier, id) as
      | { activity_json: string }
      | undefined;

    if (!row) return undefined;

    const deleteStmt = this.db.prepare(`
      DELETE FROM messages WHERE bot_id = ? AND id = ?
    `);
    deleteStmt.run(identifier, id);

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
    identifier: string,
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    const { order = "newest", until, since, limit } = options;

    let sql = "SELECT activity_json FROM messages WHERE bot_id = ?";
    const params: (number | string)[] = [identifier];

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

  async getMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    const stmt = this.db.prepare(`
      SELECT activity_json FROM messages WHERE bot_id = ? AND id = ?
    `);
    const row = stmt.get(identifier, id) as
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

  countMessages(identifier: string): Promise<number> {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE bot_id = ?",
    );
    const row = stmt.get(identifier) as { count: number };
    return Promise.resolve(row.count);
  }

  async addFollower(
    identifier: string,
    followRequestId: URL,
    follower: Actor,
  ): Promise<void> {
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }

    const followerJson = JSON.stringify(
      await follower.toJsonLd({ format: "compact" }),
    );

    const insertFollowerStmt = this.db.prepare(`
      INSERT INTO followers (bot_id, follower_id, actor_json)
      VALUES (?, ?, ?)
      ON CONFLICT(bot_id, follower_id)
      DO UPDATE SET actor_json = excluded.actor_json
    `);

    const insertRequestStmt = this.db.prepare(`
      INSERT INTO follow_requests
        (bot_id, follow_request_id, follower_id)
      VALUES (?, ?, ?)
      ON CONFLICT(bot_id, follow_request_id)
      DO UPDATE SET follower_id = excluded.follower_id
    `);

    const previousFollowerStmt = this.db.prepare(`
      SELECT follower_id
      FROM follow_requests
      WHERE bot_id = ? AND follow_request_id = ?
    `);

    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      const previousRow = previousFollowerStmt.get(
        identifier,
        followRequestId.href,
      ) as
        | { follower_id: string }
        | undefined;
      insertFollowerStmt.run(identifier, follower.id.href, followerJson);
      insertRequestStmt.run(
        identifier,
        followRequestId.href,
        follower.id.href,
      );
      if (
        previousRow != null && previousRow.follower_id !== follower.id.href
      ) {
        this.cleanupFollower(identifier, previousRow.follower_id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async removeFollower(
    identifier: string,
    followRequestId: URL,
    actorId: URL,
  ): Promise<Actor | undefined> {
    const checkStmt = this.db.prepare(`
      SELECT fr.follower_id, f.actor_json
      FROM follow_requests fr
      JOIN followers f
        ON fr.bot_id = f.bot_id AND fr.follower_id = f.follower_id
      WHERE fr.bot_id = ? AND fr.follow_request_id = ? AND fr.follower_id = ?
    `);

    const deleteRequestStmt = this.db.prepare(`
      DELETE FROM follow_requests
      WHERE bot_id = ? AND follow_request_id = ? AND follower_id = ?
    `);

    let row: { follower_id: string; actor_json: string } | undefined;
    let removed = false;
    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      row = checkStmt.get(identifier, followRequestId.href, actorId.href) as
        | { follower_id: string; actor_json: string }
        | undefined;
      if (row == null) {
        this.db.exec("COMMIT");
        return undefined;
      }
      const deleteResult = deleteRequestStmt.run(
        identifier,
        followRequestId.href,
        actorId.href,
      ) as { readonly changes: number };
      if (deleteResult.changes < 1) {
        this.db.exec("COMMIT");
        return undefined;
      }
      removed = this.cleanupFollower(identifier, actorId.href);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    if (!removed || row == null) return undefined;

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

  private cleanupFollower(identifier: string, followerId: string): boolean {
    const deleteFollowerStmt = this.db.prepare(`
      DELETE FROM followers
      WHERE bot_id = ? AND follower_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM follow_requests
          WHERE bot_id = ? AND follower_id = ?
        )
    `);

    const result = deleteFollowerStmt.run(
      identifier,
      followerId,
      identifier,
      followerId,
    ) as {
      readonly changes: number;
    };
    return result.changes > 0;
  }

  hasFollower(identifier: string, followerId: URL): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT 1 FROM followers WHERE bot_id = ? AND follower_id = ?
    `);
    const row = stmt.get(identifier, followerId.href);
    return Promise.resolve(row != null);
  }

  async *getFollowers(
    identifier: string,
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    const { offset = 0, limit } = options;

    let sql =
      "SELECT actor_json FROM followers WHERE bot_id = ? ORDER BY follower_id";
    const params: (number | string)[] = [identifier];

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

  countFollowers(identifier: string): Promise<number> {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM followers WHERE bot_id = ?",
    );
    const row = stmt.get(identifier) as { count: number };
    return Promise.resolve(row.count);
  }

  async addSentFollow(
    identifier: string,
    id: Uuid,
    follow: Follow,
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sent_follows (bot_id, id, follow_json)
      VALUES (?, ?, ?)
    `);

    const followJson = JSON.stringify(
      await follow.toJsonLd({ format: "compact" }),
    );

    stmt.run(identifier, id, followJson);
  }

  async removeSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    const follow = await this.getSentFollow(identifier, id);
    if (follow == null) return undefined;

    const stmt = this.db.prepare(
      "DELETE FROM sent_follows WHERE bot_id = ? AND id = ?",
    );
    stmt.run(identifier, id);

    return follow;
  }

  async getSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    const stmt = this.db.prepare(`
      SELECT follow_json FROM sent_follows WHERE bot_id = ? AND id = ?
    `);
    const row = stmt.get(identifier, id) as
      | { follow_json: string }
      | undefined;

    if (!row) return undefined;

    try {
      const followData = JSON.parse(row.follow_json);
      return await Follow.fromJsonLd(followData);
    } catch (error) {
      logger.warn("Failed to parse sent follow activity", { id, error });
      return undefined;
    }
  }

  async addFollowee(
    identifier: string,
    followeeId: URL,
    follow: Follow,
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO followees (bot_id, followee_id, follow_json)
      VALUES (?, ?, ?)
    `);

    const followJson = JSON.stringify(
      await follow.toJsonLd({ format: "compact" }),
    );

    stmt.run(identifier, followeeId.href, followJson);
  }

  async removeFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    const follow = await this.getFollowee(identifier, followeeId);
    if (follow == null) return undefined;

    const stmt = this.db.prepare(
      "DELETE FROM followees WHERE bot_id = ? AND followee_id = ?",
    );
    stmt.run(identifier, followeeId.href);

    return follow;
  }

  async getFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    const stmt = this.db.prepare(`
      SELECT follow_json FROM followees WHERE bot_id = ? AND followee_id = ?
    `);
    const row = stmt.get(identifier, followeeId.href) as
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

  async *findFollowedBots(followeeId: URL): AsyncIterable<string> {
    const stmt = this.db.prepare(`
      SELECT bot_id FROM followees WHERE followee_id = ? ORDER BY bot_id
    `);
    const rows = stmt.all(followeeId.href) as { bot_id: string }[];
    for (const row of rows) yield row.bot_id;
  }

  async addQuoteAuthorization(
    identifier: string,
    id: Uuid,
    authorization: QuoteAuthorization,
  ): Promise<void> {
    const interactingObject = authorization.interactingObjectId;
    if (interactingObject == null) {
      throw new TypeError(
        "The quote authorization interacting object is missing.",
      );
    }
    const stmt = this.db.prepare(`
      INSERT INTO quote_authorizations
        (bot_id, id, interacting_object, authorization_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(bot_id, interacting_object) DO NOTHING
    `);
    stmt.run(
      identifier,
      id,
      interactingObject.href,
      JSON.stringify(await authorization.toJsonLd({ format: "compact" })),
    );
  }

  async getQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    const stmt = this.db.prepare(`
      SELECT authorization_json FROM quote_authorizations
      WHERE bot_id = ? AND id = ?
    `);
    const row = stmt.get(identifier, id) as
      | { authorization_json: string }
      | undefined;
    return await parseQuoteAuthorizationJson(row?.authorization_json);
  }

  async findQuoteAuthorization(
    identifier: string,
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined> {
    const stmt = this.db.prepare(`
      SELECT authorization_json FROM quote_authorizations
      WHERE bot_id = ? AND interacting_object = ?
    `);
    const row = stmt.get(identifier, interactingObject.href) as
      | { authorization_json: string }
      | undefined;
    return await parseQuoteAuthorizationJson(row?.authorization_json);
  }

  async removeQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    const stmt = this.db.prepare(
      "DELETE FROM quote_authorizations WHERE bot_id = ? AND id = ? " +
        "RETURNING authorization_json",
    );
    const row = stmt.get(identifier, id) as
      | { authorization_json: string }
      | undefined;
    return await parseQuoteAuthorizationJson(row?.authorization_json);
  }

  addQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
    messageId: Uuid,
    attribution?: URL,
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO quote_authorization_refs
        (bot_id, authorization, message_id, attribution)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      identifier,
      authorization.href,
      messageId,
      attribution?.href ?? null,
    );
    return Promise.resolve();
  }

  findQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<Uuid | undefined> {
    const stmt = this.db.prepare(`
      SELECT message_id FROM quote_authorization_refs
      WHERE bot_id = ? AND authorization = ?
    `);
    const row = stmt.get(identifier, authorization.href) as
      | { message_id: Uuid }
      | undefined;
    return Promise.resolve(row?.message_id);
  }

  async *findQuoteAuthorizationReferenceIdentifiers(
    authorization: URL,
  ): AsyncIterable<string> {
    const stmt = this.db.prepare(`
      SELECT bot_id FROM quote_authorization_refs
      WHERE authorization = ? ORDER BY bot_id
    `);
    const rows = stmt.all(authorization.href) as { bot_id: string }[];
    for (const row of rows) yield row.bot_id;
  }

  findQuoteAuthorizationReferenceAttribution(
    identifier: string,
    authorization: URL,
  ): Promise<URL | undefined> {
    const stmt = this.db.prepare(`
      SELECT attribution FROM quote_authorization_refs
      WHERE bot_id = ? AND authorization = ?
    `);
    const row = stmt.get(identifier, authorization.href) as
      | { attribution: string | null }
      | undefined;
    if (row?.attribution == null) return Promise.resolve(undefined);
    try {
      return Promise.resolve(new URL(row.attribution));
    } catch {
      return Promise.resolve(undefined);
    }
  }

  removeQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM quote_authorization_refs
      WHERE bot_id = ? AND authorization = ?
    `);
    stmt.run(identifier, authorization.href);
    return Promise.resolve();
  }

  vote(
    identifier: string,
    messageId: Uuid,
    voterId: URL,
    option: string,
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO poll_votes (bot_id, message_id, voter_id, option)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(identifier, messageId, voterId.href, option);
    return Promise.resolve();
  }

  countVoters(identifier: string, messageId: Uuid): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(DISTINCT voter_id) as count
      FROM poll_votes
      WHERE bot_id = ? AND message_id = ?
    `);
    const row = stmt.get(identifier, messageId) as { count: number };
    return Promise.resolve(row.count);
  }

  countVotes(
    identifier: string,
    messageId: Uuid,
  ): Promise<Readonly<Record<string, number>>> {
    const stmt = this.db.prepare(`
      SELECT option, COUNT(*) as count
      FROM poll_votes
      WHERE bot_id = ? AND message_id = ?
      GROUP BY option
    `);
    const rows = stmt.all(identifier, messageId) as Array<{
      option: string;
      count: number;
    }>;

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.option] = row.count;
    }

    return Promise.resolve(result);
  }

  forIdentifier(identifier: string): ActorScopedRepository {
    return new ActorScopedRepository(this, identifier);
  }
}

async function parseQuoteAuthorizationJson(
  json: string | undefined,
): Promise<QuoteAuthorization | undefined> {
  if (json == null) return undefined;
  try {
    return await QuoteAuthorization.fromJsonLd(JSON.parse(json));
  } catch (error) {
    logger.warn("Failed to parse quote authorization", { error });
    return undefined;
  }
}
