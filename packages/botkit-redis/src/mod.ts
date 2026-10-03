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
import { createClient, type RedisClientOptions } from "redis";

const logger = getLogger(["botkit", "redis"]);
const defaultRedisLockTimeoutMs = 30_000;
const defaultRedisLockPollIntervalMs = 20;
const defaultRedisLockRenewIntervalMs = 10_000;
const redisMGetBatchSize = 100;
const uuidV7Pattern =
  /^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RedisClientLike {
  readonly isOpen?: boolean;
  connect?(): Promise<unknown>;
  quit?(): Promise<unknown>;
  close?(): Promise<unknown> | unknown;
  on?(event: "error", listener: (error: unknown) => void): unknown;
  sendCommand(args: readonly string[]): Promise<unknown>;
}

interface KeyPair {
  readonly private: JsonWebKey;
  readonly public: JsonWebKey;
}

interface QuoteAuthorizationReferenceData {
  readonly messageId: Uuid;
  readonly attribution?: string;
}

interface RedisRepositoryOptionsBase {
  /**
   * The Redis key prefix under which all BotKit data is stored.
   * @default `"botkit"`
   */
  readonly prefix?: string;

  /**
   * How long a Redis lock can live without renewal, in milliseconds.
   * @default `30000`
   */
  readonly lockTimeoutMs?: number;

  /**
   * How long to wait before retrying a held Redis lock, in milliseconds.
   * @default `20`
   */
  readonly lockPollIntervalMs?: number;

  /**
   * How often to renew a held Redis lock, in milliseconds.
   * @default `10000`
   */
  readonly lockRenewIntervalMs?: number;
}

interface RedisRepositoryOptionsWithClient extends RedisRepositoryOptionsBase {
  /**
   * A pre-configured Redis client to use.  It must already be connected.
   */
  readonly client: RedisClientLike;

  /**
   * Disallowed when `client` is provided.
   */
  readonly url?: never;

  /**
   * Disallowed when `client` is provided.
   */
  readonly clientOptions?: never;
}

interface RedisRepositoryOptionsWithUrl extends RedisRepositoryOptionsBase {
  /**
   * A Redis connection string to connect with.
   */
  readonly url: string | URL;

  /**
   * Disallowed when `url` is provided.
   */
  readonly client?: never;

  /**
   * Additional node-redis client options.
   */
  readonly clientOptions?: Omit<RedisClientOptions, "url">;
}

/**
 * Options for creating a Redis repository.
 * @since 0.5.0
 */
export type RedisRepositoryOptions =
  | RedisRepositoryOptionsWithClient
  | RedisRepositoryOptionsWithUrl;

/**
 * A repository for storing bot data using Redis.
 * @since 0.5.0
 */
export class RedisRepository implements Repository, AsyncDisposable {
  private readonly client: RedisClientLike;
  private readonly ownsClient: boolean;
  private ready: Promise<unknown> | undefined;
  private readonly lockTimeoutMs: number;
  private readonly lockPollIntervalMs: number;
  private readonly lockRenewIntervalMs: number;
  private closed = false;

  /**
   * The Redis key prefix under which all BotKit data is stored.
   */
  readonly prefix: string;

  /**
   * Creates a new Redis repository.
   * @param options The options for creating the repository.
   * @throws {TypeError} If exactly one of `client` and `url` is not provided.
   * @throws {RangeError} If a lock timing option is not a positive number, or
   *   if `lockRenewIntervalMs` is not less than `lockTimeoutMs`.
   */
  constructor(options: RedisRepositoryOptions) {
    if (options == null) {
      throw new TypeError("RedisRepositoryOptions must be provided.");
    }
    const hasClient = "client" in options && options.client != null;
    const hasUrl = "url" in options && options.url != null;
    if (hasClient === hasUrl) {
      throw new TypeError(
        "RedisRepositoryOptions must provide exactly one of client or url.",
      );
    }
    this.prefix = options.prefix ?? "botkit";
    this.lockTimeoutMs = options.lockTimeoutMs ?? defaultRedisLockTimeoutMs;
    this.lockPollIntervalMs = options.lockPollIntervalMs ??
      defaultRedisLockPollIntervalMs;
    this.lockRenewIntervalMs = options.lockRenewIntervalMs ??
      defaultRedisLockRenewIntervalMs;
    validatePositiveMilliseconds("lockTimeoutMs", this.lockTimeoutMs);
    validatePositiveMilliseconds(
      "lockPollIntervalMs",
      this.lockPollIntervalMs,
    );
    validatePositiveMilliseconds(
      "lockRenewIntervalMs",
      this.lockRenewIntervalMs,
    );
    if (this.lockRenewIntervalMs >= this.lockTimeoutMs) {
      throw new RangeError(
        "lockRenewIntervalMs must be less than lockTimeoutMs.",
      );
    }
    if (hasClient) {
      this.client = options.client;
      this.ownsClient = false;
    } else {
      const client: RedisClientLike = createClient({
        ...options.clientOptions,
        url: options.url.toString(),
      });
      this.client = client;
      this.ownsClient = true;
      client.on?.("error", (error) => {
        logger.warn("Owned Redis client emitted an error: {error}", { error });
      });
      const ready = this.connect();
      ready.catch(() => {
        if (this.ready === ready) this.ready = undefined;
      });
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /**
   * Closes the owned Redis connection.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (!this.ownsClient) return;
    const ready = this.ready;
    try {
      await ready;
    } catch (error) {
      logger.warn(
        "Owned Redis client did not become ready before close: {error}",
        {
          error,
        },
      );
      if (this.ready === ready) this.ready = undefined;
    }
    try {
      if (this.client.quit != null) {
        await this.client.quit();
      } else {
        await this.client.close?.();
      }
    } catch (error) {
      logger.warn("Failed to close owned Redis client: {error}", { error });
    }
  }

  private key(...segments: readonly string[]): string {
    return [
      this.prefix,
      ...segments.map((segment) => encodeURIComponent(segment)),
    ].join(":");
  }

  private botKey(identifier: string, ...segments: readonly string[]): string {
    return this.key("bots", identifier, ...segments);
  }

  private connect(): Promise<unknown> {
    const ready = this.client.connect?.() ?? Promise.resolve();
    this.ready = ready;
    return ready;
  }

  private async ensureReady(): Promise<void> {
    if (this.closed) {
      throw new TypeError("RedisRepository is closed.");
    }
    if (!this.ownsClient) return;
    const ready = this.ready;
    if (ready == null) {
      if (this.client.isOpen) return;
      const nextReady = this.connect();
      try {
        await nextReady;
      } catch (error) {
        if (this.ready === nextReady) this.ready = undefined;
        throw error;
      }
      return;
    }
    try {
      await ready;
    } catch (error) {
      if (this.ready === ready) this.ready = undefined;
      throw error;
    }
  }

  private async command(args: readonly string[]): Promise<unknown> {
    await this.ensureReady();
    try {
      return await this.client.sendCommand(args);
    } catch (error) {
      logger.error("Redis command failed: {command}.", {
        command: args[0],
        error,
      });
      throw error;
    }
  }

  private async get(key: string): Promise<string | undefined> {
    const value = await this.command(["GET", key]);
    return typeof value === "string" ? value : undefined;
  }

  private async mGet(keys: readonly string[]): Promise<string[]> {
    if (keys.length < 1) return [];
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += redisMGetBatchSize) {
      chunks.push(keys.slice(i, i + redisMGetBatchSize));
    }
    const replies = await Promise.all(
      chunks.map((chunk) => this.command(["MGET", ...chunk])),
    );
    return replies.flatMap(toStringArray);
  }

  private async set(key: string, value: string): Promise<void> {
    await this.command(["SET", key, value]);
  }

  private async del(...keys: readonly string[]): Promise<void> {
    if (keys.length < 1) return;
    await this.command(["DEL", ...keys]);
  }

  private async sAdd(key: string, member: string): Promise<void> {
    await this.command(["SADD", key, member]);
  }

  private async sRem(key: string, member: string): Promise<void> {
    await this.command(["SREM", key, member]);
  }

  private async sCard(key: string): Promise<number> {
    return toNumber(await this.command(["SCARD", key]));
  }

  private async zAdd(
    key: string,
    score: number,
    member: string,
    nx = false,
  ): Promise<void> {
    await this.command([
      "ZADD",
      key,
      ...(nx ? ["NX"] : []),
      score.toString(),
      member,
    ]);
  }

  private async zRem(key: string, member: string): Promise<void> {
    await this.command(["ZREM", key, member]);
  }

  private async zRange(key: string): Promise<string[]> {
    return toStringArray(await this.command(["ZRANGE", key, "0", "-1"]));
  }

  private async zRangeByScore(
    key: string,
    min: string,
    max: string,
    reverse: boolean,
    limit?: number,
  ): Promise<string[]> {
    const command = reverse ? "ZREVRANGEBYSCORE" : "ZRANGEBYSCORE";
    const args = [command, key, reverse ? max : min, reverse ? min : max];
    if (limit != null) args.push("LIMIT", "0", limit.toString());
    return toStringArray(await this.command(args));
  }

  private async zCard(key: string): Promise<number> {
    return toNumber(await this.command(["ZCARD", key]));
  }

  private async nextSequence(key: string): Promise<number> {
    return toNumber(await this.command(["INCR", key]));
  }

  private async withRedisLock<T>(
    lockKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const token = crypto.randomUUID();
    while (
      await this.command([
        "SET",
        lockKey,
        token,
        "NX",
        "PX",
        this.lockTimeoutMs.toString(),
      ]) !== "OK"
    ) {
      await delay(this.lockPollIntervalMs);
    }
    const renew = setInterval(() => {
      void (async () => {
        try {
          if (this.closed) {
            clearInterval(renew);
            return;
          }
          const renewed = toNumber(
            await this.command([
              "EVAL",
              "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
              "return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end",
              "1",
              lockKey,
              token,
              this.lockTimeoutMs.toString(),
            ]),
          );
          if (renewed === 0) clearInterval(renew);
        } catch (error) {
          if (this.closed) {
            clearInterval(renew);
          } else {
            logger.warn("Failed to renew Redis lock: {error}", { error });
          }
        }
      })();
    }, this.lockRenewIntervalMs);
    try {
      return await operation();
    } finally {
      clearInterval(renew);
      try {
        await this.command([
          "EVAL",
          "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
          "return redis.call('DEL', KEYS[1]) else return 0 end",
          "1",
          lockKey,
          token,
        ]);
      } catch (error) {
        logger.warn("Failed to release Redis lock: {error}", { error });
      }
    }
  }

  /** {@inheritDoc Repository.getSuccessor} */
  async getSuccessor(
    identifier: string,
    signal?: AbortSignal,
  ): Promise<URL | undefined> {
    signal?.throwIfAborted();
    const value = await this.get(this.botKey(identifier, "successor"));
    return value === undefined ? undefined : new URL(value);
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
    return await this.command([
      "SET",
      this.botKey(identifier, "successor"),
      href,
      "NX",
    ]) === "OK";
  }

  async setKeyPairs(
    identifier: string,
    keyPairs: CryptoKeyPair[],
  ): Promise<void> {
    const pairs: KeyPair[] = await Promise.all(
      keyPairs.map(async (keyPair) => ({
        private: await exportJwk(keyPair.privateKey),
        public: await exportJwk(keyPair.publicKey),
      })),
    );
    await this.set(this.botKey(identifier, "keyPairs"), JSON.stringify(pairs));
  }

  async getKeyPairs(identifier: string): Promise<CryptoKeyPair[] | undefined> {
    const json = await this.get(this.botKey(identifier, "keyPairs"));
    if (json == null) return undefined;
    const pairs = JSON.parse(json) as KeyPair[];
    return await Promise.all(pairs.map(async (pair) => ({
      privateKey: await importJwk(pair.private, "private"),
      publicKey: await importJwk(pair.public, "public"),
    })));
  }

  async addMessage(
    identifier: string,
    id: Uuid,
    activity: Create | Announce,
  ): Promise<void> {
    await this.withRedisLock(
      this.botKey(identifier, "messages", id, "lock"),
      async () => {
        await this.set(
          this.botKey(identifier, "messages", id),
          JSON.stringify(await activity.toJsonLd({ format: "compact" })),
        );
        await this.zAdd(
          this.botKey(identifier, "messages"),
          getMessageScore(id, activity),
          id,
        );
      },
    );
  }

  async updateMessage(
    identifier: string,
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    const key = this.botKey(identifier, "messages", id);
    return await this.withRedisLock(
      this.botKey(identifier, "messages", id, "lock"),
      async () => {
        const json = await this.get(key);
        if (json == null) return false;
        let activity: Activity;
        try {
          activity = await Activity.fromJsonLd(JSON.parse(json));
        } catch {
          return false;
        }
        if (!(activity instanceof Create || activity instanceof Announce)) {
          return false;
        }
        const updated = await updater(activity);
        if (updated == null) return false;
        await this.set(
          key,
          JSON.stringify(await updated.toJsonLd({ format: "compact" })),
        );
        await this.zAdd(
          this.botKey(identifier, "messages"),
          getMessageScore(id, updated),
          id,
        );
        return true;
      },
    );
  }

  async removeMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    const key = this.botKey(identifier, "messages", id);
    return await this.withRedisLock(
      this.botKey(identifier, "messages", id, "lock"),
      async () => {
        const json = await this.get(key);
        await this.del(key);
        await this.zRem(this.botKey(identifier, "messages"), id);
        if (json == null) return undefined;
        try {
          const activity = await Activity.fromJsonLd(JSON.parse(json));
          if (activity instanceof Create || activity instanceof Announce) {
            return activity;
          }
        } catch {
          return undefined;
        }
        return undefined;
      },
    );
  }

  async *getMessages(
    identifier: string,
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    const min = options.since == null
      ? "-inf"
      : options.since.epochMilliseconds.toString();
    const max = options.until == null
      ? "+inf"
      : options.until.epochMilliseconds.toString();
    const ids = await this.zRangeByScore(
      this.botKey(identifier, "messages"),
      min,
      max,
      options.order == null || options.order === "newest",
      options.limit,
    );
    if (ids.length < 1) return;
    const keys = ids.map((id) => this.botKey(identifier, "messages", id));
    const jsons = await this.mGet(keys);
    for (const json of jsons) {
      try {
        const activity = await Activity.fromJsonLd(JSON.parse(json));
        if (activity instanceof Create || activity instanceof Announce) {
          yield activity;
        }
      } catch {
        continue;
      }
    }
  }

  async getMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    const json = await this.get(this.botKey(identifier, "messages", id));
    if (json == null) return undefined;
    try {
      const activity = await Activity.fromJsonLd(JSON.parse(json));
      if (activity instanceof Create || activity instanceof Announce) {
        return activity;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  countMessages(identifier: string): Promise<number> {
    return this.zCard(this.botKey(identifier, "messages"));
  }

  /**
   * Adds a follower for a follow request.
   *
   * @throws {TypeError} If the follower actor has no ID.
   */
  async addFollower(
    identifier: string,
    followId: URL,
    follower: Actor,
  ): Promise<void> {
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }
    const followerId = follower.id.href;
    const followIdString = followId.href;
    const requestKey = this.botKey(
      identifier,
      "followRequests",
      followIdString,
    );
    await this.withRedisLock(
      this.botKey(identifier, "followers", "lock"),
      async () => {
        const previousFollowerId = await this.get(requestKey);
        await this.set(
          this.botKey(identifier, "followers", followerId),
          JSON.stringify(await follower.toJsonLd({ format: "compact" })),
        );
        await this.zAdd(
          this.botKey(identifier, "followers"),
          await this.nextSequence(this.botKey(identifier, "followers", "seq")),
          followerId,
          true,
        );
        await this.sAdd(
          this.botKey(identifier, "followerRequests", followerId),
          followIdString,
        );
        await this.set(requestKey, followerId);
        if (previousFollowerId != null && previousFollowerId !== followerId) {
          await this.sRem(
            this.botKey(identifier, "followerRequests", previousFollowerId),
            followIdString,
          );
          await this.cleanupFollower(identifier, previousFollowerId);
        }
      },
    );
  }

  async removeFollower(
    identifier: string,
    followId: URL,
    followerId: URL,
  ): Promise<Actor | undefined> {
    const followIdString = followId.href;
    const requestKey = this.botKey(
      identifier,
      "followRequests",
      followIdString,
    );
    return await this.withRedisLock(
      this.botKey(identifier, "followers", "lock"),
      async () => {
        const currentFollowerId = await this.get(requestKey);
        if (
          currentFollowerId != null && currentFollowerId !== followerId.href
        ) {
          return undefined;
        }
        const followerKey = this.botKey(
          identifier,
          "followers",
          followerId.href,
        );
        const json = await this.get(followerKey);
        if (currentFollowerId === followerId.href) await this.del(requestKey);
        await this.sRem(
          this.botKey(identifier, "followerRequests", followerId.href),
          followIdString,
        );
        const removed = await this.cleanupFollower(identifier, followerId.href);
        if (!removed || json == null) return undefined;
        try {
          const actor = await Object.fromJsonLd(JSON.parse(json));
          if (isActor(actor)) return actor;
        } catch {
          return undefined;
        }
        return undefined;
      },
    );
  }

  private async cleanupFollower(
    identifier: string,
    followerId: string,
  ): Promise<boolean> {
    const requestsKey = this.botKey(identifier, "followerRequests", followerId);
    if (await this.sCard(requestsKey) > 0) return false;
    await this.del(
      requestsKey,
      this.botKey(identifier, "followers", followerId),
    );
    await this.zRem(this.botKey(identifier, "followers"), followerId);
    return true;
  }

  async hasFollower(identifier: string, followerId: URL): Promise<boolean> {
    return await this.get(
      this.botKey(identifier, "followers", followerId.href),
    ) !=
      null;
  }

  async *getFollowers(
    identifier: string,
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    if (options.limit === 0) return;
    const start = options.offset ?? 0;
    const stop = options.limit == null ? -1 : start + options.limit - 1;
    const ids = toStringArray(
      await this.command([
        "ZRANGE",
        this.botKey(identifier, "followers"),
        start.toString(),
        stop.toString(),
      ]),
    );
    if (ids.length < 1) return;
    const keys = ids.map((id) => this.botKey(identifier, "followers", id));
    const jsons = await this.mGet(keys);
    for (const json of jsons) {
      try {
        const actor = await Object.fromJsonLd(JSON.parse(json));
        if (isActor(actor)) yield actor;
      } catch {
        continue;
      }
    }
  }

  countFollowers(identifier: string): Promise<number> {
    return this.zCard(this.botKey(identifier, "followers"));
  }

  async addSentFollow(
    identifier: string,
    id: Uuid,
    follow: Follow,
  ): Promise<void> {
    await this.set(
      this.botKey(identifier, "follows", id),
      JSON.stringify(await follow.toJsonLd({ format: "compact" })),
    );
  }

  async removeSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    const follow = await this.getSentFollow(identifier, id);
    if (follow == null) return undefined;
    await this.del(this.botKey(identifier, "follows", id));
    return follow;
  }

  async getSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    const json = await this.get(this.botKey(identifier, "follows", id));
    if (json == null) return undefined;
    try {
      return await Follow.fromJsonLd(JSON.parse(json));
    } catch {
      return undefined;
    }
  }

  async addFollowee(
    identifier: string,
    followeeId: URL,
    follow: Follow,
  ): Promise<void> {
    await this.withRedisLock(
      this.botKey(identifier, "followees", followeeId.href, "lock"),
      async () => {
        await this.set(
          this.botKey(identifier, "followees", followeeId.href),
          JSON.stringify(await follow.toJsonLd({ format: "compact" })),
        );
        await this.zAdd(
          this.key("index", "followees", followeeId.href),
          0,
          identifier,
        );
      },
    );
  }

  async removeFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    return await this.withRedisLock(
      this.botKey(identifier, "followees", followeeId.href, "lock"),
      async () => {
        const follow = await this.getFollowee(identifier, followeeId);
        await this.del(this.botKey(identifier, "followees", followeeId.href));
        await this.zRem(
          this.key("index", "followees", followeeId.href),
          identifier,
        );
        return follow;
      },
    );
  }

  async getFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    const json = await this.get(
      this.botKey(identifier, "followees", followeeId.href),
    );
    if (json == null) return undefined;
    try {
      return await Follow.fromJsonLd(JSON.parse(json));
    } catch {
      return undefined;
    }
  }

  async *findFollowedBots(followeeId: URL): AsyncIterable<string> {
    yield* await this.zRange(this.key("index", "followees", followeeId.href));
  }

  /**
   * Stores a quote authorization.
   *
   * @throws {TypeError} If the quote authorization has no interacting object.
   */
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
    const indexKey = this.botKey(
      identifier,
      "quoteAuthorizationsByInteractingObject",
      interactingObject.href,
    );
    await this.withRedisLock(
      this.quoteAuthorizationLockKey(indexKey),
      async () => {
        const existing = await this.get(indexKey);
        if (existing != null) {
          if (
            await this.getQuoteAuthorization(identifier, existing as Uuid) !=
              null
          ) {
            return;
          }
          await this.del(
            indexKey,
            this.botKey(
              identifier,
              "quoteAuthorizationInteractingObjects",
              existing,
            ),
          );
        }
        await this.set(
          this.botKey(identifier, "quoteAuthorizations", id),
          JSON.stringify(await authorization.toJsonLd({ format: "compact" })),
        );
        await this.set(
          this.botKey(identifier, "quoteAuthorizationInteractingObjects", id),
          interactingObject.href,
        );
        await this.set(indexKey, id);
      },
    );
  }

  async getQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    const json = await this.get(
      this.botKey(identifier, "quoteAuthorizations", id),
    );
    if (json == null) return undefined;
    try {
      return await QuoteAuthorization.fromJsonLd(JSON.parse(json));
    } catch {
      return undefined;
    }
  }

  async findQuoteAuthorization(
    identifier: string,
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined> {
    const indexKey = this.botKey(
      identifier,
      "quoteAuthorizationsByInteractingObject",
      interactingObject.href,
    );
    return await this.withRedisLock(
      this.quoteAuthorizationLockKey(indexKey),
      async () => {
        const id = await this.get(indexKey);
        if (id == null) return undefined;
        const authorization = await this.getQuoteAuthorization(
          identifier,
          id as Uuid,
        );
        if (authorization == null && await this.get(indexKey) === id) {
          await this.del(
            indexKey,
            this.botKey(identifier, "quoteAuthorizationInteractingObjects", id),
          );
        }
        return authorization;
      },
    );
  }

  async removeQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    const key = this.botKey(identifier, "quoteAuthorizations", id);
    const interactingObjectKey = this.botKey(
      identifier,
      "quoteAuthorizationInteractingObjects",
      id,
    );
    const storedInteractingObject = await this.get(interactingObjectKey) ??
      await this.findStoredQuoteAuthorizationInteractingObject(key);
    if (storedInteractingObject == null) return undefined;
    const indexKey = this.botKey(
      identifier,
      "quoteAuthorizationsByInteractingObject",
      storedInteractingObject,
    );
    const parsed = await this.withRedisLock(
      this.quoteAuthorizationLockKey(indexKey),
      async () => {
        const json = await this.get(key);
        if (json == null) {
          await this.del(interactingObjectKey);
          return undefined;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(json);
        } catch {
          return undefined;
        }
        const interactingObject = getRawQuoteAuthorizationInteractingObject(
          parsed,
        );
        if (interactingObject?.href !== storedInteractingObject) {
          return undefined;
        }
        await this.del(key, interactingObjectKey);
        if (await this.get(indexKey) === id) await this.del(indexKey);
        return parsed;
      },
    );
    if (parsed == null) return undefined;
    try {
      return await QuoteAuthorization.fromJsonLd(parsed);
    } catch {
      return undefined;
    }
  }

  private async findStoredQuoteAuthorizationInteractingObject(
    key: string,
  ): Promise<string | undefined> {
    const json = await this.get(key);
    if (json == null) return undefined;
    try {
      const interactingObject = getRawQuoteAuthorizationInteractingObject(
        JSON.parse(json),
      );
      return interactingObject?.href;
    } catch {
      return undefined;
    }
  }

  async addQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
    messageId: Uuid,
    attribution?: URL,
  ): Promise<void> {
    await this.withRedisLock(
      this.quoteAuthorizationReferenceLockKey(identifier, authorization),
      async () => {
        const value: QuoteAuthorizationReferenceData = attribution == null
          ? { messageId }
          : { messageId, attribution: attribution.href };
        await this.set(
          this.botKey(identifier, "quoteAuthorizationRefs", authorization.href),
          JSON.stringify(value),
        );
        await this.zAdd(
          this.key("index", "quoteAuthorizationRefs", authorization.href),
          0,
          identifier,
        );
      },
    );
  }

  async findQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<Uuid | undefined> {
    const json = await this.get(
      this.botKey(identifier, "quoteAuthorizationRefs", authorization.href),
    );
    if (json == null) return undefined;
    try {
      const value = JSON.parse(json) as QuoteAuthorizationReferenceData;
      if (typeof value !== "object" || value == null) return undefined;
      return value.messageId;
    } catch {
      return undefined;
    }
  }

  async *findQuoteAuthorizationReferenceIdentifiers(
    authorization: URL,
  ): AsyncIterable<string> {
    yield* await this.zRange(
      this.key("index", "quoteAuthorizationRefs", authorization.href),
    );
  }

  async findQuoteAuthorizationReferenceAttribution(
    identifier: string,
    authorization: URL,
  ): Promise<URL | undefined> {
    const json = await this.get(
      this.botKey(identifier, "quoteAuthorizationRefs", authorization.href),
    );
    if (json == null) return undefined;
    let value: QuoteAuthorizationReferenceData;
    try {
      value = JSON.parse(json) as QuoteAuthorizationReferenceData;
    } catch {
      return undefined;
    }
    if (typeof value !== "object" || value == null) return undefined;
    if (value.attribution == null) return undefined;
    try {
      return new URL(value.attribution);
    } catch {
      return undefined;
    }
  }

  async removeQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<void> {
    await this.withRedisLock(
      this.quoteAuthorizationReferenceLockKey(identifier, authorization),
      async () => {
        await this.del(
          this.botKey(identifier, "quoteAuthorizationRefs", authorization.href),
        );
        await this.zRem(
          this.key("index", "quoteAuthorizationRefs", authorization.href),
          identifier,
        );
      },
    );
  }

  async vote(
    identifier: string,
    messageId: Uuid,
    voterId: URL,
    option: string,
  ): Promise<void> {
    await this.sAdd(
      this.botKey(identifier, "polls", messageId, "voters"),
      voterId.href,
    );
    await this.sAdd(
      this.botKey(identifier, "polls", messageId, "options", option),
      voterId.href,
    );
    await this.zAdd(
      this.botKey(identifier, "polls", messageId, "options"),
      0,
      option,
    );
  }

  countVoters(identifier: string, messageId: Uuid): Promise<number> {
    return this.sCard(this.botKey(identifier, "polls", messageId, "voters"));
  }

  async countVotes(
    identifier: string,
    messageId: Uuid,
  ): Promise<Readonly<Record<string, number>>> {
    const result: Record<string, number> = {};
    const options = await this.zRange(
      this.botKey(identifier, "polls", messageId, "options"),
    );
    await Promise.all(options.map(async (option) => {
      result[option] = await this.sCard(
        this.botKey(identifier, "polls", messageId, "options", option),
      );
    }));
    return result;
  }

  forIdentifier(identifier: string): ActorScopedRepository {
    return new ActorScopedRepository(this, identifier);
  }

  private quoteAuthorizationLockKey(indexKey: string): string {
    return `${indexKey}:lock`;
  }

  private quoteAuthorizationReferenceLockKey(
    identifier: string,
    authorization: URL,
  ): string {
    return this.botKey(
      identifier,
      "quoteAuthorizationRefs",
      authorization.href,
      "lock",
    );
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10);
  return 0;
}

function validatePositiveMilliseconds(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMessageScore(id: Uuid, activity: Create | Announce): number {
  if (activity.published != null) return activity.published.epochMilliseconds;
  return extractTimestamp(id);
}

function extractTimestamp(uuid: string): number {
  const match = uuidV7Pattern.exec(uuid);
  if (match == null) return 0;
  return Number.parseInt(`${match[1]}${match[2]}`, 16);
}

function getRawQuoteAuthorizationInteractingObject(
  json: unknown,
): URL | undefined {
  if (typeof json !== "object" || json == null) return undefined;
  if (!("interactingObject" in json)) return undefined;
  const interactingObject = json.interactingObject;
  if (typeof interactingObject !== "string") return undefined;
  try {
    return new URL(interactingObject);
  } catch {
    return undefined;
  }
}
