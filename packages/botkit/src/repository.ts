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
import "./temporal.ts";
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
  QuoteAuthorization,
} from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
export type { KvKey, KvStore } from "@fedify/fedify/federation";
export { Announce, Create } from "@fedify/vocab";

const logger = getLogger(["botkit", "repository"]);
const kvLockPollIntervalMs = 100;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface KvLock {
  readonly id: string;
  readonly released?: boolean;
}

function isKvLock(value: unknown): value is KvLock {
  return typeof value === "object" && value != null && "id" in value &&
    typeof value.id === "string";
}

function isReleasedKvLock(value: unknown): value is KvLock {
  return isKvLock(value) && value.released === true;
}

function isLegacyKvLock(value: unknown): value is string {
  return typeof value === "string" && !uuidPattern.test(value);
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

/**
 * A UUID (universally unique identifier).
 * @since 0.3.0
 */
export type Uuid = ReturnType<typeof crypto.randomUUID>;

interface QuoteAuthorizationReferenceData {
  readonly messageId: Uuid;
  readonly attribution?: string;
}

/**
 * A repository for storing bot data.
 *
 * Since BotKit 0.5.0, a single repository can store data for multiple bot
 * actors hosted on the same instance.  Every method takes the identifier of
 * the bot actor that owns the data as its first parameter, and data belonging
 * to different identifiers are completely isolated from each other.
 *
 * If you deal with a single bot actor, you can use
 * the {@link Repository.forIdentifier} method to get
 * an {@link ActorScopedRepository} view which binds the identifier once.
 * @since 0.3.0
 */
export interface Repository {
  /**
   * Sets the key pairs of a bot actor.
   * @param identifier The identifier of the bot actor that owns the key pairs.
   * @param keyPairs The key pairs to set.
   */
  setKeyPairs(identifier: string, keyPairs: CryptoKeyPair[]): Promise<void>;

  /**
   * Gets the key pairs of a bot actor.
   * @param identifier The identifier of the bot actor that owns the key pairs.
   * @returns The key pairs of the bot actor. If the key pairs do not exist,
   *          `undefined` will be returned.
   */
  getKeyPairs(identifier: string): Promise<CryptoKeyPair[] | undefined>;

  /**
   * Adds a message to the repository.
   * @param identifier The identifier of the bot actor that owns the message.
   * @param id The UUID of the message.
   * @param activity The activity to add.
   */
  addMessage(
    identifier: string,
    id: Uuid,
    activity: Create | Announce,
  ): Promise<void>;

  /**
   * Updates a message in the repository.
   * @param identifier The identifier of the bot actor that owns the message.
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
    identifier: string,
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean>;

  /**
   * Removes a message from the repository.
   * @param identifier The identifier of the bot actor that owns the message.
   * @param id The UUID of the message to remove.
   * @returns The removed activity.  If the message does not exist, `undefined`
   *          will be returned.
   */
  removeMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined>;

  /**
   * Gets messages from the repository.
   * @param identifier The identifier of the bot actor that owns the messages.
   * @param options The options for getting messages.
   * @returns An async iterable of message activities.
   */
  getMessages(
    identifier: string,
    options?: RepositoryGetMessagesOptions,
  ): AsyncIterable<Create | Announce>;

  /**
   * Gets a message from the repository.
   * @param identifier The identifier of the bot actor that owns the message.
   * @param id The UUID of the message to get.
   * @returns The message activity, or `undefined` if the message does not
   *          exist.
   */
  getMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined>;

  /**
   * Counts the number of messages in the repository.
   * @param identifier The identifier of the bot actor that owns the messages.
   * @returns The number of messages in the repository.
   */
  countMessages(identifier: string): Promise<number>;

  /**
   * Adds a follower to the repository.
   * @param identifier The identifier of the bot actor that is followed.
   * @param followId The URL of the follow request.
   * @param follower The actor who follows the bot.
   */
  addFollower(
    identifier: string,
    followId: URL,
    follower: Actor,
  ): Promise<void>;

  /**
   * Removes a follower from the repository.
   * @param identifier The identifier of the bot actor that is followed.
   * @param followId The URL of the follow request.
   * @param followerId The ID of the actor to remove.
   * @returns The removed actor.  If the follower does not exist, the follow
   *          request is not about the follower, or the actor still has another
   *          active follow request, `undefined` will be returned.
   */
  removeFollower(
    identifier: string,
    followId: URL,
    followerId: URL,
  ): Promise<Actor | undefined>;

  /**
   * Checks if the repository has a follower.
   * @param identifier The identifier of the bot actor that is followed.
   * @param followerId The ID of the follower to check.
   * @returns `true` if the repository has the follower, `false` otherwise.
   */
  hasFollower(identifier: string, followerId: URL): Promise<boolean>;

  /**
   * Gets followers from the repository.
   * @param identifier The identifier of the bot actor that is followed.
   * @param options The options for getting followers.
   * @returns An async iterable of actors who follow the bot.
   */
  getFollowers(
    identifier: string,
    options?: RepositoryGetFollowersOptions,
  ): AsyncIterable<Actor>;

  /**
   * Counts the number of followers in the repository.
   * @param identifier The identifier of the bot actor that is followed.
   * @returns The number of followers in the repository.
   */
  countFollowers(identifier: string): Promise<number>;

  /**
   * Adds a sent follow request to the repository.
   * @param identifier The identifier of the bot actor that sent the follow
   *                   request.
   * @param id The UUID of the follow request.
   * @param follow The follow activity to add.
   */
  addSentFollow(identifier: string, id: Uuid, follow: Follow): Promise<void>;

  /**
   * Removes a sent follow request from the repository.
   * @param identifier The identifier of the bot actor that sent the follow
   *                   request.
   * @param id The UUID of the follow request to remove.
   * @returns The removed follow activity.  If the follow request does not
   *          exist, `undefined` will be returned.
   */
  removeSentFollow(identifier: string, id: Uuid): Promise<Follow | undefined>;

  /**
   * Gets a sent follow request from the repository.
   * @param identifier The identifier of the bot actor that sent the follow
   *                   request.
   * @param id The UUID of the follow request to get.
   * @returns The `Follow` activity, or `undefined` if the follow request does
   *          not exist.
   */
  getSentFollow(identifier: string, id: Uuid): Promise<Follow | undefined>;

  /**
   * Adds a followee to the repository.
   * @param identifier The identifier of the bot actor that follows
   *                   the followee.
   * @param followeeId The ID of the followee to add.
   * @param follow The follow activity to add.
   */
  addFollowee(
    identifier: string,
    followeeId: URL,
    follow: Follow,
  ): Promise<void>;

  /**
   * Removes a followee from the repository.
   * @param identifier The identifier of the bot actor that follows
   *                   the followee.
   * @param followeeId The ID of the followee to remove.
   * @returns The `Follow` activity that was removed.  If the followee does not
   *          exist, `undefined` will be returned.
   */
  removeFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined>;

  /**
   * Gets a followee from the repository.
   * @param identifier The identifier of the bot actor that follows
   *                   the followee.
   * @param followeeId The ID of the followee to get.
   * @returns The `Follow` activity, or `undefined` if the followee does not
   *          exist.
   */
  getFollowee(identifier: string, followeeId: URL): Promise<Follow | undefined>;

  /**
   * Finds the identifiers of the bot actors that follow the given actor.
   * This is the reverse lookup of {@link Repository.getFollowee}: it answers
   * the question “which bots on this instance follow this remote actor?”,
   * which is used for routing incoming activities from followed actors to
   * the right bots.
   * @param followeeId The ID of the followee to look up.
   * @returns An async iterable of the identifiers of the bot actors that
   *          follow the given actor.  If no bots follow the actor, an empty
   *          iterable will be returned.
   * @since 0.5.0
   */
  findFollowedBots(followeeId: URL): AsyncIterable<string>;

  /**
   * Adds a quote authorization stamp to the repository.
   * @param identifier The identifier of the bot actor that issued the stamp.
   * @param id The UUID of the quote authorization.
   * @param authorization The quote authorization stamp to add.
   * @since 0.5.0
   */
  addQuoteAuthorization(
    identifier: string,
    id: Uuid,
    authorization: QuoteAuthorization,
  ): Promise<void>;

  /**
   * Gets a quote authorization stamp from the repository.
   * @param identifier The identifier of the bot actor that issued the stamp.
   * @param id The UUID of the quote authorization.
   * @returns The quote authorization stamp, or `undefined` if it does not
   *          exist.
   * @since 0.5.0
   */
  getQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined>;

  /**
   * Finds a quote authorization stamp by the quote post it authorizes.
   * @param identifier The identifier of the bot actor that issued the stamp.
   * @param interactingObject The URI of the quote post.
   * @returns The quote authorization stamp, or `undefined` if it does not
   *          exist.
   * @since 0.5.0
   */
  findQuoteAuthorization(
    identifier: string,
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined>;

  /**
   * Removes a quote authorization stamp from the repository.
   * @param identifier The identifier of the bot actor that issued the stamp.
   * @param id The UUID of the quote authorization.
   * @returns The removed quote authorization stamp, or `undefined` if it does
   *          not exist.
   * @since 0.5.0
   */
  removeQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined>;

  /**
   * Adds a reference to a quote authorization stamp received for one of
   * the bot's own quote posts.
   * @param identifier The identifier of the bot actor that owns the message.
   * @param authorization The URI of the received quote authorization stamp.
   * @param messageId The UUID of the bot's quote message.
   * @param attribution The actor that issued the authorization stamp.
   * @since 0.5.0
   */
  addQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
    messageId: Uuid,
    attribution?: URL,
  ): Promise<void>;

  /**
   * Finds the bot's quote message that depends on a received quote
   * authorization stamp.
   * @param identifier The identifier of the bot actor that owns the message.
   * @param authorization The URI of the received quote authorization stamp.
   * @returns The UUID of the bot's quote message, or `undefined`.
   * @since 0.5.0
   */
  findQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<Uuid | undefined>;

  /**
   * Finds bot identifiers whose quote messages depend on a received quote
   * authorization stamp.
   * @param authorization The URI of the received quote authorization stamp.
   * @returns The identifiers of bot actors that reference the stamp.
   * @since 0.5.0
   */
  findQuoteAuthorizationReferenceIdentifiers(
    authorization: URL,
  ): AsyncIterable<string>;

  /**
   * Finds the actor that issued a received quote authorization stamp.
   * @param identifier The identifier of the bot actor that owns the message.
   * @param authorization The URI of the received quote authorization stamp.
   * @returns The URI of the actor that issued the stamp, or `undefined`.
   * @since 0.5.0
   */
  findQuoteAuthorizationReferenceAttribution(
    identifier: string,
    authorization: URL,
  ): Promise<URL | undefined>;

  /**
   * Removes the reference to a received quote authorization stamp.
   * @param identifier The identifier of the bot actor that owns the message.
   * @param authorization The URI of the received quote authorization stamp.
   * @since 0.5.0
   */
  removeQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<void>;

  /**
   * Records a vote in a poll.  If the same voter had already voted for the
   * same option in a poll, the vote will be silently ignored.
   * @param identifier The identifier of the bot actor that owns the poll.
   * @param messageId The UUID of the poll message to vote on.
   * @param voterId The ID of the voter.  It should be a URL of the actor who is
   *                voting.
   * @param option The option that the voter is voting for.  It should be one of
   *               the options in the poll.  If the poll allows multiple
   *               selections, this should be a single option that the voter is
   *               voting for, which is one of multiple calls to this method.
   * @since 0.3.0
   */
  vote(
    identifier: string,
    messageId: Uuid,
    voterId: URL,
    option: string,
  ): Promise<void>;

  /**
   * Counts the number of voters in a poll.  Even if the poll allows multiple
   * selections, each voter is counted only once.
   * @param identifier The identifier of the bot actor that owns the poll.
   * @param messageId The UUID of the poll message to count voters for.
   * @returns The number of voters in the poll.  If the poll does not exist,
   *          0 will be returned.
   * @since 0.3.0
   */
  countVoters(identifier: string, messageId: Uuid): Promise<number>;

  /**
   * Counts the votes for each option in a poll.  If the poll allows multiple
   * selections, each option is counted separately, and the same voter can
   * vote for multiple options.
   * @param identifier The identifier of the bot actor that owns the poll.
   * @param messageId The UUID of the poll message to count votes for.
   * @returns A record where the keys are the options and the values are
   *          the number of votes for each option.  If the poll does not exist,
   *          an empty record will be returned.  Some options may not be
   *          present in the record if no votes were cast for them.
   * @since 0.3.0
   */
  countVotes(
    identifier: string,
    messageId: Uuid,
  ): Promise<Readonly<Record<string, number>>>;

  /**
   * Returns a view of this repository which is scoped to the given bot actor
   * identifier.  The returned view exposes the same operations without
   * the `identifier` parameter.
   * @param identifier The identifier of the bot actor to scope the view to.
   * @returns The scoped repository view.
   * @since 0.5.0
   */
  forIdentifier(identifier: string): ActorScopedRepository;

  /**
   * Migrates data stored by BotKit 0.4 or earlier, which was not scoped by
   * bot actor identifiers, so that it belongs to the given identifier.
   * Implementations should make this operation idempotent: calling it again
   * after a successful migration should be a no-op.
   *
   * This method is optional; repositories which have no legacy data format
   * do not need to implement it.
   * @param identifier The identifier of the bot actor that adopts the legacy
   *                   data.
   * @since 0.5.0
   */
  migrate?(identifier: string): Promise<void>;
}

/**
 * A view of a {@link Repository} which is scoped to a single bot actor
 * identifier.  It exposes the same operations as {@link Repository} without
 * the `identifier` parameter, which is bound at construction time.
 * @since 0.5.0
 */
export class ActorScopedRepository {
  /**
   * The underlying repository.
   */
  readonly repository: Repository;

  /**
   * The identifier of the bot actor this view is scoped to.
   */
  readonly identifier: string;

  /**
   * Creates a new scoped repository view.
   * @param repository The underlying repository.
   * @param identifier The identifier of the bot actor to scope the view to.
   */
  constructor(repository: Repository, identifier: string) {
    this.repository = repository;
    this.identifier = identifier;
  }

  /**
   * Sets the key pairs of the bot actor.
   * @param keyPairs The key pairs to set.
   */
  setKeyPairs(keyPairs: CryptoKeyPair[]): Promise<void> {
    return this.repository.setKeyPairs(this.identifier, keyPairs);
  }

  /**
   * Gets the key pairs of the bot actor.
   * @returns The key pairs of the bot actor. If the key pairs do not exist,
   *          `undefined` will be returned.
   */
  getKeyPairs(): Promise<CryptoKeyPair[] | undefined> {
    return this.repository.getKeyPairs(this.identifier);
  }

  /**
   * Adds a message to the repository.
   * @param id The UUID of the message.
   * @param activity The activity to add.
   */
  addMessage(id: Uuid, activity: Create | Announce): Promise<void> {
    return this.repository.addMessage(this.identifier, id, activity);
  }

  /**
   * Updates a message in the repository.
   * @param id The UUID of the message.
   * @param updater The function to update the message.  See also
   *                {@link Repository.updateMessage}.
   * @returns `true` if the message was updated, `false` if the message does not
   *          exist.
   */
  updateMessage(
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    return this.repository.updateMessage(this.identifier, id, updater);
  }

  /**
   * Removes a message from the repository.
   * @param id The UUID of the message to remove.
   * @returns The removed activity.  If the message does not exist, `undefined`
   *          will be returned.
   */
  removeMessage(id: Uuid): Promise<Create | Announce | undefined> {
    return this.repository.removeMessage(this.identifier, id);
  }

  /**
   * Gets messages from the repository.
   * @param options The options for getting messages.
   * @returns An async iterable of message activities.
   */
  getMessages(
    options?: RepositoryGetMessagesOptions,
  ): AsyncIterable<Create | Announce> {
    return this.repository.getMessages(this.identifier, options);
  }

  /**
   * Gets a message from the repository.
   * @param id The UUID of the message to get.
   * @returns The message activity, or `undefined` if the message does not
   *          exist.
   */
  getMessage(id: Uuid): Promise<Create | Announce | undefined> {
    return this.repository.getMessage(this.identifier, id);
  }

  /**
   * Counts the number of messages in the repository.
   * @returns The number of messages in the repository.
   */
  countMessages(): Promise<number> {
    return this.repository.countMessages(this.identifier);
  }

  /**
   * Adds a follower to the repository.
   * @param followId The URL of the follow request.
   * @param follower The actor who follows the bot.
   */
  addFollower(followId: URL, follower: Actor): Promise<void> {
    return this.repository.addFollower(this.identifier, followId, follower);
  }

  /**
   * Removes a follower from the repository.
   * @param followId The URL of the follow request.
   * @param followerId The ID of the actor to remove.
   * @returns The removed actor.  If the follower does not exist or the follow
   *          request is not about the follower, `undefined` will be returned.
   */
  removeFollower(followId: URL, followerId: URL): Promise<Actor | undefined> {
    return this.repository.removeFollower(
      this.identifier,
      followId,
      followerId,
    );
  }

  /**
   * Checks if the repository has a follower.
   * @param followerId The ID of the follower to check.
   * @returns `true` if the repository has the follower, `false` otherwise.
   */
  hasFollower(followerId: URL): Promise<boolean> {
    return this.repository.hasFollower(this.identifier, followerId);
  }

  /**
   * Gets followers from the repository.
   * @param options The options for getting followers.
   * @returns An async iterable of actors who follow the bot.
   */
  getFollowers(options?: RepositoryGetFollowersOptions): AsyncIterable<Actor> {
    return this.repository.getFollowers(this.identifier, options);
  }

  /**
   * Counts the number of followers in the repository.
   * @returns The number of followers in the repository.
   */
  countFollowers(): Promise<number> {
    return this.repository.countFollowers(this.identifier);
  }

  /**
   * Adds a sent follow request to the repository.
   * @param id The UUID of the follow request.
   * @param follow The follow activity to add.
   */
  addSentFollow(id: Uuid, follow: Follow): Promise<void> {
    return this.repository.addSentFollow(this.identifier, id, follow);
  }

  /**
   * Removes a sent follow request from the repository.
   * @param id The UUID of the follow request to remove.
   * @returns The removed follow activity.  If the follow request does not
   *          exist, `undefined` will be returned.
   */
  removeSentFollow(id: Uuid): Promise<Follow | undefined> {
    return this.repository.removeSentFollow(this.identifier, id);
  }

  /**
   * Gets a sent follow request from the repository.
   * @param id The UUID of the follow request to get.
   * @returns The `Follow` activity, or `undefined` if the follow request does
   *          not exist.
   */
  getSentFollow(id: Uuid): Promise<Follow | undefined> {
    return this.repository.getSentFollow(this.identifier, id);
  }

  /**
   * Adds a followee to the repository.
   * @param followeeId The ID of the followee to add.
   * @param follow The follow activity to add.
   */
  addFollowee(followeeId: URL, follow: Follow): Promise<void> {
    return this.repository.addFollowee(this.identifier, followeeId, follow);
  }

  /**
   * Removes a followee from the repository.
   * @param followeeId The ID of the followee to remove.
   * @returns The `Follow` activity that was removed.  If the followee does not
   *          exist, `undefined` will be returned.
   */
  removeFollowee(followeeId: URL): Promise<Follow | undefined> {
    return this.repository.removeFollowee(this.identifier, followeeId);
  }

  /**
   * Gets a followee from the repository.
   * @param followeeId The ID of the followee to get.
   * @returns The `Follow` activity, or `undefined` if the followee does not
   *          exist.
   */
  getFollowee(followeeId: URL): Promise<Follow | undefined> {
    return this.repository.getFollowee(this.identifier, followeeId);
  }

  /**
   * Records a vote in a poll.  If the same voter had already voted for the
   * same option in a poll, the vote will be silently ignored.
   * @param messageId The UUID of the poll message to vote on.
   * @param voterId The ID of the voter.
   * @param option The option that the voter is voting for.
   */
  vote(messageId: Uuid, voterId: URL, option: string): Promise<void> {
    return this.repository.vote(this.identifier, messageId, voterId, option);
  }

  /**
   * Counts the number of voters in a poll.  Even if the poll allows multiple
   * selections, each voter is counted only once.
   * @param messageId The UUID of the poll message to count voters for.
   * @returns The number of voters in the poll.  If the poll does not exist,
   *          0 will be returned.
   */
  countVoters(messageId: Uuid): Promise<number> {
    return this.repository.countVoters(this.identifier, messageId);
  }

  /**
   * Counts the votes for each option in a poll.
   * @param messageId The UUID of the poll message to count votes for.
   * @returns A record where the keys are the options and the values are
   *          the number of votes for each option.  See also
   *          {@link Repository.countVotes}.
   */
  countVotes(messageId: Uuid): Promise<Readonly<Record<string, number>>> {
    return this.repository.countVotes(this.identifier, messageId);
  }

  /**
   * Adds a quote authorization stamp to the repository.
   * @param id The UUID of the quote authorization.
   * @param authorization The quote authorization stamp to add.
   * @since 0.5.0
   */
  addQuoteAuthorization(
    id: Uuid,
    authorization: QuoteAuthorization,
  ): Promise<void> {
    return this.repository.addQuoteAuthorization(
      this.identifier,
      id,
      authorization,
    );
  }

  /**
   * Gets a quote authorization stamp from the repository.
   * @param id The UUID of the quote authorization.
   * @returns The quote authorization stamp, or `undefined`.
   * @since 0.5.0
   */
  getQuoteAuthorization(id: Uuid): Promise<QuoteAuthorization | undefined> {
    return this.repository.getQuoteAuthorization(this.identifier, id);
  }

  /**
   * Finds a quote authorization stamp by the quote post it authorizes.
   * @param interactingObject The URI of the quote post.
   * @returns The quote authorization stamp, or `undefined`.
   * @since 0.5.0
   */
  findQuoteAuthorization(
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined> {
    return this.repository.findQuoteAuthorization(
      this.identifier,
      interactingObject,
    );
  }

  /**
   * Removes a quote authorization stamp from the repository.
   * @param id The UUID of the quote authorization.
   * @returns The removed quote authorization stamp, or `undefined`.
   * @since 0.5.0
   */
  removeQuoteAuthorization(
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    return this.repository.removeQuoteAuthorization(this.identifier, id);
  }

  /**
   * Adds a received quote authorization reference.
   * @param authorization The URI of the received quote authorization stamp.
   * @param messageId The UUID of the bot's quote message.
   * @param attribution The actor that issued the authorization stamp.
   * @since 0.5.0
   */
  addQuoteAuthorizationReference(
    authorization: URL,
    messageId: Uuid,
    attribution?: URL,
  ): Promise<void> {
    return this.repository.addQuoteAuthorizationReference(
      this.identifier,
      authorization,
      messageId,
      attribution,
    );
  }

  /**
   * Finds a message by received quote authorization stamp URI.
   * @param authorization The URI of the received quote authorization stamp.
   * @returns The UUID of the bot's quote message, or `undefined`.
   * @since 0.5.0
   */
  findQuoteAuthorizationReference(
    authorization: URL,
  ): Promise<Uuid | undefined> {
    return this.repository.findQuoteAuthorizationReference(
      this.identifier,
      authorization,
    );
  }

  /**
   * Finds the actor that issued a received quote authorization stamp.
   * @param authorization The URI of the received quote authorization stamp.
   * @returns The URI of the actor that issued the stamp, or `undefined`.
   * @since 0.5.0
   */
  findQuoteAuthorizationReferenceAttribution(
    authorization: URL,
  ): Promise<URL | undefined> {
    if (
      typeof this.repository.findQuoteAuthorizationReferenceAttribution !==
        "function"
    ) return Promise.resolve(undefined);
    return this.repository.findQuoteAuthorizationReferenceAttribution(
      this.identifier,
      authorization,
    );
  }

  /**
   * Removes a received quote authorization reference.
   * @param authorization The URI of the received quote authorization stamp.
   * @since 0.5.0
   */
  removeQuoteAuthorizationReference(authorization: URL): Promise<void> {
    return this.repository.removeQuoteAuthorizationReference(
      this.identifier,
      authorization,
    );
  }
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
 * Options for creating a {@link KvRepository}.
 * @since 0.5.0
 */
export interface KvRepositoryOptions {
  /**
   * The key prefix under which all BotKit data is stored.  Data belonging to
   * a bot actor is stored under `[...prefix, "bots", identifier, ...]`, and
   * instance-wide indices are stored under `[...prefix, "index", ...]`.
   * @default `["_botkit"]`
   */
  readonly prefix?: KvKey;
}

/**
 * A repository for storing bot data using a key-value store.
 */
export class KvRepository implements Repository {
  readonly kv: KvStore;

  /**
   * The key prefix under which all BotKit data is stored.
   * @since 0.5.0
   */
  readonly prefix: KvKey;
  private readonly nonCasLocks = new Map<string, Promise<void>>();

  /**
   * Creates a new key-value store repository.
   * @param kv The key-value store to use.
   * @param options The options for the repository.
   */
  constructor(kv: KvStore, options: KvRepositoryOptions = {}) {
    if (kv.cas == null) {
      logger.warn(
        "The given KvStore {kv} does not support CAS operations. " +
          "This may cause issues with concurrent updates.",
        { kv },
      );
    }
    this.kv = kv;
    this.prefix = options.prefix ?? ["_botkit"];
  }

  #key(identifier: string, ...rest: readonly string[]): KvKey {
    return [...this.prefix, "bots", identifier, ...rest];
  }

  #followeeIndexKey(followeeId: URL): KvKey {
    return [...this.prefix, "index", "followees", followeeId.href];
  }

  #quoteAuthorizationIndexKey(
    identifier: string,
    interactingObject: URL,
  ): KvKey {
    return this.#key(
      identifier,
      "quoteAuthorizationsByInteractingObject",
      interactingObject.href,
    );
  }

  #quoteAuthorizationLockKey(
    identifier: string,
    interactingObject: URL,
  ): KvKey {
    return this.#key(
      identifier,
      "quoteAuthorizationsByInteractingObject",
      interactingObject.href,
      "lock",
    );
  }

  #quoteAuthorizationReferenceKey(
    identifier: string,
    authorization: URL,
  ): KvKey {
    return this.#key(
      identifier,
      "quoteAuthorizationRefs",
      authorization.href,
    );
  }

  #quoteAuthorizationReferenceIndexKey(authorization: URL): KvKey {
    return [
      ...this.prefix,
      "index",
      "quoteAuthorizationRefs",
      authorization.href,
    ];
  }

  /**
   * Migrates data stored by BotKit 0.4 or earlier, which was not scoped by
   * bot actor identifiers, so that it belongs to the given identifier.
   *
   * The legacy data can be adopted by exactly one identifier.  The adopter
   * is claimed atomically (through a compare-and-set operation when the
   * underlying store supports one) before anything is copied, so that
   * reusing the repository for another bot, even concurrently, does not
   * adopt the same rows again.  Legacy keys are copied, not moved, and
   * the completion is recorded last, so a partially failed run is simply
   * retried by the adopter on the next call without data loss.  Followees and
   * quote authorization references are also entered into their reverse lookup
   * indexes.
   *
   * Calling this method again after a successful migration is a no-op.
   * @param identifier The identifier of the bot actor that adopts the legacy
   *                   data.
   * @since 0.5.0
   */
  async migrate(identifier: string): Promise<void> {
    const markerKey: KvKey = [...this.prefix, "migrated"];
    let marker = await this.kv.get<MigrationMarker>(markerKey);
    if (marker == null) {
      const claim: MigrationMarker = { adopter: identifier };
      if (this.kv.cas == null) {
        await this.kv.set(markerKey, claim);
        marker = claim;
      } else if (await this.kv.cas(markerKey, undefined, claim)) {
        marker = claim;
      } else {
        marker = await this.kv.get<MigrationMarker>(markerKey);
      }
    }
    if (marker == null || marker.adopter !== identifier || marker.done) {
      return;
    }
    logger.info(
      "Migrating legacy repository data to bot {identifier}...",
      { identifier },
    );
    const categories = [
      "keyPairs",
      "messages",
      "followers",
      "followRequests",
      "followees",
      "follows",
      "quoteAuthorizations",
      "quoteAuthorizationsByInteractingObject",
      "quoteAuthorizationRefs",
      "polls",
    ] as const;
    for (const category of categories) {
      const legacyPrefix: KvKey = [...this.prefix, category];
      for await (const entry of this.kv.list(legacyPrefix)) {
        const rest = entry.key.slice(this.prefix.length + 1);
        // The lock keys of the pseudo-CAS index lists are transient.
        // Only the message and follower lists have them, directly under
        // the category; deeper keys (e.g. a poll option named "lock")
        // are real data:
        if (
          (category === "messages" || category === "followers") &&
          rest.length === 1 && rest[0] === "lock"
        ) {
          continue;
        }
        const scopedKey = this.#key(identifier, category, ...rest);
        if (await this.kv.get(scopedKey) == null) {
          await this.kv.set(scopedKey, entry.value);
        }
        if (category === "followees" && rest.length === 1) {
          let followeeId: URL;
          try {
            followeeId = new URL(rest[0]);
          } catch (error) {
            // A malformed legacy key cannot be indexed; storage errors from
            // the indexing itself must propagate so the done marker is not
            // written and the adopter retries:
            logger.warn(
              "Skipping the malformed legacy followee key {followeeId}.",
              { followeeId: rest[0], error },
            );
            continue;
          }
          await this.#addToFolloweeIndex(identifier, followeeId);
        }
        if (category === "quoteAuthorizationRefs" && rest.length === 1) {
          let authorization: URL;
          try {
            authorization = new URL(rest[0]);
          } catch (error) {
            // A malformed legacy key cannot be indexed; storage errors from
            // the indexing itself must propagate so the done marker is not
            // written and the adopter retries:
            logger.warn(
              "Skipping the malformed legacy quote authorization reference key {authorization}.",
              { authorization: rest[0], error },
            );
            continue;
          }
          await this.#addToQuoteAuthorizationReferenceIndex(
            identifier,
            authorization,
          );
        }
      }
    }
    // The completion is recorded last so that an interrupted migration is
    // retried on the next run:
    await this.kv.set(
      markerKey,
      { adopter: identifier, done: true } satisfies MigrationMarker,
    );
    logger.info(
      "Finished migrating legacy repository data to bot {identifier}.",
      { identifier },
    );
  }

  async setKeyPairs(
    identifier: string,
    keyPairs: CryptoKeyPair[],
  ): Promise<void> {
    const pairs: KeyPair[] = [];
    for (const keyPair of keyPairs) {
      const pair: KeyPair = {
        private: await exportJwk(keyPair.privateKey),
        public: await exportJwk(keyPair.publicKey),
      };
      pairs.push(pair);
    }
    await this.kv.set(this.#key(identifier, "keyPairs"), pairs);
  }

  async getKeyPairs(identifier: string): Promise<CryptoKeyPair[] | undefined> {
    const keyPairs = await this.kv.get<KeyPair[]>(
      this.#key(identifier, "keyPairs"),
    );
    if (keyPairs == null) return undefined;
    const promises = keyPairs.map(async (pair) => ({
      privateKey: await importJwk(pair.private, "private"),
      publicKey: await importJwk(pair.public, "public"),
    }));
    return await Promise.all(promises);
  }

  async addMessage(
    identifier: string,
    id: Uuid,
    activity: Create | Announce,
  ): Promise<void> {
    const messageKey = this.#key(identifier, "messages", id);
    await this.kv.set(
      messageKey,
      await activity.toJsonLd({ format: "compact" }),
    );
    const lockKey = this.#key(identifier, "messages", "lock");
    const listKey = this.#key(identifier, "messages");
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
    identifier: string,
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    const kvKey = this.#key(identifier, "messages", id);
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

  async removeMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    const listKey = this.#key(identifier, "messages");
    const lockKey = this.#key(identifier, "messages", "lock");
    const lockId = `${id}:delete`;
    do {
      await this.kv.set(lockKey, lockId);
      const set = new Set(await this.kv.get<string[]>(listKey) ?? []);
      set.delete(id);
      const list = [...set];
      list.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      await this.kv.set(listKey, list);
    } while (await this.kv.get(lockKey) !== lockId);
    const messageKey = this.#key(identifier, "messages", id);
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
    identifier: string,
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    const { order, until, since, limit } = options;
    const untilTs = until == null ? null : until.epochMilliseconds;
    const sinceTs = since == null ? null : since.epochMilliseconds;
    let messageIds =
      await this.kv.get<string[]>(this.#key(identifier, "messages")) ?? [];
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
      const messageJson = await this.kv.get(
        this.#key(identifier, "messages", id),
      );
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

  async getMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    const json = await this.kv.get(this.#key(identifier, "messages", id));
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

  async countMessages(identifier: string): Promise<number> {
    const messageIds =
      await this.kv.get<string[]>(this.#key(identifier, "messages")) ?? [];
    return messageIds.length;
  }

  async addFollower(
    identifier: string,
    followRequestId: URL,
    follower: Actor,
  ): Promise<void> {
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }
    const followRequestIdString = followRequestId.href;
    const followerId = follower.id.href;
    await this.#withKvLock(
      this.#followRequestLockKey(identifier, followRequestIdString),
      async () => {
        const followRequestKey = this.#followRequestKey(
          identifier,
          followRequestIdString,
        );
        const previousFollowerId = await this.kv.get<string>(followRequestKey);
        const followerJson = await follower.toJsonLd({ format: "compact" });
        await this.#withKvLock(this.#followersLockKey(identifier), async () => {
          const followerKey = this.#key(identifier, "followers", followerId);
          await this.kv.set(followerKey, followerJson);
          await this.#addFollowerIdLocked(identifier, followerId);
          await this.#addFollowRequestForFollowerLocked(
            identifier,
            followerId,
            followRequestIdString,
          );
          await this.kv.set(followRequestKey, followerId);
          if (
            previousFollowerId != null && previousFollowerId !== followerId
          ) {
            await this.#removeFollowRequestForFollowerLocked(
              identifier,
              previousFollowerId,
              followRequestIdString,
            );
            await this.#cleanupFollowerLocked(identifier, previousFollowerId);
          }
        });
      },
    );
  }

  async removeFollower(
    identifier: string,
    followRequestId: URL,
    actorId: URL,
  ): Promise<Actor | undefined> {
    const followRequestIdString = followRequestId.href;
    return await this.#withKvLock(
      this.#followRequestLockKey(identifier, followRequestIdString),
      async () => {
        const followRequestKey = this.#followRequestKey(
          identifier,
          followRequestIdString,
        );
        const followerId = await this.kv.get<string>(followRequestKey);
        if (followerId == null || followerId !== actorId.href) {
          return undefined;
        }
        return await this.#withKvLock(
          this.#followersLockKey(identifier),
          async () => {
            const currentFollowerId = await this.kv.get<string>(
              followRequestKey,
            );
            if (currentFollowerId !== followerId) return undefined;
            const followerKey = this.#key(identifier, "followers", followerId);
            const followerJson = await this.kv.get(followerKey);
            await this.kv.delete(followRequestKey);
            await this.#removeFollowRequestForFollowerLocked(
              identifier,
              followerId,
              followRequestIdString,
            );
            const removed = await this.#cleanupFollowerLocked(
              identifier,
              followerId,
            );
            if (followerJson == null) return undefined;
            let follower: Object;
            try {
              follower = await Object.fromJsonLd(followerJson);
            } catch {
              return undefined;
            }
            if (!isActor(follower)) return undefined;
            return removed ? follower : undefined;
          },
        );
      },
    );
  }

  async #addFollowerIdLocked(
    identifier: string,
    followerId: string,
  ): Promise<void> {
    const listKey = this.#key(identifier, "followers");
    const list = await this.kv.get<string[]>(listKey) ?? [];
    if (!list.includes(followerId)) {
      await this.kv.set(listKey, [...list, followerId]);
    }
  }

  async #cleanupFollowerLocked(
    identifier: string,
    followerId: string,
  ): Promise<boolean> {
    if (await this.#hasFollowRequestForFollowerLocked(identifier, followerId)) {
      return false;
    }
    const listKey = this.#key(identifier, "followers");
    const list = await this.kv.get<string[]>(listKey) ?? [];
    await this.kv.set(
      listKey,
      list.filter((id) => id !== followerId),
    );
    await this.kv.delete(this.#key(identifier, "followers", followerId));
    await this.kv.delete(
      this.#followerFollowRequestsKey(identifier, followerId),
    );
    return true;
  }

  #followRequestKey(identifier: string, followRequestId: string): KvKey {
    return this.#key(identifier, "followRequests", followRequestId);
  }

  #followRequestLockKey(identifier: string, followRequestId: string): KvKey {
    return this.#key(identifier, "followRequests", "lock", followRequestId);
  }

  #followerFollowRequestsKey(identifier: string, followerId: string): KvKey {
    return this.#key(identifier, "followRequests", "followers", followerId);
  }

  #followersLockKey(identifier: string): KvKey {
    return this.#key(identifier, "followers", "lock");
  }

  async #addFollowRequestForFollowerLocked(
    identifier: string,
    followerId: string,
    followRequestId: string,
  ): Promise<void> {
    const followRequestIds = await this
      .#getIndexedFollowRequestsForFollowerLocked(
        identifier,
        followerId,
      ) ?? await this.#rebuildFollowRequestsForFollowerLocked(
        identifier,
        followerId,
      );
    if (!followRequestIds.includes(followRequestId)) {
      await this.kv.set(
        this.#followerFollowRequestsKey(identifier, followerId),
        [
          ...followRequestIds,
          followRequestId,
        ],
      );
    }
  }

  async #removeFollowRequestForFollowerLocked(
    identifier: string,
    followerId: string,
    followRequestId: string,
  ): Promise<void> {
    const followRequestIds = await this
      .#getIndexedFollowRequestsForFollowerLocked(
        identifier,
        followerId,
      ) ?? await this.#rebuildFollowRequestsForFollowerLocked(
        identifier,
        followerId,
      );
    await this.kv.set(
      this.#followerFollowRequestsKey(identifier, followerId),
      followRequestIds.filter((id) => id !== followRequestId),
    );
  }

  async #hasFollowRequestForFollowerLocked(
    identifier: string,
    followerId: string,
  ): Promise<boolean> {
    const indexKey = this.#followerFollowRequestsKey(identifier, followerId);
    const followRequestIds = await this
      .#getIndexedFollowRequestsForFollowerLocked(
        identifier,
        followerId,
      );
    if (followRequestIds != null) {
      return await this.#hasCurrentFollowRequestForFollowerLocked(
        identifier,
        followerId,
        followRequestIds,
        indexKey,
      );
    }
    const rebuiltFollowRequestIds = await this
      .#rebuildFollowRequestsForFollowerLocked(
        identifier,
        followerId,
      );
    return await this.#hasCurrentFollowRequestForFollowerLocked(
      identifier,
      followerId,
      rebuiltFollowRequestIds,
      indexKey,
    );
  }

  async #hasCurrentFollowRequestForFollowerLocked(
    identifier: string,
    followerId: string,
    followRequestIds: readonly string[],
    indexKey: KvKey,
  ): Promise<boolean> {
    const currentFollowRequestIds: string[] = [];
    for (const followRequestId of followRequestIds) {
      if (
        await this.kv.get<string>(
          this.#followRequestKey(identifier, followRequestId),
        ) ===
          followerId
      ) {
        currentFollowRequestIds.push(followRequestId);
      }
    }
    if (currentFollowRequestIds.length !== followRequestIds.length) {
      await this.kv.set(
        indexKey,
        currentFollowRequestIds,
      );
    }
    return currentFollowRequestIds.length > 0;
  }

  async #getIndexedFollowRequestsForFollowerLocked(
    identifier: string,
    followerId: string,
  ): Promise<string[] | undefined> {
    return await this.kv.get<string[]>(
      this.#followerFollowRequestsKey(identifier, followerId),
    );
  }

  async #rebuildFollowRequestsForFollowerLocked(
    identifier: string,
    followerId: string,
  ): Promise<string[]> {
    const indexKey = this.#followerFollowRequestsKey(identifier, followerId);
    const indexedFollowRequestIds: string[] = [];
    const followRequestsKey = this.#key(identifier, "followRequests");
    const followRequestKeyLength = followRequestsKey.length + 1;
    for await (const entry of this.kv.list(followRequestsKey)) {
      if (entry.key.length !== followRequestKeyLength) continue;
      const followRequestId = entry.key[followRequestsKey.length];
      if (typeof followRequestId !== "string") continue;
      if (entry.value === followerId) {
        indexedFollowRequestIds.push(followRequestId);
      }
    }
    await this.kv.set(indexKey, indexedFollowRequestIds);
    return indexedFollowRequestIds;
  }

  async #withKvLock<T>(
    lockKey: KvKey,
    operation: () => Promise<T>,
  ): Promise<T> {
    const cas = this.kv.cas?.bind(this.kv);
    if (cas == null) {
      return await this.#withNonCasKvLock(lockKey, operation);
    }
    const lock: KvLock = { id: crypto.randomUUID() };
    const lockTtl = Temporal.Duration.from({ minutes: 5 });
    const lockReleaseTtl = Temporal.Duration.from({
      milliseconds: kvLockPollIntervalMs,
    });
    while (true) {
      if (await cas(lockKey, undefined, lock, { ttl: lockTtl })) {
        break;
      }
      const currentLock = await this.kv.get(lockKey);
      if (
        (isLegacyKvLock(currentLock) || isReleasedKvLock(currentLock)) &&
        await cas(lockKey, currentLock, lock, { ttl: lockTtl })
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, kvLockPollIntervalMs));
    }
    try {
      return await operation();
    } finally {
      try {
        const currentLock = await this.kv.get(lockKey);
        if (isKvLock(currentLock) && currentLock.id === lock.id) {
          await cas(lockKey, currentLock, { ...currentLock, released: true }, {
            ttl: lockReleaseTtl,
          });
        }
      } catch (error) {
        logger.warn("Failed to release KV lock: {error}", { error });
      }
    }
  }

  async #withNonCasKvLock<T>(
    lockKey: KvKey,
    operation: () => Promise<T>,
  ): Promise<T> {
    const encodedLockKey = JSON.stringify(lockKey);
    const previousLock = this.nonCasLocks.get(encodedLockKey) ??
      Promise.resolve();
    let releaseLock: () => void;
    const lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const tail = previousLock.then(() => lock, () => lock);
    this.nonCasLocks.set(encodedLockKey, tail);
    await previousLock.catch(() => {});
    try {
      return await operation();
    } finally {
      releaseLock!();
      if (this.nonCasLocks.get(encodedLockKey) === tail) {
        this.nonCasLocks.delete(encodedLockKey);
      }
    }
  }

  async hasFollower(identifier: string, followerId: URL): Promise<boolean> {
    return await this.kv.get<unknown>(
      this.#key(identifier, "followers", followerId.href),
    ) != null;
  }

  async *getFollowers(
    identifier: string,
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    const { offset = 0, limit } = options;
    let followerIds =
      await this.kv.get<string[]>(this.#key(identifier, "followers")) ?? [];
    followerIds = followerIds.slice(offset);
    if (limit != null) {
      followerIds = followerIds.slice(0, limit);
    }
    for (const id of followerIds) {
      const json = await this.kv.get(this.#key(identifier, "followers", id));
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

  async countFollowers(identifier: string): Promise<number> {
    const followerIds =
      await this.kv.get<string[]>(this.#key(identifier, "followers")) ?? [];
    return followerIds.length;
  }

  async addSentFollow(
    identifier: string,
    id: Uuid,
    follow: Follow,
  ): Promise<void> {
    await this.kv.set(
      this.#key(identifier, "follows", id),
      await follow.toJsonLd({ format: "compact" }),
    );
  }

  async removeSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    const follow = await this.getSentFollow(identifier, id);
    if (follow == null) return undefined;
    await this.kv.delete(this.#key(identifier, "follows", id));
    return follow;
  }

  async getSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    const followJson = await this.kv.get(
      this.#key(identifier, "follows", id),
    );
    if (followJson == null) return undefined;
    try {
      return await Follow.fromJsonLd(followJson);
    } catch {
      return undefined;
    }
  }

  async addFollowee(
    identifier: string,
    followeeId: URL,
    follow: Follow,
  ): Promise<void> {
    await this.kv.set(
      this.#key(identifier, "followees", followeeId.href),
      await follow.toJsonLd({ format: "compact" }),
    );
    await this.#addToFolloweeIndex(identifier, followeeId);
  }

  async removeFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    const follow = await this.getFollowee(identifier, followeeId);
    if (follow == null) {
      // The followee record may have been deleted by an earlier attempt that
      // failed before cleaning up the reverse index; repair it so that
      // retries converge.
      await this.#removeFromFolloweeIndex(identifier, followeeId);
      return undefined;
    }
    await this.kv.delete(this.#key(identifier, "followees", followeeId.href));
    await this.#removeFromFolloweeIndex(identifier, followeeId);
    return follow;
  }

  async getFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    const json = await this.kv.get(
      this.#key(identifier, "followees", followeeId.href),
    );
    if (json == null) return undefined;
    try {
      return await Follow.fromJsonLd(json);
    } catch {
      return undefined;
    }
  }

  async *findFollowedBots(followeeId: URL): AsyncIterable<string> {
    const identifiers = await this.kv.get<string[]>(
      this.#followeeIndexKey(followeeId),
    ) ?? [];
    for (const identifier of identifiers) yield identifier;
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
    await this.#withKvLock(
      this.#quoteAuthorizationLockKey(identifier, interactingObject),
      async () => {
        const existing = await this.kv.get<Uuid>(
          this.#quoteAuthorizationIndexKey(identifier, interactingObject),
        );
        if (existing != null) {
          const authorization = await this.getQuoteAuthorization(
            identifier,
            existing,
          );
          if (authorization != null) return;
          await this.kv.delete(
            this.#quoteAuthorizationIndexKey(identifier, interactingObject),
          );
        }
        await this.kv.set(
          this.#key(identifier, "quoteAuthorizations", id),
          await authorization.toJsonLd({ format: "compact" }),
        );
        await this.kv.set(
          this.#quoteAuthorizationIndexKey(identifier, interactingObject),
          id,
        );
      },
    );
  }

  async getQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    const json = await this.kv.get(
      this.#key(identifier, "quoteAuthorizations", id),
    );
    if (json == null) return undefined;
    try {
      return await QuoteAuthorization.fromJsonLd(json);
    } catch {
      return undefined;
    }
  }

  async findQuoteAuthorization(
    identifier: string,
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined> {
    const id = await this.kv.get<Uuid>(
      this.#quoteAuthorizationIndexKey(identifier, interactingObject),
    );
    if (id == null) return undefined;
    const authorization = await this.getQuoteAuthorization(identifier, id);
    if (authorization == null) {
      await this.kv.delete(
        this.#quoteAuthorizationIndexKey(identifier, interactingObject),
      );
    }
    return authorization;
  }

  async removeQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    const key = this.#key(identifier, "quoteAuthorizations", id);
    const json = await this.kv.get(key);
    if (json == null) return undefined;
    const interactingObject = getRawQuoteAuthorizationInteractingObject(json);
    if (interactingObject == null) {
      await this.kv.delete(key);
    } else {
      const indexKey = this.#quoteAuthorizationIndexKey(
        identifier,
        interactingObject,
      );
      await this.#withKvLock(
        this.#quoteAuthorizationLockKey(identifier, interactingObject),
        async () => {
          await this.kv.delete(key);
          const indexedId = await this.kv.get<Uuid>(indexKey);
          if (indexedId === id) await this.kv.delete(indexKey);
        },
      );
    }
    try {
      return await QuoteAuthorization.fromJsonLd(json);
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
    await this.kv.set(
      this.#quoteAuthorizationReferenceKey(identifier, authorization),
      attribution == null
        ? messageId
        : { messageId, attribution: attribution.href },
    );
    await this.#addToQuoteAuthorizationReferenceIndex(
      identifier,
      authorization,
    );
  }

  async findQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<Uuid | undefined> {
    const value = await this.kv.get<QuoteAuthorizationReferenceData | Uuid>(
      this.#quoteAuthorizationReferenceKey(identifier, authorization),
    );
    if (typeof value === "string") return value as Uuid;
    return value?.messageId;
  }

  async *findQuoteAuthorizationReferenceIdentifiers(
    authorization: URL,
  ): AsyncIterable<string> {
    const identifiers = await this.kv.get<string[]>(
      this.#quoteAuthorizationReferenceIndexKey(authorization),
    ) ?? [];
    for (const identifier of identifiers) yield identifier;
  }

  async findQuoteAuthorizationReferenceAttribution(
    identifier: string,
    authorization: URL,
  ): Promise<URL | undefined> {
    const value = await this.kv.get<QuoteAuthorizationReferenceData | Uuid>(
      this.#quoteAuthorizationReferenceKey(identifier, authorization),
    );
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
    await this.kv.delete(
      this.#quoteAuthorizationReferenceKey(identifier, authorization),
    );
    await this.#removeFromQuoteAuthorizationReferenceIndex(
      identifier,
      authorization,
    );
  }

  async #addToFolloweeIndex(
    identifier: string,
    followeeId: URL,
  ): Promise<void> {
    const key = this.#followeeIndexKey(followeeId);
    while (true) {
      const prev = await this.kv.get<string[]>(key);
      if (prev != null && prev.includes(identifier)) return;
      const next = prev == null ? [identifier] : [...prev, identifier];
      if (this.kv.cas == null) {
        await this.kv.set(key, next);
        return;
      }
      if (await this.kv.cas(key, prev, next)) return;
      logger.trace(
        "CAS operation failed, retrying to index followee {followeeId} for bot {identifier}.",
        { followeeId: followeeId.href, identifier },
      );
    }
  }

  async #removeFromFolloweeIndex(
    identifier: string,
    followeeId: URL,
  ): Promise<void> {
    const key = this.#followeeIndexKey(followeeId);
    while (true) {
      const prev = await this.kv.get<string[]>(key);
      if (prev == null || !prev.includes(identifier)) return;
      const next = prev.filter((id) => id !== identifier);
      if (this.kv.cas == null) {
        await this.kv.set(key, next);
        return;
      }
      if (await this.kv.cas(key, prev, next)) return;
      logger.trace(
        "CAS operation failed, retrying to unindex followee {followeeId} for bot {identifier}.",
        { followeeId: followeeId.href, identifier },
      );
    }
  }

  async #addToQuoteAuthorizationReferenceIndex(
    identifier: string,
    authorization: URL,
  ): Promise<void> {
    const key = this.#quoteAuthorizationReferenceIndexKey(authorization);
    while (true) {
      const prev = await this.kv.get<string[]>(key);
      if (prev != null && prev.includes(identifier)) return;
      const next = prev == null ? [identifier] : [...prev, identifier];
      if (this.kv.cas == null) {
        await this.kv.set(key, next);
        return;
      }
      if (await this.kv.cas(key, prev, next)) return;
      logger.trace(
        "CAS operation failed, retrying to index quote authorization reference {authorization} for bot {identifier}.",
        { authorization: authorization.href, identifier },
      );
    }
  }

  async #removeFromQuoteAuthorizationReferenceIndex(
    identifier: string,
    authorization: URL,
  ): Promise<void> {
    const key = this.#quoteAuthorizationReferenceIndexKey(authorization);
    while (true) {
      const prev = await this.kv.get<string[]>(key);
      if (prev == null || !prev.includes(identifier)) return;
      const next = prev.filter((id) => id !== identifier);
      if (this.kv.cas == null) {
        await this.kv.set(key, next);
        return;
      }
      if (await this.kv.cas(key, prev, next)) return;
      logger.trace(
        "CAS operation failed, retrying to unindex quote authorization reference {authorization} for bot {identifier}.",
        { authorization: authorization.href, identifier },
      );
    }
  }

  async vote(
    identifier: string,
    messageId: Uuid,
    voterId: URL,
    option: string,
  ): Promise<void> {
    const key = this.#key(identifier, "polls", messageId, option);
    while (true) {
      const prev = await this.kv.get<string[]>(key);
      if (prev != null && prev.includes(voterId.href)) return;
      const next = prev == null ? [voterId.href] : [...prev, voterId.href];
      if (this.kv.cas == null) {
        await this.kv.set(key, next);
        break;
      } else {
        const success = await this.kv.cas(key, prev, next);
        if (success) break;
        // If the CAS operation failed, we retry to ensure the vote is recorded.
        logger.trace(
          "CAS operation failed, retrying vote for {messageId} by {voterId} for option {option}.",
          {
            messageId,
            voterId: voterId.href,
            option,
          },
        );
      }
    }
    const optionsKey = this.#key(identifier, "polls", messageId);
    while (true) {
      const prevOptions = await this.kv.get<string[]>(optionsKey);
      if (prevOptions != null && prevOptions.includes(option)) return;
      const nextOptions = prevOptions == null
        ? [option]
        : [...prevOptions, option];
      if (this.kv.cas == null) {
        await this.kv.set(optionsKey, nextOptions);
        break;
      } else {
        const success = await this.kv.cas(optionsKey, prevOptions, nextOptions);
        if (success) break;
        // If the CAS operation failed, we retry to ensure the option is recorded.
        logger.trace(
          "CAS operation failed, retrying to add option {option} for message {messageId}.",
          {
            option,
            messageId,
          },
        );
      }
    }
  }

  async countVoters(identifier: string, messageId: Uuid): Promise<number> {
    const options = await this.kv.get<string[]>(
      this.#key(identifier, "polls", messageId),
    ) ?? [];
    const result = new Set<string>();
    for (const option of options) {
      const voters = await this.kv.get<string[]>(
        this.#key(identifier, "polls", messageId, option),
      );
      if (voters != null) {
        for (const voter of voters) result.add(voter);
      }
    }
    return result.size;
  }

  async countVotes(
    identifier: string,
    messageId: Uuid,
  ): Promise<Readonly<Record<string, number>>> {
    const options = await this.kv.get<string[]>(
      this.#key(identifier, "polls", messageId),
    ) ?? [];
    const result: Record<string, number> = {};
    for (const option of options) {
      const voters = await this.kv.get<string[]>(
        this.#key(identifier, "polls", messageId, option),
      );
      result[option] = voters == null ? 0 : voters.length;
    }
    return result;
  }

  forIdentifier(identifier: string): ActorScopedRepository {
    return new ActorScopedRepository(this, identifier);
  }
}

interface KeyPair {
  private: JsonWebKey;
  public: JsonWebKey;
}

interface MigrationMarker {
  adopter: string;
  done?: boolean;
}

/**
 * Extracts the timestamp from a UUIDv7.
 * @param uuid The UUIDv7 string to extract the timestamp from.
 * @return The timestamp in milliseconds since the Unix epoch.
 * @internal
 */
function extractTimestamp(uuid: string): number {
  // UUIDv7 format: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx
  // The timestamp is in the first 6 bytes (48 bits) of the UUID.
  if (uuid.length !== 36 || uuid[14] !== "7") {
    throw new TypeError("Invalid UUIDv7 format.");
  }
  const timestampHex = uuid.slice(0, 8) + uuid.slice(9, 13);
  return parseInt(timestampHex, 16);
}

interface MemoryActorData {
  keyPairs?: CryptoKeyPair[];
  messages: Map<Uuid, Create | Announce>;
  followers: Map<string, Actor>;
  followRequests: Record<string, string>;
  sentFollows: Record<string, Follow>;
  followees: Record<string, Follow>;
  quoteAuthorizations: Map<Uuid, QuoteAuthorization>;
  quoteAuthorizationsByInteractingObject: Map<string, Uuid>;
  quoteAuthorizationRefs: Map<string, Uuid>;
  quoteAuthorizationRefAttributions: Map<string, URL>;
  polls: Record<Uuid, Record<string, Set<string>>>;
}

/**
 * A repository for storing bot data in memory.  This repository is not
 * persistent and is only suitable for testing or development.
 */
export class MemoryRepository implements Repository {
  #data: Map<string, MemoryActorData> = new Map();

  #bucket(identifier: string): MemoryActorData {
    let data = this.#data.get(identifier);
    if (data == null) {
      data = {
        messages: new Map(),
        followers: new Map(),
        followRequests: {},
        sentFollows: {},
        followees: {},
        quoteAuthorizations: new Map(),
        quoteAuthorizationsByInteractingObject: new Map(),
        quoteAuthorizationRefs: new Map(),
        quoteAuthorizationRefAttributions: new Map(),
        polls: {},
      };
      this.#data.set(identifier, data);
    }
    return data;
  }

  setKeyPairs(identifier: string, keyPairs: CryptoKeyPair[]): Promise<void> {
    this.#bucket(identifier).keyPairs = keyPairs;
    return Promise.resolve();
  }

  getKeyPairs(identifier: string): Promise<CryptoKeyPair[] | undefined> {
    return Promise.resolve(this.#data.get(identifier)?.keyPairs);
  }

  addMessage(
    identifier: string,
    id: Uuid,
    activity: Create | Announce,
  ): Promise<void> {
    this.#bucket(identifier).messages.set(id, activity);
    return Promise.resolve();
  }

  async updateMessage(
    identifier: string,
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    const messages = this.#data.get(identifier)?.messages;
    const existing = messages?.get(id);
    if (messages == null || existing == null) return false;
    const newActivity = await updater(existing);
    if (newActivity == null) return false;
    messages.set(id, newActivity);
    return true;
  }

  removeMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    const messages = this.#data.get(identifier)?.messages;
    const activity = messages?.get(id);
    messages?.delete(id);
    return Promise.resolve(activity);
  }

  async *getMessages(
    identifier: string,
    options: RepositoryGetMessagesOptions = {},
  ): AsyncIterable<Create | Announce> {
    const { order, until, since, limit } = options;
    let messages = [...this.#data.get(identifier)?.messages.values() ?? []];
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
      messages = messages.slice(0, limit);
    }
    for (const message of messages) yield message;
  }

  getMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    return Promise.resolve(this.#data.get(identifier)?.messages.get(id));
  }

  countMessages(identifier: string): Promise<number> {
    return Promise.resolve(this.#data.get(identifier)?.messages.size ?? 0);
  }

  addFollower(
    identifier: string,
    followId: URL,
    follower: Actor,
  ): Promise<void> {
    if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }
    const data = this.#bucket(identifier);
    const previousFollowerId = data.followRequests[followId.href];
    data.followers.set(follower.id.href, follower);
    data.followRequests[followId.href] = follower.id.href;
    if (
      previousFollowerId != null && previousFollowerId !== follower.id.href
    ) {
      this.#cleanupFollower(data, previousFollowerId);
    }
    return Promise.resolve();
  }

  removeFollower(
    identifier: string,
    followId: URL,
    followerId: URL,
  ): Promise<Actor | undefined> {
    const data = this.#data.get(identifier);
    if (data == null) return Promise.resolve(undefined);
    const existing = data.followRequests[followId.href];
    if (existing == null || existing !== followerId.href) {
      return Promise.resolve(undefined);
    }
    delete data.followRequests[followId.href];
    const follower = data.followers.get(followerId.href);
    const removed = this.#cleanupFollower(data, followerId.href);
    return Promise.resolve(removed ? follower : undefined);
  }

  #cleanupFollower(data: MemoryActorData, followerId: string): boolean {
    if (globalThis.Object.values(data.followRequests).includes(followerId)) {
      return false;
    }
    data.followers.delete(followerId);
    return true;
  }

  hasFollower(identifier: string, followerId: URL): Promise<boolean> {
    return Promise.resolve(
      this.#data.get(identifier)?.followers.has(followerId.href) ?? false,
    );
  }

  async *getFollowers(
    identifier: string,
    options: RepositoryGetFollowersOptions = {},
  ): AsyncIterable<Actor> {
    const { offset = 0, limit } = options;
    let followers = [...this.#data.get(identifier)?.followers.values() ?? []];
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

  countFollowers(identifier: string): Promise<number> {
    return Promise.resolve(this.#data.get(identifier)?.followers.size ?? 0);
  }

  addSentFollow(identifier: string, id: Uuid, follow: Follow): Promise<void> {
    this.#bucket(identifier).sentFollows[id] = follow;
    return Promise.resolve();
  }

  removeSentFollow(identifier: string, id: Uuid): Promise<Follow | undefined> {
    const sentFollows = this.#data.get(identifier)?.sentFollows;
    if (sentFollows == null) return Promise.resolve(undefined);
    const follow = sentFollows[id];
    delete sentFollows[id];
    return Promise.resolve(follow);
  }

  getSentFollow(identifier: string, id: Uuid): Promise<Follow | undefined> {
    return Promise.resolve(this.#data.get(identifier)?.sentFollows[id]);
  }

  addFollowee(
    identifier: string,
    followeeId: URL,
    follow: Follow,
  ): Promise<void> {
    this.#bucket(identifier).followees[followeeId.href] = follow;
    return Promise.resolve();
  }

  removeFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    const followees = this.#data.get(identifier)?.followees;
    if (followees == null) return Promise.resolve(undefined);
    const follow = followees[followeeId.href];
    delete followees[followeeId.href];
    return Promise.resolve(follow);
  }

  getFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    return Promise.resolve(
      this.#data.get(identifier)?.followees[followeeId.href],
    );
  }

  async *findFollowedBots(followeeId: URL): AsyncIterable<string> {
    for (const [identifier, data] of this.#data) {
      if (followeeId.href in data.followees) yield identifier;
    }
  }

  addQuoteAuthorization(
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
    const data = this.#bucket(identifier);
    if (
      data.quoteAuthorizationsByInteractingObject.has(interactingObject.href)
    ) {
      return Promise.resolve();
    }
    data.quoteAuthorizations.set(id, authorization);
    data.quoteAuthorizationsByInteractingObject.set(interactingObject.href, id);
    return Promise.resolve();
  }

  getQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    return Promise.resolve(
      this.#data.get(identifier)?.quoteAuthorizations.get(id),
    );
  }

  findQuoteAuthorization(
    identifier: string,
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined> {
    const data = this.#data.get(identifier);
    if (data == null) return Promise.resolve(undefined);
    const id = data.quoteAuthorizationsByInteractingObject.get(
      interactingObject.href,
    );
    if (id == null) return Promise.resolve(undefined);
    return Promise.resolve(data.quoteAuthorizations.get(id));
  }

  removeQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    const data = this.#data.get(identifier);
    if (data == null) return Promise.resolve(undefined);
    const authorization = data.quoteAuthorizations.get(id);
    data.quoteAuthorizations.delete(id);
    const interactingObject = authorization?.interactingObjectId;
    if (interactingObject != null) {
      const indexedId = data.quoteAuthorizationsByInteractingObject.get(
        interactingObject.href,
      );
      if (indexedId === id) {
        data.quoteAuthorizationsByInteractingObject.delete(
          interactingObject.href,
        );
      }
    }
    return Promise.resolve(authorization);
  }

  addQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
    messageId: Uuid,
    attribution?: URL,
  ): Promise<void> {
    const bucket = this.#bucket(identifier);
    bucket.quoteAuthorizationRefs.set(authorization.href, messageId);
    if (attribution == null) {
      bucket.quoteAuthorizationRefAttributions.delete(authorization.href);
    } else {
      bucket.quoteAuthorizationRefAttributions.set(
        authorization.href,
        attribution,
      );
    }
    return Promise.resolve();
  }

  findQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<Uuid | undefined> {
    return Promise.resolve(
      this.#data.get(identifier)?.quoteAuthorizationRefs.get(
        authorization.href,
      ),
    );
  }

  async *findQuoteAuthorizationReferenceIdentifiers(
    authorization: URL,
  ): AsyncIterable<string> {
    for (const [identifier, data] of this.#data) {
      if (data.quoteAuthorizationRefs.has(authorization.href)) {
        yield identifier;
      }
    }
  }

  findQuoteAuthorizationReferenceAttribution(
    identifier: string,
    authorization: URL,
  ): Promise<URL | undefined> {
    return Promise.resolve(
      this.#data.get(identifier)?.quoteAuthorizationRefAttributions.get(
        authorization.href,
      ),
    );
  }

  removeQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<void> {
    const data = this.#data.get(identifier);
    data?.quoteAuthorizationRefs.delete(authorization.href);
    data?.quoteAuthorizationRefAttributions.delete(authorization.href);
    return Promise.resolve();
  }

  vote(
    identifier: string,
    messageId: Uuid,
    voterId: URL,
    option: string,
  ): Promise<void> {
    const poll = this.#bucket(identifier).polls[messageId] ??= {};
    const voters = poll[option] ??= new Set();
    voters.add(voterId.href);
    return Promise.resolve();
  }

  countVoters(identifier: string, messageId: Uuid): Promise<number> {
    const poll = this.#data.get(identifier)?.polls[messageId];
    if (poll == null) return Promise.resolve(0);
    let voters = new Set<string>();
    for (const votersSet of globalThis.Object.values(poll)) {
      voters = voters.union(votersSet);
    }
    return Promise.resolve(voters.size);
  }

  countVotes(
    identifier: string,
    messageId: Uuid,
  ): Promise<Readonly<Record<string, number>>> {
    const poll = this.#data.get(identifier)?.polls[messageId];
    if (poll == null) return Promise.resolve({});
    const counts: Record<string, number> = {};
    for (const [option, voters] of globalThis.Object.entries(poll)) {
      counts[option] = voters.size;
    }
    return Promise.resolve(counts);
  }

  forIdentifier(identifier: string): ActorScopedRepository {
    return new ActorScopedRepository(this, identifier);
  }
}

/**
 * A repository decorator that adds an in-memory cache layer on top of another
 * repository. This is useful for improving performance by reducing the number
 * of accesses to the underlying persistent storage, but it increases memory
 * usage. The cache is not persistent and will be lost when the process exits.
 *
 * Note: List operations like `getMessages` and `getFollowers`, count
 * operations like `countMessages` and `countFollowers`, and reverse lookups
 * like `findFollowedBots` are not cached and always delegate to the
 * underlying repository.
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

  async setKeyPairs(
    identifier: string,
    keyPairs: CryptoKeyPair[],
  ): Promise<void> {
    await this.underlying.setKeyPairs(identifier, keyPairs);
    await this.cache.setKeyPairs(identifier, keyPairs);
  }

  async getKeyPairs(identifier: string): Promise<CryptoKeyPair[] | undefined> {
    let keyPairs = await this.cache.getKeyPairs(identifier);
    if (keyPairs === undefined) {
      keyPairs = await this.underlying.getKeyPairs(identifier);
      if (keyPairs !== undefined) {
        await this.cache.setKeyPairs(identifier, keyPairs);
      }
    }
    return keyPairs;
  }

  async addMessage(
    identifier: string,
    id: Uuid,
    activity: Create | Announce,
  ): Promise<void> {
    await this.underlying.addMessage(identifier, id, activity);
    await this.cache.addMessage(identifier, id, activity);
  }

  async updateMessage(
    identifier: string,
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    // Apply update to underlying first
    const updated = await this.underlying.updateMessage(
      identifier,
      id,
      updater,
    );
    if (updated) {
      // If successful, fetch the updated message and update the cache
      const updatedMessage = await this.underlying.getMessage(identifier, id);
      if (updatedMessage) {
        // Use addMessage which acts like set
        await this.cache.addMessage(identifier, id, updatedMessage);
      } else {
        // Should not happen if updateMessage returned true, but handle defensively
        await this.cache.removeMessage(identifier, id);
      }
    }
    return updated;
  }

  async removeMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    const removedActivity = await this.underlying.removeMessage(identifier, id);
    if (removedActivity !== undefined) {
      await this.cache.removeMessage(identifier, id);
    }
    return removedActivity;
  }

  // getMessages is not cached due to complexity with options
  getMessages(
    identifier: string,
    options?: RepositoryGetMessagesOptions,
  ): AsyncIterable<Create | Announce> {
    return this.underlying.getMessages(identifier, options);
  }

  async getMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    let message = await this.cache.getMessage(identifier, id);
    if (message === undefined) {
      message = await this.underlying.getMessage(identifier, id);
      if (message !== undefined) {
        // Use addMessage which acts like set
        await this.cache.addMessage(identifier, id, message);
      }
    }
    return message;
  }

  // countMessages is not cached
  countMessages(identifier: string): Promise<number> {
    return this.underlying.countMessages(identifier);
  }

  async addFollower(
    identifier: string,
    followId: URL,
    follower: Actor,
  ): Promise<void> {
    await this.underlying.addFollower(identifier, followId, follower);
    await this.cache.addFollower(identifier, followId, follower);
  }

  async removeFollower(
    identifier: string,
    followId: URL,
    followerId: URL,
  ): Promise<Actor | undefined> {
    const removedFollower = await this.underlying.removeFollower(
      identifier,
      followId,
      followerId,
    );
    await this.cache.removeFollower(identifier, followId, followerId);
    return removedFollower;
  }

  async hasFollower(identifier: string, followerId: URL): Promise<boolean> {
    // Check cache first for potentially faster response
    if (await this.cache.hasFollower(identifier, followerId)) {
      return true;
    }
    // If not in cache, check underlying and update cache if found
    const exists = await this.underlying.hasFollower(identifier, followerId);
    // Note: We don't automatically add to cache here, as we don't have the Actor object
    // It will be cached if addFollower is called or if getFollowers iterates over it (though getFollowers isn't cached)
    return exists;
  }

  // getFollowers is not cached due to complexity with options
  getFollowers(
    identifier: string,
    options?: RepositoryGetFollowersOptions,
  ): AsyncIterable<Actor> {
    // We could potentially cache followers as they are iterated,
    // but for simplicity, delegate directly for now.
    return this.underlying.getFollowers(identifier, options);
  }

  // countFollowers is not cached
  countFollowers(identifier: string): Promise<number> {
    return this.underlying.countFollowers(identifier);
  }

  async addSentFollow(
    identifier: string,
    id: Uuid,
    follow: Follow,
  ): Promise<void> {
    await this.underlying.addSentFollow(identifier, id, follow);
    await this.cache.addSentFollow(identifier, id, follow);
  }

  async removeSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    const removedFollow = await this.underlying.removeSentFollow(
      identifier,
      id,
    );
    if (removedFollow !== undefined) {
      await this.cache.removeSentFollow(identifier, id);
    }
    return removedFollow;
  }

  async getSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    let follow = await this.cache.getSentFollow(identifier, id);
    if (follow === undefined) {
      follow = await this.underlying.getSentFollow(identifier, id);
      if (follow !== undefined) {
        await this.cache.addSentFollow(identifier, id, follow);
      }
    }
    return follow;
  }

  async addFollowee(
    identifier: string,
    followeeId: URL,
    follow: Follow,
  ): Promise<void> {
    await this.underlying.addFollowee(identifier, followeeId, follow);
    await this.cache.addFollowee(identifier, followeeId, follow);
  }

  async removeFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    const removedFollow = await this.underlying.removeFollowee(
      identifier,
      followeeId,
    );
    // Invalidate the cache even when the underlying repository returned
    // nothing: a retried removal may have already deleted the record while
    // the cache still holds it.
    await this.cache.removeFollowee(identifier, followeeId);
    return removedFollow;
  }

  async getFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    let follow = await this.cache.getFollowee(identifier, followeeId);
    if (follow === undefined) {
      follow = await this.underlying.getFollowee(identifier, followeeId);
      if (follow !== undefined) {
        await this.cache.addFollowee(identifier, followeeId, follow);
      }
    }
    return follow;
  }

  // findFollowedBots is not cached, since the cache may not have the complete
  // set of followees
  findFollowedBots(followeeId: URL): AsyncIterable<string> {
    return this.underlying.findFollowedBots(followeeId);
  }

  async addQuoteAuthorization(
    identifier: string,
    id: Uuid,
    authorization: QuoteAuthorization,
  ): Promise<void> {
    await this.underlying.addQuoteAuthorization(identifier, id, authorization);
  }

  async getQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    let authorization = await this.cache.getQuoteAuthorization(identifier, id);
    if (authorization === undefined) {
      authorization = await this.underlying.getQuoteAuthorization(
        identifier,
        id,
      );
      if (authorization !== undefined) {
        await this.cache.addQuoteAuthorization(identifier, id, authorization);
      }
    }
    return authorization;
  }

  async findQuoteAuthorization(
    identifier: string,
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined> {
    return await this.underlying.findQuoteAuthorization(
      identifier,
      interactingObject,
    );
  }

  async removeQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    const removed = await this.underlying.removeQuoteAuthorization(
      identifier,
      id,
    );
    await this.cache.removeQuoteAuthorization(identifier, id);
    return removed;
  }

  async addQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
    messageId: Uuid,
    attribution?: URL,
  ): Promise<void> {
    await this.underlying.addQuoteAuthorizationReference(
      identifier,
      authorization,
      messageId,
      attribution,
    );
    await this.cache.addQuoteAuthorizationReference(
      identifier,
      authorization,
      messageId,
      attribution,
    );
  }

  async findQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<Uuid | undefined> {
    const cached = await this.cache.findQuoteAuthorizationReference(
      identifier,
      authorization,
    );
    if (cached != null) return cached;
    const found = await this.underlying.findQuoteAuthorizationReference(
      identifier,
      authorization,
    );
    if (found != null) {
      const attribution =
        typeof this.underlying.findQuoteAuthorizationReferenceAttribution ===
            "function"
          ? await this.underlying.findQuoteAuthorizationReferenceAttribution(
            identifier,
            authorization,
          )
          : undefined;
      await this.cache.addQuoteAuthorizationReference(
        identifier,
        authorization,
        found,
        attribution,
      );
    }
    return found;
  }

  async *findQuoteAuthorizationReferenceIdentifiers(
    authorization: URL,
  ): AsyncIterable<string> {
    if (
      typeof this.underlying.findQuoteAuthorizationReferenceIdentifiers !==
        "function"
    ) return;
    for await (
      const identifier of this.underlying
        .findQuoteAuthorizationReferenceIdentifiers(authorization)
    ) {
      const found = await this.underlying.findQuoteAuthorizationReference(
        identifier,
        authorization,
      );
      if (found != null) {
        const attribution =
          typeof this.underlying.findQuoteAuthorizationReferenceAttribution ===
              "function"
            ? await this.underlying.findQuoteAuthorizationReferenceAttribution(
              identifier,
              authorization,
            )
            : undefined;
        await this.cache.addQuoteAuthorizationReference(
          identifier,
          authorization,
          found,
          attribution,
        );
      }
      yield identifier;
    }
  }

  async findQuoteAuthorizationReferenceAttribution(
    identifier: string,
    authorization: URL,
  ): Promise<URL | undefined> {
    const cached = await this.cache.findQuoteAuthorizationReferenceAttribution(
      identifier,
      authorization,
    );
    if (cached != null) return cached;
    if (
      typeof this.underlying.findQuoteAuthorizationReferenceAttribution !==
        "function"
    ) return undefined;
    const found = await this.underlying.findQuoteAuthorizationReference(
      identifier,
      authorization,
    );
    if (found == null) return undefined;
    const attribution = await this.underlying
      .findQuoteAuthorizationReferenceAttribution(identifier, authorization);
    if (attribution != null) {
      await this.cache.addQuoteAuthorizationReference(
        identifier,
        authorization,
        found,
        attribution,
      );
    }
    return attribution;
  }

  async removeQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<void> {
    await this.underlying.removeQuoteAuthorizationReference(
      identifier,
      authorization,
    );
    await this.cache.removeQuoteAuthorizationReference(
      identifier,
      authorization,
    );
  }

  async vote(
    identifier: string,
    messageId: Uuid,
    voterId: URL,
    option: string,
  ): Promise<void> {
    await this.cache.vote(identifier, messageId, voterId, option);
    await this.underlying.vote(identifier, messageId, voterId, option);
  }

  async countVoters(identifier: string, messageId: Uuid): Promise<number> {
    const voters = await this.cache.countVoters(identifier, messageId);
    if (voters > 0) return voters;
    return this.underlying.countVoters(identifier, messageId);
  }

  async countVotes(
    identifier: string,
    messageId: Uuid,
  ): Promise<Readonly<Record<string, number>>> {
    const votes = await this.cache.countVotes(identifier, messageId);
    if (globalThis.Object.keys(votes).length > 0) return votes;
    return await this.underlying.countVotes(identifier, messageId);
  }

  forIdentifier(identifier: string): ActorScopedRepository {
    return new ActorScopedRepository(this, identifier);
  }

  /**
   * Migrates data stored by BotKit 0.4 or earlier in the underlying
   * repository, so that it belongs to the given identifier.  The cache is
   * not involved: it starts empty and only ever holds values read after
   * the migration.
   * @param identifier The identifier of the bot actor that adopts the
   *                   legacy data.
   * @since 0.5.0
   */
  async migrate(identifier: string): Promise<void> {
    await this.underlying.migrate?.(identifier);
  }
}
