// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
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
import { Temporal, toTemporalInstant } from "@js-temporal/polyfill";
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
import postgres from "postgres";

if (!("Temporal" in globalThis)) {
  Reflect.set(globalThis, "Temporal", Temporal);
}
if (Date.prototype.toTemporalInstant == null) {
  Reflect.set(Date.prototype, "toTemporalInstant", toTemporalInstant);
}

const logger = getLogger(["botkit", "postgres"]);
const schemaNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const followRequestAdvisoryLockNamespace = 0x4254;
const followerAdvisoryLockNamespace = 0x4246;
const schemaUpgradeAdvisoryLockNamespace = 0x424b;

type Queryable = Pick<postgres.Sql, "unsafe">;
type TransactionalQueryable = Queryable & Pick<postgres.Sql, "begin">;
type QueryParameter = postgres.SerializableParameter;

/**
 * Common options for creating a PostgreSQL repository.
 * @since 0.4.0
 */
interface PostgresRepositoryOptionsBase {
  /**
   * The PostgreSQL schema name to use.
   * @default `"botkit"`
   */
  readonly schema?: string;

  /**
   * Whether to use prepared statements for queries.
   * @default true
   */
  readonly prepare?: boolean;
}

/**
 * Options for creating a PostgreSQL repository from an injected client.
 * @since 0.4.0
 */
interface PostgresRepositoryOptionsWithClient
  extends PostgresRepositoryOptionsBase {
  /**
   * A pre-configured PostgreSQL client to use.
   */
  readonly sql: postgres.Sql;

  /**
   * Disallowed when `sql` is provided.
   */
  readonly url?: never;

  /**
   * Disallowed when `sql` is provided.
   */
  readonly maxConnections?: never;
}

/**
 * Options for creating a PostgreSQL repository from a connection string.
 * @since 0.4.0
 */
interface PostgresRepositoryOptionsWithUrl
  extends PostgresRepositoryOptionsBase {
  /**
   * A PostgreSQL connection string to connect with.
   */
  readonly url: string | URL;

  /**
   * Disallowed when `url` is provided.
   */
  readonly sql?: never;

  /**
   * The maximum number of connections for an owned pool.
   */
  readonly maxConnections?: number;
}

/**
 * Options for creating a PostgreSQL repository.
 * @since 0.4.0
 */
export type PostgresRepositoryOptions =
  | PostgresRepositoryOptionsWithClient
  | PostgresRepositoryOptionsWithUrl;

/**
 * Initializes the PostgreSQL schema used by BotKit repositories.
 * @param sql The PostgreSQL client to initialize the schema with.
 * @param schema The PostgreSQL schema name to initialize.
 * @param prepare Whether to use prepared statements for schema queries.
 * @since 0.4.0
 */
export async function initializePostgresRepositorySchema(
  sql: TransactionalQueryable,
  schema = "botkit",
  prepare = true,
): Promise<void> {
  const validatedSchema = validateSchemaName(schema);
  if (!hasTransaction(sql)) {
    throw new TypeError(
      "The PostgreSQL client must support transactions.",
    );
  }
  await sql.begin(async (tx) => {
    await initializePostgresRepositorySchemaInTransaction(
      tx,
      validatedSchema,
      prepare,
    );
  });
}

async function initializePostgresRepositorySchemaInTransaction(
  sql: Queryable,
  validatedSchema: string,
  prepare: boolean,
): Promise<void> {
  await execute(
    sql,
    `SELECT pg_catalog.pg_advisory_xact_lock(
       $1,
       pg_catalog.hashtext($2)
     )`,
    [schemaUpgradeAdvisoryLockNamespace, validatedSchema],
    prepare,
  );
  await execute(
    sql,
    `CREATE SCHEMA IF NOT EXISTS "${validatedSchema}"`,
    [],
    prepare,
  );
  await upgradeLegacySchema(sql, validatedSchema, prepare);
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."botkit_metadata" (
       "key" TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."bot_successors" (
       bot_id TEXT PRIMARY KEY,
       successor_id TEXT NOT NULL
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."key_pairs" (
       bot_id TEXT NOT NULL,
       position INTEGER NOT NULL,
       private_key_jwk JSONB NOT NULL,
       public_key_jwk JSONB NOT NULL,
       PRIMARY KEY (bot_id, position)
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."messages" (
       bot_id TEXT NOT NULL,
       id TEXT NOT NULL,
       activity_json JSONB NOT NULL,
       published BIGINT,
       PRIMARY KEY (bot_id, id)
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE INDEX IF NOT EXISTS "idx_messages_published"
       ON "${validatedSchema}"."messages" (bot_id, published, id)`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."followers" (
       bot_id TEXT NOT NULL,
       follower_id TEXT NOT NULL,
       actor_json JSONB NOT NULL,
       PRIMARY KEY (bot_id, follower_id)
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."follow_requests" (
       bot_id TEXT NOT NULL,
       follow_request_id TEXT NOT NULL,
       follower_id TEXT NOT NULL,
       PRIMARY KEY (bot_id, follow_request_id),
       FOREIGN KEY (bot_id, follower_id)
         REFERENCES "${validatedSchema}"."followers" (bot_id, follower_id)
         ON DELETE CASCADE
         DEFERRABLE INITIALLY IMMEDIATE
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE INDEX IF NOT EXISTS "idx_follow_requests_follower"
       ON "${validatedSchema}"."follow_requests" (bot_id, follower_id)`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."sent_follows" (
       bot_id TEXT NOT NULL,
       id TEXT NOT NULL,
       follow_json JSONB NOT NULL,
       PRIMARY KEY (bot_id, id)
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."followees" (
       bot_id TEXT NOT NULL,
       followee_id TEXT NOT NULL,
       follow_json JSONB NOT NULL,
       PRIMARY KEY (bot_id, followee_id)
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE INDEX IF NOT EXISTS "idx_followees_followee_id"
       ON "${validatedSchema}"."followees" (followee_id)`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."quote_authorizations" (
       bot_id TEXT NOT NULL,
       id TEXT NOT NULL,
       interacting_object TEXT NOT NULL,
       authorization_json JSONB NOT NULL,
       PRIMARY KEY (bot_id, id),
       UNIQUE (bot_id, interacting_object)
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."quote_authorization_refs" (
       bot_id TEXT NOT NULL,
       authorization_uri TEXT NOT NULL,
       message_id TEXT NOT NULL,
       attribution_uri TEXT,
       PRIMARY KEY (bot_id, authorization_uri)
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE INDEX IF NOT EXISTS "idx_quote_authorization_refs_authorization"
       ON "${validatedSchema}"."quote_authorization_refs" (authorization_uri)`,
    [],
    prepare,
  );
  await execute(
    sql,
    `ALTER TABLE "${validatedSchema}"."quote_authorization_refs"
       ADD COLUMN IF NOT EXISTS attribution_uri TEXT`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."poll_votes" (
       bot_id TEXT NOT NULL,
       message_id TEXT NOT NULL,
       voter_id TEXT NOT NULL,
       option TEXT NOT NULL,
       PRIMARY KEY (bot_id, message_id, voter_id, option)
     )`,
    [],
    prepare,
  );
  await execute(
    sql,
    `CREATE INDEX IF NOT EXISTS "idx_poll_votes_message_option"
       ON "${validatedSchema}"."poll_votes" (bot_id, message_id, option)`,
    [],
    prepare,
  );
}

const upgradableTables = [
  "key_pairs",
  "messages",
  "followers",
  "follow_requests",
  "sent_follows",
  "followees",
  "quote_authorizations",
  "poll_votes",
] as const;

/**
 * Upgrades tables created by \@fedify/botkit-postgres 0.4, which had no
 * `bot_id` column, into the bot-scoped schema.  Existing rows get the
 * empty-string bot ID; use {@link PostgresRepository.migrate} to assign them
 * to a bot actor identifier.
 *
 * The whole upgrade is sent as a single multi-statement query without
 * parameters, which PostgreSQL executes over the simple query protocol in
 * one implicit transaction on one connection, so it is atomic even when
 * `sql` is a connection pool.
 */
async function upgradeLegacySchema(
  sql: Queryable,
  schema: string,
  prepare: boolean,
): Promise<void> {
  const rows = await execute<{ readonly table_name: string }>(
    sql,
    `SELECT t.table_name
       FROM information_schema.tables t
      WHERE t.table_schema = $1
        AND t.table_name = ANY($2)
        AND NOT EXISTS (
          SELECT 1
            FROM information_schema.columns c
           WHERE c.table_schema = t.table_schema
             AND c.table_name = t.table_name
             AND c.column_name = 'bot_id'
        )`,
    [schema, [...upgradableTables]],
    prepare,
  );
  if (rows.length < 1) return;
  const tables = rows.map((row) => row.table_name);
  logger.info(
    "Upgrading legacy tables without a bot_id column: {tables}.",
    { tables },
  );
  // Multiple processes can start against the same legacy schema at once, so
  // the whole upgrade runs inside one PL/pgSQL block: an advisory lock
  // serializes it, and every table is re-checked under the lock, so the
  // process that lost the race finds nothing left to do.  The detection
  // query above is merely a fast path for already-upgraded schemas.
  const legacyTable = (table: string) =>
    `EXISTS (SELECT 1
        FROM information_schema.tables t
       WHERE t.table_schema = '${schema}' AND t.table_name = '${table}')
     AND NOT EXISTS (SELECT 1
        FROM information_schema.columns c
       WHERE c.table_schema = '${schema}' AND c.table_name = '${table}'
         AND c.column_name = 'bot_id')`;
  const block = `
    DO $botkit_upgrade$
    DECLARE
      upgraded boolean := false;
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        ${schemaUpgradeAdvisoryLockNamespace},
        pg_catalog.hashtext('${schema}')
      );

      IF ${legacyTable("follow_requests")} THEN
        -- The old foreign key referenced followers (follower_id) only; it
        -- has to go away before the followers primary key changes:
        ALTER TABLE "${schema}"."follow_requests"
          DROP CONSTRAINT IF EXISTS "follow_requests_follower_id_fkey";
      END IF;

      IF ${legacyTable("key_pairs")} THEN
        ALTER TABLE "${schema}"."key_pairs"
          ADD COLUMN bot_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE "${schema}"."key_pairs" ALTER COLUMN bot_id DROP DEFAULT;
        ALTER TABLE "${schema}"."key_pairs"
          DROP CONSTRAINT IF EXISTS "key_pairs_pkey";
        ALTER TABLE "${schema}"."key_pairs" ADD PRIMARY KEY (bot_id, position);
        upgraded := true;
      END IF;

      IF ${legacyTable("messages")} THEN
        ALTER TABLE "${schema}"."messages"
          ADD COLUMN bot_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE "${schema}"."messages" ALTER COLUMN bot_id DROP DEFAULT;
        ALTER TABLE "${schema}"."messages"
          DROP CONSTRAINT IF EXISTS "messages_pkey";
        ALTER TABLE "${schema}"."messages" ADD PRIMARY KEY (bot_id, id);
        DROP INDEX IF EXISTS "${schema}"."idx_messages_published";
        upgraded := true;
      END IF;

      IF ${legacyTable("followers")} THEN
        ALTER TABLE "${schema}"."followers"
          ADD COLUMN bot_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE "${schema}"."followers" ALTER COLUMN bot_id DROP DEFAULT;
        ALTER TABLE "${schema}"."followers"
          DROP CONSTRAINT IF EXISTS "followers_pkey";
        ALTER TABLE "${schema}"."followers"
          ADD PRIMARY KEY (bot_id, follower_id);
        upgraded := true;
      END IF;

      IF ${legacyTable("follow_requests")} THEN
        ALTER TABLE "${schema}"."follow_requests"
          ADD COLUMN bot_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE "${schema}"."follow_requests"
          ALTER COLUMN bot_id DROP DEFAULT;
        ALTER TABLE "${schema}"."follow_requests"
          DROP CONSTRAINT IF EXISTS "follow_requests_pkey";
        ALTER TABLE "${schema}"."follow_requests"
          ADD PRIMARY KEY (bot_id, follow_request_id);
        ALTER TABLE "${schema}"."follow_requests"
          ADD FOREIGN KEY (bot_id, follower_id)
          REFERENCES "${schema}"."followers" (bot_id, follower_id)
          ON DELETE CASCADE
          DEFERRABLE INITIALLY IMMEDIATE;
        DROP INDEX IF EXISTS "${schema}"."idx_follow_requests_follower";
        upgraded := true;
      END IF;

      IF ${legacyTable("sent_follows")} THEN
        ALTER TABLE "${schema}"."sent_follows"
          ADD COLUMN bot_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE "${schema}"."sent_follows"
          ALTER COLUMN bot_id DROP DEFAULT;
        ALTER TABLE "${schema}"."sent_follows"
          DROP CONSTRAINT IF EXISTS "sent_follows_pkey";
        ALTER TABLE "${schema}"."sent_follows" ADD PRIMARY KEY (bot_id, id);
        upgraded := true;
      END IF;

      IF ${legacyTable("followees")} THEN
        ALTER TABLE "${schema}"."followees"
          ADD COLUMN bot_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE "${schema}"."followees" ALTER COLUMN bot_id DROP DEFAULT;
        ALTER TABLE "${schema}"."followees"
          DROP CONSTRAINT IF EXISTS "followees_pkey";
        ALTER TABLE "${schema}"."followees"
          ADD PRIMARY KEY (bot_id, followee_id);
        upgraded := true;
      END IF;

      IF ${legacyTable("quote_authorizations")} THEN
        ALTER TABLE "${schema}"."quote_authorizations"
          ADD COLUMN bot_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE "${schema}"."quote_authorizations"
          ALTER COLUMN bot_id DROP DEFAULT;
        ALTER TABLE "${schema}"."quote_authorizations"
          DROP CONSTRAINT IF EXISTS "quote_authorizations_pkey";
        ALTER TABLE "${schema}"."quote_authorizations"
          ADD PRIMARY KEY (bot_id, id);
        ALTER TABLE "${schema}"."quote_authorizations"
          ADD UNIQUE (bot_id, interacting_object);
        upgraded := true;
      END IF;

      IF ${legacyTable("poll_votes")} THEN
        ALTER TABLE "${schema}"."poll_votes"
          ADD COLUMN bot_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE "${schema}"."poll_votes" ALTER COLUMN bot_id DROP DEFAULT;
        ALTER TABLE "${schema}"."poll_votes"
          DROP CONSTRAINT IF EXISTS "poll_votes_pkey";
        ALTER TABLE "${schema}"."poll_votes"
          ADD PRIMARY KEY (bot_id, message_id, voter_id, option);
        DROP INDEX IF EXISTS "${schema}"."idx_poll_votes_message_option";
        upgraded := true;
      END IF;

      IF upgraded THEN
        -- The marker lets migrate() distinguish rows carried over from
        -- a legacy schema (bot_id = '') from data legitimately stored under
        -- an empty-string identifier:
        CREATE TABLE IF NOT EXISTS "${schema}"."botkit_metadata" (
          "key" TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        INSERT INTO "${schema}"."botkit_metadata" ("key", value)
        VALUES ('legacy_data', '1')
        ON CONFLICT ("key") DO NOTHING;
      END IF;
    END
    $botkit_upgrade$
  `;
  // DO blocks cannot be prepared:
  await execute(sql, block, [], false);
  logger.info("Finished upgrading legacy tables.");
}

/**
 * A repository for storing bot data using PostgreSQL.
 * @since 0.4.0
 */
export class PostgresRepository implements Repository, AsyncDisposable {
  readonly sql: postgres.Sql;
  readonly schema: string;
  readonly prepare: boolean;
  private readonly ownsSql: boolean;
  private readonly ready: Promise<void>;

  constructor(options: PostgresRepositoryOptions) {
    this.schema = validateSchemaName(options.schema ?? "botkit");
    this.prepare = options.prepare ?? true;
    if ("sql" in options) {
      if (options.url != null || options.maxConnections != null) {
        throw new TypeError(
          "PostgresRepositoryOptions.sql cannot be combined with PostgresRepositoryOptions.url or PostgresRepositoryOptions.maxConnections.",
        );
      }
      this.ownsSql = false;
      this.sql = options.sql;
    } else {
      if (options.url == null) {
        throw new TypeError(
          "PostgresRepositoryOptions.url must be provided when PostgresRepositoryOptions.sql is absent.",
        );
      }
      this.ownsSql = true;
      const url = typeof options.url === "string"
        ? options.url
        : options.url.href;
      this.sql = postgres(url, {
        max: options.maxConnections,
        onnotice: () => {},
        prepare: this.prepare,
      });
    }
    const ready = initializePostgresRepositorySchema(
      this.sql,
      this.schema,
      this.prepare,
    );
    // Avoid unhandled rejection warnings before a repository method awaits it.
    ready.catch(() => {});
    this.ready = ready;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /**
   * Closes the underlying PostgreSQL connection pool if owned by the
   * repository.
   */
  async close(): Promise<void> {
    try {
      await this.ready;
    } finally {
      if (this.ownsSql) {
        await this.sql.end({ timeout: 5 });
      }
    }
  }

  /** {@inheritDoc Repository.getSuccessor} */
  async getSuccessor(
    identifier: string,
    signal?: AbortSignal,
  ): Promise<URL | undefined> {
    signal?.throwIfAborted();
    await this.ensureReady();
    signal?.throwIfAborted();
    const rows = await this.query<{ readonly successor_id: string }>(
      this.sql,
      `SELECT successor_id FROM ${
        this.table("bot_successors")
      } WHERE bot_id = $1`,
      [identifier],
    );
    return rows[0] === undefined ? undefined : new URL(rows[0].successor_id);
  }

  /** {@inheritDoc Repository.setSuccessor} */
  async setSuccessor(
    identifier: string,
    successorId: URL,
    signal?: AbortSignal,
  ): Promise<boolean> {
    signal?.throwIfAborted();
    const href = successorId.href;
    await this.ensureReady();
    signal?.throwIfAborted();
    const rows = await this.query<{ readonly bot_id: string }>(
      this.sql,
      `INSERT INTO ${
        this.table("bot_successors")
      } (bot_id, successor_id) VALUES ($1, $2)
       ON CONFLICT (bot_id) DO NOTHING RETURNING bot_id`,
      [identifier, href],
    );
    return rows.length > 0;
  }

  async setKeyPairs(
    identifier: string,
    keyPairs: CryptoKeyPair[],
  ): Promise<void> {
    await this.ensureReady();
    await this.sql.begin(async (sql) => {
      await this.query(
        sql,
        `DELETE FROM ${this.table("key_pairs")} WHERE bot_id = $1`,
        [identifier],
      );
      for (const [position, keyPair] of keyPairs.entries()) {
        const privateJwk = await exportJwk(keyPair.privateKey);
        const publicJwk = await exportJwk(keyPair.publicKey);
        await this.query(
          sql,
          `INSERT INTO ${this.table("key_pairs")}
             (bot_id, position, private_key_jwk, public_key_jwk)
           VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
          [
            identifier,
            position,
            serializeJson(privateJwk),
            serializeJson(publicJwk),
          ],
        );
      }
    });
  }

  async getKeyPairs(identifier: string): Promise<CryptoKeyPair[] | undefined> {
    await this.ensureReady();
    const rows = await this.query<{
      readonly private_key_jwk: unknown;
      readonly public_key_jwk: unknown;
    }>(
      this.sql,
      `SELECT private_key_jwk, public_key_jwk
         FROM ${this.table("key_pairs")}
        WHERE bot_id = $1
     ORDER BY position ASC`,
      [identifier],
    );
    if (rows.length < 1) return undefined;
    const keyPairs: CryptoKeyPair[] = [];
    for (const row of rows) {
      const privateJwk = normalizeJsonObject(row.private_key_jwk);
      const publicJwk = normalizeJsonObject(row.public_key_jwk);
      if (privateJwk == null || publicJwk == null) {
        throw new TypeError("A stored key pair is malformed.");
      }
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
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("messages")}
         (bot_id, id, activity_json, published)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [
        identifier,
        id,
        serializeJson(await activity.toJsonLd({ format: "compact" })),
        activity.published?.epochMilliseconds ?? null,
      ],
    );
  }

  async updateMessage(
    identifier: string,
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    await this.ensureReady();
    return await this.sql.begin(async (sql) => {
      const rows = await this.query<{ readonly activity_json: unknown }>(
        sql,
        `SELECT activity_json
           FROM ${this.table("messages")}
          WHERE bot_id = $1 AND id = $2
          FOR UPDATE`,
        [identifier, id],
      );
      const row = rows[0];
      if (row == null) return false;
      const activity = await parseActivity(row.activity_json);
      if (activity == null) return false;
      const updated = await updater(activity);
      if (updated == null) return false;
      await this.query(
        sql,
        `UPDATE ${this.table("messages")}
            SET activity_json = $1::jsonb,
                published = $2
          WHERE bot_id = $3 AND id = $4`,
        [
          serializeJson(await updated.toJsonLd({ format: "compact" })),
          updated.published?.epochMilliseconds ?? null,
          identifier,
          id,
        ],
      );
      return true;
    });
  }

  async removeMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly activity_json: unknown }>(
      this.sql,
      `DELETE FROM ${this.table("messages")}
        WHERE bot_id = $1 AND id = $2
    RETURNING activity_json`,
      [identifier, id],
    );
    return await parseActivity(rows[0]?.activity_json);
  }

  async *getMessages(
    identifier: string,
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    await this.ensureReady();
    const { order = "newest", since, until, limit } = options;
    const parameters: QueryParameter[] = [identifier];
    let query = `SELECT activity_json
                   FROM ${this.table("messages")}
                  WHERE bot_id = $1`;
    if (since != null) {
      parameters.push(since.epochMilliseconds);
      query += ` AND published >= $${parameters.length}`;
    }
    if (until != null) {
      parameters.push(until.epochMilliseconds);
      query += ` AND published <= $${parameters.length}`;
    }
    query += order === "oldest"
      ? " ORDER BY published ASC NULLS LAST, id ASC"
      : " ORDER BY published DESC NULLS LAST, id DESC";
    if (limit != null) {
      parameters.push(limit);
      query += ` LIMIT $${parameters.length}`;
    }
    const rows = await this.query<{ readonly activity_json: unknown }>(
      this.sql,
      query,
      parameters,
    );
    for (const row of rows) {
      const activity = await parseActivity(row.activity_json);
      if (activity != null) yield activity;
    }
  }

  async getMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly activity_json: unknown }>(
      this.sql,
      `SELECT activity_json
         FROM ${this.table("messages")}
        WHERE bot_id = $1 AND id = $2`,
      [identifier, id],
    );
    return await parseActivity(rows[0]?.activity_json);
  }

  async countMessages(identifier: string): Promise<number> {
    await this.ensureReady();
    const rows = await this.query<{ readonly count: number }>(
      this.sql,
      `SELECT COUNT(*)::integer AS count
         FROM ${this.table("messages")}
        WHERE bot_id = $1`,
      [identifier],
    );
    return rows[0]?.count ?? 0;
  }

  async addFollower(
    identifier: string,
    followId: URL,
    follower: Actor,
  ): Promise<void> {
    await this.ensureReady();
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }
    const followerId = follower.id;
    const followerJson = await follower.toJsonLd({ format: "compact" });
    await this.sql.begin(async (sql) => {
      await this.lockFollowRequest(sql, identifier, followId);
      const rows = await this.query<{ readonly follower_id: string }>(
        sql,
        `SELECT follower_id
           FROM ${this.table("follow_requests")}
          WHERE bot_id = $1 AND follow_request_id = $2
          FOR UPDATE`,
        [identifier, followId.href],
      );
      const previousFollowerId = rows[0]?.follower_id;
      await this.lockFollowers(sql, identifier, [
        followerId.href,
        ...(previousFollowerId == null ? [] : [previousFollowerId]),
      ]);
      await this.query(
        sql,
        `INSERT INTO ${this.table("followers")}
           (bot_id, follower_id, actor_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (bot_id, follower_id)
         DO UPDATE SET actor_json = EXCLUDED.actor_json`,
        [identifier, followerId.href, serializeJson(followerJson)],
      );
      await this.query(
        sql,
        `INSERT INTO ${this.table("follow_requests")}
           (bot_id, follow_request_id, follower_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (bot_id, follow_request_id)
         DO UPDATE SET follower_id = EXCLUDED.follower_id`,
        [identifier, followId.href, followerId.href],
      );
      if (
        previousFollowerId != null && previousFollowerId !== followerId.href
      ) {
        await this.cleanupFollower(sql, identifier, previousFollowerId);
      }
    });
  }

  async removeFollower(
    identifier: string,
    followId: URL,
    followerId: URL,
  ): Promise<Actor | undefined> {
    await this.ensureReady();
    return await this.sql.begin(async (sql) => {
      await this.lockFollowRequest(sql, identifier, followId);
      const rows = await this.query<{ readonly actor_json: unknown }>(
        sql,
        `SELECT f.actor_json
           FROM ${this.table("follow_requests")} AS fr
           JOIN ${this.table("followers")} AS f
             ON f.bot_id = fr.bot_id AND f.follower_id = fr.follower_id
          WHERE fr.bot_id = $1
            AND fr.follow_request_id = $2
            AND fr.follower_id = $3
          FOR UPDATE`,
        [identifier, followId.href, followerId.href],
      );
      const row = rows[0];
      if (row == null) return undefined;
      await this.query(
        sql,
        `DELETE FROM ${this.table("follow_requests")}
          WHERE bot_id = $1 AND follow_request_id = $2`,
        [identifier, followId.href],
      );
      const removed = await this.cleanupFollower(
        sql,
        identifier,
        followerId.href,
      );
      return removed ? await parseActor(row.actor_json) : undefined;
    });
  }

  async hasFollower(identifier: string, followerId: URL): Promise<boolean> {
    await this.ensureReady();
    const rows = await this.query<{ readonly exists: number }>(
      this.sql,
      `SELECT 1 AS exists
         FROM ${this.table("followers")}
        WHERE bot_id = $1 AND follower_id = $2`,
      [identifier, followerId.href],
    );
    return rows.length > 0;
  }

  async *getFollowers(
    identifier: string,
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    await this.ensureReady();
    const { offset = 0, limit } = options;
    const parameters: QueryParameter[] = [identifier];
    let query = `SELECT actor_json
                   FROM ${this.table("followers")}
                  WHERE bot_id = $1
               ORDER BY follower_id ASC`;
    if (limit != null) {
      parameters.push(limit, offset);
      query += ` LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`;
    } else if (offset > 0) {
      parameters.push(offset);
      query += ` OFFSET $${parameters.length}`;
    }
    const rows = await this.query<{ readonly actor_json: unknown }>(
      this.sql,
      query,
      parameters,
    );
    for (const row of rows) {
      const actor = await parseActor(row.actor_json);
      if (actor != null) yield actor;
    }
  }

  async countFollowers(identifier: string): Promise<number> {
    await this.ensureReady();
    const rows = await this.query<{ readonly count: number }>(
      this.sql,
      `SELECT COUNT(*)::integer AS count
         FROM ${this.table("followers")}
        WHERE bot_id = $1`,
      [identifier],
    );
    return rows[0]?.count ?? 0;
  }

  async addSentFollow(
    identifier: string,
    id: Uuid,
    follow: Follow,
  ): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("sent_follows")} (bot_id, id, follow_json)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (bot_id, id)
       DO UPDATE SET follow_json = EXCLUDED.follow_json`,
      [
        identifier,
        id,
        serializeJson(await follow.toJsonLd({ format: "compact" })),
      ],
    );
  }

  async removeSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly follow_json: unknown }>(
      this.sql,
      `DELETE FROM ${this.table("sent_follows")}
        WHERE bot_id = $1 AND id = $2
    RETURNING follow_json`,
      [identifier, id],
    );
    return await parseFollow(rows[0]?.follow_json);
  }

  async getSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly follow_json: unknown }>(
      this.sql,
      `SELECT follow_json
         FROM ${this.table("sent_follows")}
        WHERE bot_id = $1 AND id = $2`,
      [identifier, id],
    );
    return await parseFollow(rows[0]?.follow_json);
  }

  async addFollowee(
    identifier: string,
    followeeId: URL,
    follow: Follow,
  ): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("followees")}
         (bot_id, followee_id, follow_json)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (bot_id, followee_id)
       DO UPDATE SET follow_json = EXCLUDED.follow_json`,
      [
        identifier,
        followeeId.href,
        serializeJson(await follow.toJsonLd({ format: "compact" })),
      ],
    );
  }

  async removeFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly follow_json: unknown }>(
      this.sql,
      `DELETE FROM ${this.table("followees")}
        WHERE bot_id = $1 AND followee_id = $2
    RETURNING follow_json`,
      [identifier, followeeId.href],
    );
    return await parseFollow(rows[0]?.follow_json);
  }

  async getFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly follow_json: unknown }>(
      this.sql,
      `SELECT follow_json
         FROM ${this.table("followees")}
        WHERE bot_id = $1 AND followee_id = $2`,
      [identifier, followeeId.href],
    );
    return await parseFollow(rows[0]?.follow_json);
  }

  async *findFollowedBots(followeeId: URL): AsyncIterable<string> {
    await this.ensureReady();
    const rows = await this.query<{ readonly bot_id: string }>(
      this.sql,
      `SELECT bot_id
         FROM ${this.table("followees")}
        WHERE followee_id = $1
     ORDER BY bot_id ASC`,
      [followeeId.href],
    );
    for (const row of rows) yield row.bot_id;
  }

  async addQuoteAuthorization(
    identifier: string,
    id: Uuid,
    authorization: QuoteAuthorization,
  ): Promise<void> {
    await this.ensureReady();
    const interactingObject = authorization.interactingObjectId;
    if (interactingObject == null) {
      throw new TypeError(
        "The quote authorization interacting object is missing.",
      );
    }
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("quote_authorizations")}
         (bot_id, id, interacting_object, authorization_json)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (bot_id, interacting_object) DO NOTHING`,
      [
        identifier,
        id,
        interactingObject.href,
        serializeJson(await authorization.toJsonLd({ format: "compact" })),
      ],
    );
  }

  async getQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly authorization_json: unknown }>(
      this.sql,
      `SELECT authorization_json
         FROM ${this.table("quote_authorizations")}
        WHERE bot_id = $1 AND id = $2`,
      [identifier, id],
    );
    return await parseQuoteAuthorization(rows[0]?.authorization_json);
  }

  async findQuoteAuthorization(
    identifier: string,
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly authorization_json: unknown }>(
      this.sql,
      `SELECT authorization_json
         FROM ${this.table("quote_authorizations")}
        WHERE bot_id = $1 AND interacting_object = $2`,
      [identifier, interactingObject.href],
    );
    return await parseQuoteAuthorization(rows[0]?.authorization_json);
  }

  async removeQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly authorization_json: unknown }>(
      this.sql,
      `DELETE FROM ${this.table("quote_authorizations")}
        WHERE bot_id = $1 AND id = $2
    RETURNING authorization_json`,
      [identifier, id],
    );
    return await parseQuoteAuthorization(rows[0]?.authorization_json);
  }

  async addQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
    messageId: Uuid,
    attribution?: URL,
  ): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("quote_authorization_refs")}
         (bot_id, authorization_uri, message_id, attribution_uri)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bot_id, authorization_uri) DO UPDATE
       SET message_id = EXCLUDED.message_id,
           attribution_uri = EXCLUDED.attribution_uri`,
      [identifier, authorization.href, messageId, attribution?.href ?? null],
    );
  }

  async findQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<Uuid | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly message_id: Uuid }>(
      this.sql,
      `SELECT message_id
         FROM ${this.table("quote_authorization_refs")}
        WHERE bot_id = $1 AND authorization_uri = $2`,
      [identifier, authorization.href],
    );
    return rows[0]?.message_id;
  }

  async *findQuoteAuthorizationReferenceIdentifiers(
    authorization: URL,
  ): AsyncIterable<string> {
    await this.ensureReady();
    const rows = await this.query<{ readonly bot_id: string }>(
      this.sql,
      `SELECT bot_id
         FROM ${this.table("quote_authorization_refs")}
        WHERE authorization_uri = $1
        ORDER BY bot_id`,
      [authorization.href],
    );
    for (const row of rows) yield row.bot_id;
  }

  async findQuoteAuthorizationReferenceAttribution(
    identifier: string,
    authorization: URL,
  ): Promise<URL | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly attribution_uri: string | null }>(
      this.sql,
      `SELECT attribution_uri
         FROM ${this.table("quote_authorization_refs")}
        WHERE bot_id = $1 AND authorization_uri = $2`,
      [identifier, authorization.href],
    );
    const attribution = rows[0]?.attribution_uri;
    if (attribution == null) return undefined;
    try {
      return new URL(attribution);
    } catch {
      return undefined;
    }
  }

  async removeQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `DELETE FROM ${this.table("quote_authorization_refs")}
        WHERE bot_id = $1 AND authorization_uri = $2`,
      [identifier, authorization.href],
    );
  }

  async vote(
    identifier: string,
    messageId: Uuid,
    voterId: URL,
    option: string,
  ): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("poll_votes")}
         (bot_id, message_id, voter_id, option)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bot_id, message_id, voter_id, option)
       DO NOTHING`,
      [identifier, messageId, voterId.href, option],
    );
  }

  async countVoters(identifier: string, messageId: Uuid): Promise<number> {
    await this.ensureReady();
    const rows = await this.query<{ readonly count: number }>(
      this.sql,
      `SELECT COUNT(DISTINCT voter_id)::integer AS count
         FROM ${this.table("poll_votes")}
        WHERE bot_id = $1 AND message_id = $2`,
      [identifier, messageId],
    );
    return rows[0]?.count ?? 0;
  }

  async countVotes(
    identifier: string,
    messageId: Uuid,
  ): Promise<Readonly<Record<string, number>>> {
    await this.ensureReady();
    const rows = await this.query<{
      readonly option: string;
      readonly count: number;
    }>(
      this.sql,
      `SELECT option, COUNT(*)::integer AS count
         FROM ${this.table("poll_votes")}
        WHERE bot_id = $1 AND message_id = $2
     GROUP BY option
     ORDER BY option ASC`,
      [identifier, messageId],
    );
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.option] = row.count;
    }
    return result;
  }

  /**
   * Migrates data stored by \@fedify/botkit-postgres 0.4, which was not
   * scoped by bot actor identifiers, so that it belongs to the given
   * identifier.  Rows carried over from a legacy schema have the
   * empty-string bot ID; this method assigns them to the identifier in
   * a single transaction.  It only acts when the schema was actually
   * upgraded from a legacy layout, so data legitimately stored under an
   * empty-string identifier is never touched, and calling it again is
   * a no-op.
   * @param identifier The identifier of the bot actor that adopts the legacy
   *                   data.
   * @since 0.5.0
   */
  async migrate(identifier: string): Promise<void> {
    await this.ensureReady();
    await this.sql.begin(async (sql) => {
      const rows = await this.query<{ readonly value: string }>(
        sql,
        `SELECT value FROM ${this.table("botkit_metadata")}
          WHERE "key" = 'legacy_data'
            FOR UPDATE`,
      );
      if (rows.length < 1) return;
      // The followers and follow_requests rows move in tandem, which
      // temporarily breaks the foreign key between them; defer the check to
      // the commit:
      await execute(sql, "SET CONSTRAINTS ALL DEFERRED", [], false);
      for (const table of upgradableTables) {
        await this.query(
          sql,
          `UPDATE "${this.schema}"."${table}"
              SET bot_id = $1
            WHERE bot_id = ''`,
          [identifier],
        );
      }
      await this.query(
        sql,
        `DELETE FROM ${this.table("botkit_metadata")}
          WHERE "key" = 'legacy_data'`,
      );
    });
  }

  forIdentifier(identifier: string): ActorScopedRepository {
    return new ActorScopedRepository(this, identifier);
  }

  private table(name: string): string {
    return `"${this.schema}"."${name}"`;
  }

  private async lockFollowRequest(
    sql: Queryable,
    identifier: string,
    followId: URL,
  ): Promise<void> {
    await this.query(
      sql,
      `SELECT pg_catalog.pg_advisory_xact_lock($1, pg_catalog.hashtext($2))`,
      [
        followRequestAdvisoryLockNamespace,
        `${this.schema}:${identifier}:${followId.href}`,
      ],
    );
  }

  private async lockFollower(
    sql: Queryable,
    identifier: string,
    followerId: string,
  ): Promise<void> {
    await this.query(
      sql,
      `SELECT pg_catalog.pg_advisory_xact_lock($1, pg_catalog.hashtext($2))`,
      [
        followerAdvisoryLockNamespace,
        `${this.schema}:${identifier}:${followerId}`,
      ],
    );
  }

  private async lockFollowers(
    sql: Queryable,
    identifier: string,
    followerIds: readonly string[],
  ): Promise<void> {
    const uniqueFollowerIds = [...new Set(followerIds)].sort();
    for (const followerId of uniqueFollowerIds) {
      await this.lockFollower(sql, identifier, followerId);
    }
  }

  private async cleanupFollower(
    sql: Queryable,
    identifier: string,
    followerId: string,
  ): Promise<boolean> {
    await this.lockFollower(sql, identifier, followerId);
    const rows = await this.query<{ readonly follower_id: string }>(
      sql,
      `DELETE FROM ${this.table("followers")}
        WHERE bot_id = $1
          AND follower_id = $2
          AND NOT EXISTS (
            SELECT 1
              FROM ${this.table("follow_requests")}
             WHERE bot_id = $1
               AND follower_id = $2
          )
        RETURNING follower_id`,
      [identifier, followerId],
    );
    return rows.length > 0;
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private async query<TRow extends object>(
    sql: Queryable,
    query: string,
    parameters: readonly QueryParameter[] = [],
  ): Promise<readonly TRow[]> {
    return await execute<TRow>(sql, query, parameters, this.prepare);
  }
}

function validateSchemaName(schema: string): string {
  if (!schemaNamePattern.test(schema)) {
    throw new TypeError("The PostgreSQL schema name is invalid.");
  }
  return schema;
}

function hasTransaction(sql: Queryable): sql is TransactionalQueryable {
  return sql != null &&
    typeof (sql as Partial<TransactionalQueryable>).begin === "function";
}

async function execute<TRow extends object>(
  sql: Queryable,
  query: string,
  parameters: readonly QueryParameter[] = [],
  prepare = true,
): Promise<readonly TRow[]> {
  return await sql.unsafe<TRow[]>(
    query,
    [...parameters],
    { prepare },
  );
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

async function parseActivity(
  json: unknown,
): Promise<Create | Announce | undefined> {
  const normalized = normalizeJsonObject(json);
  if (normalized == null) return undefined;
  try {
    const activity = await Activity.fromJsonLd(normalized);
    if (activity instanceof Create || activity instanceof Announce) {
      return activity;
    }
  } catch (error) {
    logger.warn("Failed to parse message activity.", { error });
  }
  return undefined;
}

async function parseActor(json: unknown): Promise<Actor | undefined> {
  const normalized = normalizeJsonObject(json);
  if (normalized == null) return undefined;
  try {
    const actor = await Object.fromJsonLd(normalized);
    if (isActor(actor)) return actor;
  } catch (error) {
    logger.warn("Failed to parse follower actor.", { error });
  }
  return undefined;
}

async function parseFollow(json: unknown): Promise<Follow | undefined> {
  const normalized = normalizeJsonObject(json);
  if (normalized == null) return undefined;
  try {
    return await Follow.fromJsonLd(normalized);
  } catch (error) {
    logger.warn("Failed to parse follow activity.", { error });
  }
  return undefined;
}

async function parseQuoteAuthorization(
  json: unknown,
): Promise<QuoteAuthorization | undefined> {
  const normalized = normalizeJsonObject(json);
  if (normalized == null) return undefined;
  try {
    return await QuoteAuthorization.fromJsonLd(normalized);
  } catch (error) {
    logger.warn("Failed to parse quote authorization.", { error });
  }
  return undefined;
}

function normalizeJsonObject(
  value: unknown,
): Record<string, unknown> | undefined {
  if (isJsonObject(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (isJsonObject(parsed)) return parsed;
  } catch {
    return undefined;
  }
  return undefined;
}
