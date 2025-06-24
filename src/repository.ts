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
import type { KvKey, KvStore } from "@fedify/fedify/federation";
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
export type { KvKey, KvStore } from "@fedify/fedify/federation";
export { Announce, Create } from "@fedify/fedify/vocab";

/**
 * A UUID (universally unique identifier).
 * @since 0.3.0
 */
export type Uuid = ReturnType<typeof crypto.randomUUID>;

/**
 * A repository for storing bot data.
 * @since 0.3.0
 */
export interface Repository {
  /**
   * Sets the key pairs of the bot actor.
   * @param keyPairs The key pairs to set.
   */
  setKeyPairs(keyPairs: CryptoKeyPair[]): Promise<void>;

  /**
   * Gets the key pairs of the bot actor.
   * @returns The key pairs of the bot actor. If the key pairs do not exist,
   *          `undefined` will be returned.
   */
  getKeyPairs(): Promise<CryptoKeyPair[] | undefined>;

  /**
   * Adds a message to the repository.
   * @param id The UUID of the message.
   * @param activity The activity to add.
   */
  addMessage(id: Uuid, activity: Create | Announce): Promise<void>;

  /**
   * Updates a message in the repository.
   * @param id The UUID of the message.
   * @param updater The function to update the message.  The function will be
   *                called with the existing message, and the return value will
   *                be the new message.  If the function returns a promise, the
   *                promise will be awaited.  If the function returns either
   *                `undefined` or a promise that resolves to `undefined`,
   *                the message will not be updated.  If the message does not
   *                exist, the updater will not be called.
   * @returns `true` if the message was updated, `false` if the message does not
   *          exist.
   */
  updateMessage(
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean>;

  /**
   * Removes a message from the repository.
   * @param id The UUID of the message to remove.
   * @returns The removed activity.  If the message does not exist, `undefined`
   *          will be returned.
   */
  removeMessage(id: Uuid): Promise<Create | Announce | undefined>;

  /**
   * Gets messages from the repository.
   * @param options The options for getting messages.
   * @returns An async iterable of message activities.
   */
  getMessages(
    options?: RepositoryGetMessagesOptions,
  ): AsyncIterable<Create | Announce>;

  /**
   * Gets a message from the repository.
   * @param id The UUID of the message to get.
   * @returns The message activity, or `undefined` if the message does not
   *          exist.
   */
  getMessage(id: Uuid): Promise<Create | Announce | undefined>;

  /**
   * Counts the number of messages in the repository.
   * @returns The number of messages in the repository.
   */
  countMessages(): Promise<number>;

  /**
   * Adds a follower to the repository.
   * @param followId The URL of the follow request.
   * @param follower The actor who follows the bot.
   */
  addFollower(followId: URL, follower: Actor): Promise<void>;

  /**
   * Removes a follower from the repository.
   * @param followId The URL of the follow request.
   * @param followerId The ID of the actor to remove.
   * @returns The removed actor.  If the follower does not exist or the follow
   *          request is not about the follower, `undefined` will be returned.
   */
  removeFollower(followId: URL, followerId: URL): Promise<Actor | undefined>;

  /**
   * Checks if the repository has a follower.
   * @param followerId The ID of the follower to check.
   * @returns `true` if the repository has the follower, `false` otherwise.
   */
  hasFollower(followerId: URL): Promise<boolean>;

  /**
   * Gets followers from the repository.
   * @param options The options for getting followers.
   * @returns An async iterable of actors who follow the bot.
   */
  getFollowers(options?: RepositoryGetFollowersOptions): AsyncIterable<Actor>;

  /**
   * Counts the number of followers in the repository.
   * @returns The number of followers in the repository.
   */
  countFollowers(): Promise<number>;

  /**
   * Adds a sent follow request to the repository.
   * @param id The UUID of the follow request.
   * @param follow The follow activity to add.
   */
  addSentFollow(id: Uuid, follow: Follow): Promise<void>;

  /**
   * Removes a sent follow request from the repository.
   * @param id The UUID of the follow request to remove.
   * @returns The removed follow activity.  If the follow request does not
   *          exist, `undefined` will be returned.
   */
  removeSentFollow(id: Uuid): Promise<Follow | undefined>;

  /**
   * Gets a sent follow request from the repository.
   * @param id The UUID of the follow request to get.
   * @returns The `Follow` activity, or `undefined` if the follow request does
   *          not exist.
   */
  getSentFollow(id: Uuid): Promise<Follow | undefined>;

  /**
   * Adds a followee to the repository.
   * @param followeeId The ID of the followee to add.
   * @param follow The follow activity to add.
   */
  addFollowee(followeeId: URL, follow: Follow): Promise<void>;

  /**
   * Removes a followee from the repository.
   * @param followeeId The ID of the followee to remove.
   * @returns The `Follow` activity that was removed.  If the followee does not
   *          exist, `undefined` will be returned.
   */
  removeFollowee(followeeId: URL): Promise<Follow | undefined>;

  /**
   * Gets a followee from the repository.
   * @param followeeId The ID of the followee to get.
   * @returns The `Follow` activity, or `undefined` if the followee does not
   *          exist.
   */
  getFollowee(followeeId: URL): Promise<Follow | undefined>;
}

/**
 * Options for getting messages from the repository.
 * @since 0.3.0
 */
export interface RepositoryGetMessagesOptions {
  /**
   * The order of the messages.  If omitted, `"newest"` will be used.
   * @default `"newest"`
   */
  readonly order?: "oldest" | "newest";

  /**
   * The timestamp to get messages created at or before this time.
   * If omitted, no limit will be applied.
   */
  readonly until?: Temporal.Instant;

  /**
   * The timestamp to get messages created at or after this time.
   * If omitted, no limit will be applied.
   */
  readonly since?: Temporal.Instant;

  /**
   * The maximum number of messages to get.  If omitted, no limit will be
   * applied.
   */
  readonly limit?: number;
}

/**
 * Options for getting followers from the repository.
 * @since 0.3.0
 */
export interface RepositoryGetFollowersOptions {
  /**
   * The offset of the followers to get.  If omitted, 0 will be used.
   * @default `0`
   */
  readonly offset?: number;

  /**
   * The limit of the followers to get.  If omitted, no limit will be applied.
   */
  readonly limit?: number;
}

/**
 * The prefixes for key-value store keys used by the bot.
 * @since 0.3.0
 */
export interface KvStoreRepositoryPrefixes {
  /**
   * The key prefix used for storing the key pairs of the bot actor.
   * @default `["_botkit", "keyPairs"]`
   */
  readonly keyPairs: KvKey;

  /**
   * The key prefix used for storing published messages.
   * @default `["_botkit", "messages"]`
   */
  readonly messages: KvKey;

  /**
   * The key prefix used for storing followers.
   * @default `["_botkit", "followers"]`
   */
  readonly followers: KvKey;

  /**
   * The key prefix used for storing incoming follow requests.
   * @default `["_botkit", "followRequests"]`
   */
  readonly followRequests: KvKey;

  /**
   * The key prefix used for storing followees.
   * @default `["_botkit", "followees"]`
   */
  readonly followees: KvKey;

  /**
   * The key prefix used for storing outgoing follow requests.
   * @default `["_botkit", "follows"]`
   */
  readonly follows: KvKey;
}

/**
 * A repository for storing bot data using a key-value store.
 */
export class KvRepository implements Repository {
  readonly kv: KvStore;
  readonly prefixes: KvStoreRepositoryPrefixes;

  /**
   * Creates a new key-value store repository.
   * @param kv The key-value store to use.
   * @param prefixes The prefixes for key-value store keys.
   */
  constructor(kv: KvStore, prefixes?: KvStoreRepositoryPrefixes) {
    this.kv = kv;
    this.prefixes = {
      keyPairs: ["_botkit", "keyPairs"],
      messages: ["_botkit", "messages"],
      followers: ["_botkit", "followers"],
      followRequests: ["_botkit", "followRequests"],
      followees: ["_botkit", "followees"],
      follows: ["_botkit", "follows"],
      ...prefixes ?? {},
    };
  }

  async setKeyPairs(keyPairs: CryptoKeyPair[]): Promise<void> {
    const pairs: KeyPair[] = [];
    for (const keyPair of keyPairs) {
      const pair: KeyPair = {
        private: await exportJwk(keyPair.privateKey),
        public: await exportJwk(keyPair.publicKey),
      };
      pairs.push(pair);
    }
    await this.kv.set(this.prefixes.keyPairs, pairs);
  }

  async getKeyPairs(): Promise<CryptoKeyPair[] | undefined> {
    const keyPairs = await this.kv.get<KeyPair[]>(this.prefixes.keyPairs);
    if (keyPairs == null) return undefined;
    const promises = keyPairs.map(async (pair) => ({
      privateKey: await importJwk(pair.private, "private"),
      publicKey: await importJwk(pair.public, "public"),
    }));
    return await Promise.all(promises);
  }

  async addMessage(id: Uuid, activity: Create | Announce): Promise<void> {
    const messageKey: KvKey = [...this.prefixes.messages, id];
    await this.kv.set(
      messageKey,
      await activity.toJsonLd({ format: "compact" }),
    );
    const lockKey: KvKey = [...this.prefixes.messages, "lock"];
    const listKey: KvKey = this.prefixes.messages;
    do {
      await this.kv.set(lockKey, id);
      const set = new Set(await this.kv.get<string[]>(listKey) ?? []);
      set.add(id);
      const list = [...set];
      list.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      await this.kv.set(listKey, list);
    } while (await this.kv.get(lockKey) !== id);
  }

  async updateMessage(
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    const kvKey: KvKey = [...this.prefixes.messages, id];
    const createJson = await this.kv.get(kvKey);
    if (createJson == null) return false;
    const activity = await Activity.fromJsonLd(createJson);
    if (!(activity instanceof Create || activity instanceof Announce)) {
      return false;
    }
    const newActivity = await updater(activity);
    if (newActivity == null) return false;
    await this.kv.set(
      kvKey,
      await newActivity.toJsonLd({ format: "compact" }),
    );
    return true;
  }

  async removeMessage(id: Uuid): Promise<Create | Announce | undefined> {
    const listKey: KvKey = this.prefixes.messages;
    const lockKey: KvKey = [...listKey, "lock"];
    const lockId = `${id}:delete`;
    do {
      await this.kv.set(lockKey, lockId);
      const set = new Set(await this.kv.get<string[]>(listKey) ?? []);
      set.delete(id);
      const list = [...set];
      list.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      await this.kv.set(listKey, list);
    } while (await this.kv.get(lockKey) !== lockId);
    const messageKey: KvKey = [...listKey, id];
    const activityJson = await this.kv.get(messageKey);
    if (activityJson == null) return;
    await this.kv.delete(messageKey);
    const activity = await Activity.fromJsonLd(activityJson);
    if (activity instanceof Create || activity instanceof Announce) {
      return activity;
    }
    return undefined;
  }

  async *getMessages(
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    const { order, until, since, limit } = options;
    const untilTs = until == null ? null : until.epochMilliseconds;
    const sinceTs = since == null ? null : since.epochMilliseconds;
    let messageIds = await this.kv.get<string[]>(this.prefixes.messages) ?? [];
    if (sinceTs != null) {
      const offset = messageIds.findIndex((id) =>
        extractTimestamp(id) >= sinceTs
      );
      messageIds = messageIds.slice(offset);
    }
    if (untilTs != null) {
      const offset = messageIds.findLastIndex((id) =>
        extractTimestamp(id) <= untilTs
      );
      messageIds = messageIds.slice(0, offset + 1);
    }
    if (order == null || order === "newest") {
      messageIds = messageIds.toReversed();
    }
    if (limit != null) {
      messageIds = messageIds.slice(0, limit);
    }
    for (const id of messageIds) {
      const messageJson = await this.kv.get([...this.prefixes.messages, id]);
      if (messageJson == null) continue;
      try {
        const activity = await Activity.fromJsonLd(messageJson);
        if (activity instanceof Create || activity instanceof Announce) {
          yield activity;
        }
      } catch {
        continue;
      }
    }
  }

  async getMessage(id: Uuid): Promise<Create | Announce | undefined> {
    const json = await this.kv.get([...this.prefixes.messages, id]);
    if (json == null) return undefined;
    let activity: Activity;
    try {
      activity = await Activity.fromJsonLd(json);
    } catch (e) {
      if (e instanceof TypeError) return undefined;
      throw e;
    }
    if (activity instanceof Create || activity instanceof Announce) {
      return activity;
    }
    return undefined;
  }

  async countMessages(): Promise<number> {
    const messageIds = await this.kv.get<string[]>(this.prefixes.messages) ??
      [];
    return messageIds.length;
  }

  async addFollower(followRequestId: URL, follower: Actor): Promise<void> {
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }
    const followerKey: KvKey = [...this.prefixes.followers, follower.id.href];
    await this.kv.set(
      followerKey,
      await follower.toJsonLd({ format: "compact" }),
    );
    const lockKey: KvKey = [...this.prefixes.followers, "lock"];
    const listKey: KvKey = this.prefixes.followers;
    do {
      await this.kv.set(lockKey, follower.id.href);
      const list = await this.kv.get<string[]>(listKey) ?? [];
      if (!list.includes(follower.id.href)) list.push(follower.id.href);
      await this.kv.set(listKey, list);
    } while (await this.kv.get(lockKey) !== follower.id.href);
    const followRequestKey: KvKey = [
      ...this.prefixes.followRequests,
      followRequestId.href,
    ];
    await this.kv.set(followRequestKey, follower.id.href);
  }

  async removeFollower(
    followRequestId: URL,
    actorId: URL,
  ): Promise<Actor | undefined> {
    const followRequestKey: KvKey = [
      ...this.prefixes.followRequests,
      followRequestId.href,
    ];
    const followerId = await this.kv.get<string>(followRequestKey);
    if (followerId == null) return undefined;
    const followerKey: KvKey = [...this.prefixes.followers, followerId];
    if (followerId !== actorId.href) return undefined;
    const followerJson = await this.kv.get(followerKey);
    if (followerJson == null) return undefined;
    let follower: Object;
    try {
      follower = await Object.fromJsonLd(followerJson);
    } catch {
      return undefined;
    }
    if (!isActor(follower)) return undefined;
    const lockKey: KvKey = [...this.prefixes.followers, "lock"];
    const listKey: KvKey = this.prefixes.followers;
    do {
      await this.kv.set(lockKey, followerId);
      let list = await this.kv.get<string[]>(listKey) ?? [];
      list = list.filter((id) => id !== followerId);
      await this.kv.set(listKey, list);
    } while (await this.kv.get(lockKey) !== followerId);
    await this.kv.delete(followerKey);
    await this.kv.delete(followRequestKey);
    return follower;
  }

  async hasFollower(followerId: URL): Promise<boolean> {
    return await this.kv.get<unknown>([
      ...this.prefixes.followers,
      followerId.href,
    ]) != null;
  }

  async *getFollowers(
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    const { offset = 0, limit } = options;
    let followerIds = await this.kv.get<string[]>(this.prefixes.followers) ??
      [];
    followerIds = followerIds.slice(offset);
    if (limit != null) {
      followerIds = followerIds.slice(0, limit);
    }
    for (const id of followerIds) {
      const json = await this.kv.get([...this.prefixes.followers, id]);
      let actor: Object;
      try {
        actor = await Object.fromJsonLd(json);
      } catch (e) {
        if (e instanceof TypeError) continue;
        throw e;
      }
      if (isActor(actor)) yield actor;
    }
  }

  async countFollowers(): Promise<number> {
    const followerIds = await this.kv.get<string[]>(this.prefixes.followers) ??
      [];
    return followerIds.length;
  }

  async addSentFollow(id: Uuid, follow: Follow): Promise<void> {
    await this.kv.set(
      [...this.prefixes.follows, id],
      await follow.toJsonLd({ format: "compact" }),
    );
  }

  async removeSentFollow(id: Uuid): Promise<Follow | undefined> {
    const follow = await this.getSentFollow(id);
    if (follow == null) return undefined;
    await this.kv.delete([...this.prefixes.follows, id]);
    return follow;
  }

  async getSentFollow(id: Uuid): Promise<Follow | undefined> {
    const followJson = await this.kv.get([...this.prefixes.follows, id]);
    if (followJson == null) return undefined;
    try {
      return await Follow.fromJsonLd(followJson);
    } catch {
      return undefined;
    }
  }

  async addFollowee(followeeId: URL, follow: Follow): Promise<void> {
    await this.kv.set(
      [...this.prefixes.followees, followeeId.href],
      await follow.toJsonLd({ format: "compact" }),
    );
  }

  async removeFollowee(followeeId: URL): Promise<Follow | undefined> {
    const follow = await this.getFollowee(followeeId);
    if (follow == null) return undefined;
    await this.kv.delete([...this.prefixes.followees, followeeId.href]);
    return follow;
  }

  async getFollowee(followeeId: URL): Promise<Follow | undefined> {
    const json = await this.kv.get([
      ...this.prefixes.followees,
      followeeId.href,
    ]);
    if (json == null) return undefined;
    try {
      return await Follow.fromJsonLd(json);
    } catch {
      return undefined;
    }
  }
}

interface KeyPair {
  private: JsonWebKey;
  public: JsonWebKey;
}

/**
 * Extracts the timestamp from a UUIDv7.
 * @param uuid The UUIDv7 string to extract the timestamp from.
 * @return The timestamp in milliseconds since the Unix epoch.
 * @internal
 */
function extractTimestamp(uuid: string): number {
  // UUIDv7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
  // The timestamp is in the first 6 bytes (48 bits) of the UUID.
  if (uuid.length !== 36 || uuid[14] !== "7") {
    throw new TypeError("Invalid UUIDv7 format.");
  }
  const timestampHex = uuid.slice(0, 8) + uuid.slice(9, 13);
  return parseInt(timestampHex, 16);
}

/**
 * A repository for storing bot data in memory.  This repository is not
 * persistent and is only suitable for testing or development.
 */
export class MemoryRepository implements Repository {
  keyPairs?: CryptoKeyPair[];
  messages: Map<Uuid, Create | Announce> = new Map();
  followers: Map<string, Actor> = new Map();
  followRequests: Record<string, string> = {};
  sentFollows: Record<string, Follow> = {};
  followees: Record<string, Follow> = {};

  setKeyPairs(keyPairs: CryptoKeyPair[]): Promise<void> {
    this.keyPairs = keyPairs;
    return Promise.resolve();
  }

  getKeyPairs(): Promise<CryptoKeyPair[] | undefined> {
    return Promise.resolve(this.keyPairs);
  }

  addMessage(id: Uuid, activity: Create | Announce): Promise<void> {
    this.messages.set(id, activity);
    return Promise.resolve();
  }

  async updateMessage(
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    const existing = this.messages.get(id);
    if (existing == null) return false;
    const newActivity = await updater(existing);
    if (newActivity == null) return false;
    this.messages.set(id, newActivity);
    return true;
  }

  removeMessage(id: Uuid): Promise<Create | Announce | undefined> {
    const activity = this.messages.get(id);
    this.messages.delete(id);
    return Promise.resolve(activity);
  }

  async *getMessages(
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    const { order, until, since, limit } = options;
    let messages = [...this.messages.values()];
    if (since != null) {
      messages = messages.filter((message) =>
        message.published != null &&
        Temporal.Instant.compare(message.published, since) >= 0
      );
    }
    if (until != null) {
      messages = messages.filter((message) =>
        message.published != null &&
        Temporal.Instant.compare(message.published, until) <= 0
      );
    }
    if (order === "oldest") {
      messages.sort((a, b) =>
        (a.published?.epochMilliseconds ?? 0) -
        (b.published?.epochMilliseconds ?? 0)
      );
    } else {
      messages.sort((a, b) =>
        (b.published?.epochMilliseconds ?? 0) -
        (a.published?.epochMilliseconds ?? 0)
      );
    }
    if (limit != null) {
      messages.slice(0, limit);
    }
    for (const message of messages) yield message;
  }

  getMessage(id: Uuid): Promise<Create | Announce | undefined> {
    return Promise.resolve(this.messages.get(id));
  }

  countMessages(): Promise<number> {
    return Promise.resolve(this.messages.size);
  }

  addFollower(followId: URL, follower: Actor): Promise<void> {
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }
    this.followers.set(follower.id.href, follower);
    this.followRequests[followId.href] = follower.id.href;
    return Promise.resolve();
  }

  removeFollower(followId: URL, followerId: URL): Promise<Actor | undefined> {
    const existing = this.followRequests[followId.href];
    if (existing == null || existing !== followerId.href) {
      return Promise.resolve(undefined);
    }
    delete this.followRequests[followId.href];
    const follower = this.followers.get(followerId.href);
    this.followers.delete(followerId.href);
    return Promise.resolve(follower);
  }

  hasFollower(followerId: URL): Promise<boolean> {
    return Promise.resolve(this.followers.has(followerId.href));
  }

  async *getFollowers(
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    const { offset = 0, limit } = options;
    let followers = [...this.followers.values()];
    followers.sort((a, b) => b.id!.href.localeCompare(a.id!.href) ?? 0);
    if (offset > 0) {
      followers = followers.slice(offset);
    }
    if (limit != null) {
      followers = followers.slice(0, limit);
    }
    for (const follower of followers) {
      yield follower;
    }
  }

  countFollowers(): Promise<number> {
    return Promise.resolve(this.followers.size);
  }

  addSentFollow(id: Uuid, follow: Follow): Promise<void> {
    this.sentFollows[id] = follow;
    return Promise.resolve();
  }

  removeSentFollow(id: Uuid): Promise<Follow | undefined> {
    const follow = this.sentFollows[id];
    delete this.sentFollows[id];
    return Promise.resolve(follow);
  }

  getSentFollow(id: Uuid): Promise<Follow | undefined> {
    return Promise.resolve(this.sentFollows[id]);
  }

  addFollowee(followeeId: URL, follow: Follow): Promise<void> {
    this.followees[followeeId.href] = follow;
    return Promise.resolve();
  }

  removeFollowee(followeeId: URL): Promise<Follow | undefined> {
    const follow = this.followees[followeeId.href];
    delete this.followees[followeeId.href];
    return Promise.resolve(follow);
  }

  getFollowee(followeeId: URL): Promise<Follow | undefined> {
    return Promise.resolve(this.followees[followeeId.href]);
  }
}

/**
 * A repository decorator that adds an in-memory cache layer on top of another
 * repository. This is useful for improving performance by reducing the number
 * of accesses to the underlying persistent storage, but it increases memory
 * usage. The cache is not persistent and will be lost when the process exits.
 *
 * Note: List operations like `getMessages` and `getFollowers`, and count
 * operations like `countMessages` and `countFollowers` are not cached and
 * always delegate to the underlying repository.
 * @since 0.3.0
 */
export class MemoryCachedRepository implements Repository {
  private underlying: Repository;
  private cache: MemoryRepository;

  /**
   * Creates a new memory-cached repository.
   * @param underlying The underlying repository to cache.
   * @param cache An optional `MemoryRepository` instance to use as the cache.
   *              If not provided, a new one will be created internally.
   */
  constructor(underlying: Repository, cache?: MemoryRepository) {
    this.underlying = underlying;
    this.cache = cache ?? new MemoryRepository();
  }

  async setKeyPairs(keyPairs: CryptoKeyPair[]): Promise<void> {
    await this.underlying.setKeyPairs(keyPairs);
    await this.cache.setKeyPairs(keyPairs);
  }

  async getKeyPairs(): Promise<CryptoKeyPair[] | undefined> {
    let keyPairs = await this.cache.getKeyPairs();
    if (keyPairs === undefined) {
      keyPairs = await this.underlying.getKeyPairs();
      if (keyPairs !== undefined) await this.cache.setKeyPairs(keyPairs);
    }
    return keyPairs;
  }

  async addMessage(id: Uuid, activity: Create | Announce): Promise<void> {
    await this.underlying.addMessage(id, activity);
    await this.cache.addMessage(id, activity);
  }

  async updateMessage(
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    // Apply update to underlying first
    const updated = await this.underlying.updateMessage(id, updater);
    if (updated) {
      // If successful, fetch the updated message and update the cache
      const updatedMessage = await this.underlying.getMessage(id);
      if (updatedMessage) {
        await this.cache.addMessage(id, updatedMessage); // Use addMessage which acts like set
      } else {
        // Should not happen if updateMessage returned true, but handle defensively
        await this.cache.removeMessage(id);
      }
    }
    return updated;
  }

  async removeMessage(id: Uuid): Promise<Create | Announce | undefined> {
    const removedActivity = await this.underlying.removeMessage(id);
    if (removedActivity !== undefined) {
      await this.cache.removeMessage(id);
    }
    return removedActivity;
  }

  // getMessages is not cached due to complexity with options
  getMessages(
    options?: RepositoryGetMessagesOptions,
  ): AsyncIterable<Create | Announce> {
    return this.underlying.getMessages(options);
  }

  async getMessage(id: Uuid): Promise<Create | Announce | undefined> {
    let message = await this.cache.getMessage(id);
    if (message === undefined) {
      message = await this.underlying.getMessage(id);
      if (message !== undefined) {
        await this.cache.addMessage(id, message); // Use addMessage which acts like set
      }
    }
    return message;
  }

  // countMessages is not cached
  countMessages(): Promise<number> {
    return this.underlying.countMessages();
  }

  async addFollower(followId: URL, follower: Actor): Promise<void> {
    await this.underlying.addFollower(followId, follower);
    await this.cache.addFollower(followId, follower);
  }

  async removeFollower(
    followId: URL,
    followerId: URL,
  ): Promise<Actor | undefined> {
    const removedFollower = await this.underlying.removeFollower(
      followId,
      followerId,
    );
    if (removedFollower !== undefined) {
      await this.cache.removeFollower(followId, followerId);
    }
    return removedFollower;
  }

  async hasFollower(followerId: URL): Promise<boolean> {
    // Check cache first for potentially faster response
    if (await this.cache.hasFollower(followerId)) {
      return true;
    }
    // If not in cache, check underlying and update cache if found
    const exists = await this.underlying.hasFollower(followerId);
    // Note: We don't automatically add to cache here, as we don't have the Actor object
    // It will be cached if addFollower is called or if getFollowers iterates over it (though getFollowers isn't cached)
    return exists;
  }

  // getFollowers is not cached due to complexity with options
  getFollowers(options?: RepositoryGetFollowersOptions): AsyncIterable<Actor> {
    // We could potentially cache followers as they are iterated,
    // but for simplicity, delegate directly for now.
    return this.underlying.getFollowers(options);
  }

  // countFollowers is not cached
  countFollowers(): Promise<number> {
    return this.underlying.countFollowers();
  }

  async addSentFollow(id: Uuid, follow: Follow): Promise<void> {
    await this.underlying.addSentFollow(id, follow);
    await this.cache.addSentFollow(id, follow);
  }

  async removeSentFollow(id: Uuid): Promise<Follow | undefined> {
    const removedFollow = await this.underlying.removeSentFollow(id);
    if (removedFollow !== undefined) {
      await this.cache.removeSentFollow(id);
    }
    return removedFollow;
  }

  async getSentFollow(id: Uuid): Promise<Follow | undefined> {
    let follow = await this.cache.getSentFollow(id);
    if (follow === undefined) {
      follow = await this.underlying.getSentFollow(id);
      if (follow !== undefined) {
        await this.cache.addSentFollow(id, follow);
      }
    }
    return follow;
  }

  async addFollowee(followeeId: URL, follow: Follow): Promise<void> {
    await this.underlying.addFollowee(followeeId, follow);
    await this.cache.addFollowee(followeeId, follow);
  }

  async removeFollowee(followeeId: URL): Promise<Follow | undefined> {
    const removedFollow = await this.underlying.removeFollowee(followeeId);
    if (removedFollow !== undefined) {
      await this.cache.removeFollowee(followeeId);
    }
    return removedFollow;
  }

  async getFollowee(followeeId: URL): Promise<Follow | undefined> {
    let follow = await this.cache.getFollowee(followeeId);
    if (follow === undefined) {
      follow = await this.underlying.getFollowee(followeeId);
      if (follow !== undefined) {
        await this.cache.addFollowee(followeeId, follow);
      }
    }
    return follow;
  }
}
