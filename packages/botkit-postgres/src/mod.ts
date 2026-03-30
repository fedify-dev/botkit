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
} from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import postgres from "postgres";

const logger = getLogger(["botkit", "postgres"]);
const schemaNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Queryable = Pick<postgres.Sql, "unsafe">;
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
 * @since 0.4.0
 */
export async function initializePostgresRepositorySchema(
  sql: postgres.Sql,
  schema = "botkit",
): Promise<void> {
  const validatedSchema = validateSchemaName(schema);
  await execute(
    sql,
    `CREATE SCHEMA IF NOT EXISTS "${validatedSchema}"`,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."key_pairs" (
       position INTEGER PRIMARY KEY,
       private_key_jwk JSONB NOT NULL,
       public_key_jwk JSONB NOT NULL
     )`,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."messages" (
       id TEXT PRIMARY KEY,
       activity_json JSONB NOT NULL,
       published BIGINT
     )`,
  );
  await execute(
    sql,
    `CREATE INDEX IF NOT EXISTS "idx_messages_published"
       ON "${validatedSchema}"."messages" (published, id)`,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."followers" (
       follower_id TEXT PRIMARY KEY,
       actor_json JSONB NOT NULL
     )`,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."follow_requests" (
       follow_request_id TEXT PRIMARY KEY,
       follower_id TEXT NOT NULL
         REFERENCES "${validatedSchema}"."followers" (follower_id)
         ON DELETE CASCADE
     )`,
  );
  await execute(
    sql,
    `CREATE INDEX IF NOT EXISTS "idx_follow_requests_follower"
       ON "${validatedSchema}"."follow_requests" (follower_id)`,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."sent_follows" (
       id TEXT PRIMARY KEY,
       follow_json JSONB NOT NULL
     )`,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."followees" (
       followee_id TEXT PRIMARY KEY,
       follow_json JSONB NOT NULL
     )`,
  );
  await execute(
    sql,
    `CREATE TABLE IF NOT EXISTS "${validatedSchema}"."poll_votes" (
       message_id TEXT NOT NULL,
       voter_id TEXT NOT NULL,
       option TEXT NOT NULL,
       PRIMARY KEY (message_id, voter_id, option)
     )`,
  );
  await execute(
    sql,
    `CREATE INDEX IF NOT EXISTS "idx_poll_votes_message_option"
       ON "${validatedSchema}"."poll_votes" (message_id, option)`,
  );
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
      if ("url" in options || "maxConnections" in options) {
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
    const ready = initializePostgresRepositorySchema(this.sql, this.schema);
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

  async setKeyPairs(keyPairs: CryptoKeyPair[]): Promise<void> {
    await this.ensureReady();
    await this.sql.begin(async (sql) => {
      await this.query(sql, `DELETE FROM ${this.table("key_pairs")}`);
      for (const [position, keyPair] of keyPairs.entries()) {
        const privateJwk = await exportJwk(keyPair.privateKey);
        const publicJwk = await exportJwk(keyPair.publicKey);
        await this.query(
          sql,
          `INSERT INTO ${this.table("key_pairs")}
             (position, private_key_jwk, public_key_jwk)
           VALUES ($1, $2::jsonb, $3::jsonb)`,
          [
            position,
            serializeJson(privateJwk),
            serializeJson(publicJwk),
          ],
        );
      }
    });
  }

  async getKeyPairs(): Promise<CryptoKeyPair[] | undefined> {
    await this.ensureReady();
    const rows = await this.query<{
      readonly private_key_jwk: unknown;
      readonly public_key_jwk: unknown;
    }>(
      this.sql,
      `SELECT private_key_jwk, public_key_jwk
         FROM ${this.table("key_pairs")}
     ORDER BY position ASC`,
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

  async addMessage(id: Uuid, activity: Create | Announce): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("messages")} (id, activity_json, published)
       VALUES ($1, $2::jsonb, $3)`,
      [
        id,
        serializeJson(await activity.toJsonLd({ format: "compact" })),
        activity.published?.epochMilliseconds ?? null,
      ],
    );
  }

  async updateMessage(
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
          WHERE id = $1
          FOR UPDATE`,
        [id],
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
          WHERE id = $3`,
        [
          serializeJson(await updated.toJsonLd({ format: "compact" })),
          updated.published?.epochMilliseconds ?? null,
          id,
        ],
      );
      return true;
    });
  }

  async removeMessage(id: Uuid): Promise<Create | Announce | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly activity_json: unknown }>(
      this.sql,
      `DELETE FROM ${this.table("messages")}
        WHERE id = $1
    RETURNING activity_json`,
      [id],
    );
    return await parseActivity(rows[0]?.activity_json);
  }

  async *getMessages(
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    await this.ensureReady();
    const { order = "newest", since, until, limit } = options;
    const parameters: QueryParameter[] = [];
    let query = `SELECT activity_json
                   FROM ${this.table("messages")}
                  WHERE TRUE`;
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

  async getMessage(id: Uuid): Promise<Create | Announce | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly activity_json: unknown }>(
      this.sql,
      `SELECT activity_json
         FROM ${this.table("messages")}
        WHERE id = $1`,
      [id],
    );
    return await parseActivity(rows[0]?.activity_json);
  }

  async countMessages(): Promise<number> {
    await this.ensureReady();
    const rows = await this.query<{ readonly count: number }>(
      this.sql,
      `SELECT COUNT(*)::integer AS count
         FROM ${this.table("messages")}`,
    );
    return rows[0]?.count ?? 0;
  }

  async addFollower(followId: URL, follower: Actor): Promise<void> {
    await this.ensureReady();
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }
    const followerId = follower.id;
    const followerJson = await follower.toJsonLd({ format: "compact" });
    await this.sql.begin(async (sql) => {
      await this.query(
        sql,
        `INSERT INTO ${this.table("followers")} (follower_id, actor_json)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (follower_id)
         DO UPDATE SET actor_json = EXCLUDED.actor_json`,
        [followerId.href, serializeJson(followerJson)],
      );
      await this.query(
        sql,
        `INSERT INTO ${
          this.table("follow_requests")
        } (follow_request_id, follower_id)
         VALUES ($1, $2)
         ON CONFLICT (follow_request_id)
         DO UPDATE SET follower_id = EXCLUDED.follower_id`,
        [followId.href, followerId.href],
      );
    });
  }

  async removeFollower(
    followId: URL,
    followerId: URL,
  ): Promise<Actor | undefined> {
    await this.ensureReady();
    return await this.sql.begin(async (sql) => {
      const rows = await this.query<{ readonly actor_json: unknown }>(
        sql,
        `SELECT f.actor_json
           FROM ${this.table("follow_requests")} AS fr
           JOIN ${this.table("followers")} AS f
             ON f.follower_id = fr.follower_id
          WHERE fr.follow_request_id = $1
            AND fr.follower_id = $2
          FOR UPDATE`,
        [followId.href, followerId.href],
      );
      const row = rows[0];
      if (row == null) return undefined;
      await this.query(
        sql,
        `DELETE FROM ${this.table("follow_requests")}
          WHERE follow_request_id = $1`,
        [followId.href],
      );
      await this.query(
        sql,
        `DELETE FROM ${this.table("followers")}
          WHERE follower_id = $1
            AND NOT EXISTS (
              SELECT 1
                FROM ${this.table("follow_requests")}
               WHERE follower_id = $1
            )`,
        [followerId.href],
      );
      return await parseActor(row.actor_json);
    });
  }

  async hasFollower(followerId: URL): Promise<boolean> {
    await this.ensureReady();
    const rows = await this.query<{ readonly exists: number }>(
      this.sql,
      `SELECT 1 AS exists
         FROM ${this.table("followers")}
        WHERE follower_id = $1`,
      [followerId.href],
    );
    return rows.length > 0;
  }

  async *getFollowers(
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    await this.ensureReady();
    const { offset = 0, limit } = options;
    const parameters: QueryParameter[] = [];
    let query = `SELECT actor_json
                   FROM ${this.table("followers")}
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

  async countFollowers(): Promise<number> {
    await this.ensureReady();
    const rows = await this.query<{ readonly count: number }>(
      this.sql,
      `SELECT COUNT(*)::integer AS count
         FROM ${this.table("followers")}`,
    );
    return rows[0]?.count ?? 0;
  }

  async addSentFollow(id: Uuid, follow: Follow): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("sent_follows")} (id, follow_json)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET follow_json = EXCLUDED.follow_json`,
      [id, serializeJson(await follow.toJsonLd({ format: "compact" }))],
    );
  }

  async removeSentFollow(id: Uuid): Promise<Follow | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly follow_json: unknown }>(
      this.sql,
      `DELETE FROM ${this.table("sent_follows")}
        WHERE id = $1
    RETURNING follow_json`,
      [id],
    );
    return await parseFollow(rows[0]?.follow_json);
  }

  async getSentFollow(id: Uuid): Promise<Follow | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly follow_json: unknown }>(
      this.sql,
      `SELECT follow_json
         FROM ${this.table("sent_follows")}
        WHERE id = $1`,
      [id],
    );
    return await parseFollow(rows[0]?.follow_json);
  }

  async addFollowee(followeeId: URL, follow: Follow): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("followees")} (followee_id, follow_json)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (followee_id)
       DO UPDATE SET follow_json = EXCLUDED.follow_json`,
      [
        followeeId.href,
        serializeJson(await follow.toJsonLd({ format: "compact" })),
      ],
    );
  }

  async removeFollowee(followeeId: URL): Promise<Follow | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly follow_json: unknown }>(
      this.sql,
      `DELETE FROM ${this.table("followees")}
        WHERE followee_id = $1
    RETURNING follow_json`,
      [followeeId.href],
    );
    return await parseFollow(rows[0]?.follow_json);
  }

  async getFollowee(followeeId: URL): Promise<Follow | undefined> {
    await this.ensureReady();
    const rows = await this.query<{ readonly follow_json: unknown }>(
      this.sql,
      `SELECT follow_json
         FROM ${this.table("followees")}
        WHERE followee_id = $1`,
      [followeeId.href],
    );
    return await parseFollow(rows[0]?.follow_json);
  }

  async vote(messageId: Uuid, voterId: URL, option: string): Promise<void> {
    await this.ensureReady();
    await this.query(
      this.sql,
      `INSERT INTO ${this.table("poll_votes")} (message_id, voter_id, option)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, voter_id, option)
       DO NOTHING`,
      [messageId, voterId.href, option],
    );
  }

  async countVoters(messageId: Uuid): Promise<number> {
    await this.ensureReady();
    const rows = await this.query<{ readonly count: number }>(
      this.sql,
      `SELECT COUNT(DISTINCT voter_id)::integer AS count
         FROM ${this.table("poll_votes")}
        WHERE message_id = $1`,
      [messageId],
    );
    return rows[0]?.count ?? 0;
  }

  async countVotes(messageId: Uuid): Promise<Readonly<Record<string, number>>> {
    await this.ensureReady();
    const rows = await this.query<{
      readonly option: string;
      readonly count: number;
    }>(
      this.sql,
      `SELECT option, COUNT(*)::integer AS count
         FROM ${this.table("poll_votes")}
        WHERE message_id = $1
     GROUP BY option
     ORDER BY option ASC`,
      [messageId],
    );
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.option] = row.count;
    }
    return result;
  }

  private table(name: string): string {
    return `"${this.schema}"."${name}"`;
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
