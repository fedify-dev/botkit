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
  Actor,
  Announce,
  Article,
  ChatMessage,
  Document,
  Emoji as CustomEmoji,
  Hashtag,
  Note,
  Question,
} from "@fedify/fedify/vocab";
import type { LanguageTag } from "@phensley/language-tag";
import type { DeferredCustomEmoji, Emoji } from "./emoji.ts";
import type { AuthorizedLike, AuthorizedReaction } from "./reaction.ts";
import type {
  SessionPublishOptions,
  SessionPublishOptionsWithClass,
} from "./session.ts";
import type { Text } from "./text.ts";
export {
  Article,
  Audio,
  ChatMessage,
  Document,
  Hashtag,
  Image,
  isActor,
  Note,
  Question,
  Video,
} from "@fedify/fedify/vocab";
export type { Actor } from "@fedify/fedify/vocab";
export { LanguageTag, parseLanguageTag } from "@phensley/language-tag";

/**
 * A possible message class.
 */
export type MessageClass = Article | ChatMessage | Note | Question;

/**
 * The visibility of a message.
 */
export type MessageVisibility =
  /**
   * Signifies that the message is public; it can be seen and discovered by
   * anyone.
   */
  | "public"
  /**
   * Signifies that the message is quietly public; it can be seen by anyone,
   * but it will not appear in public timelines or search results.
   */
  | "unlisted"
  /**
   * Signifies that the message is only visible to followers of the account.
   * It will not appear in public timelines or search results.
   */
  | "followers"
  /**
   * Signifies that the message is private; it can only be seen by mentioned
   * accounts.
   */
  | "direct"
  /**
   * Signifies that the message is unknown; it is not clear who can see it.
   * It is usually the case when the message is published by a minor fediverse
   * server that is incompatible with Mastodon-style visibility.
   */
  | "unknown";

/**
 * A message in the ActivityPub network.  It is a thin wrapper around
 * a Fedify object: an `Article`, a `ChatMessage`, a `Note`, or a `Question`.
 * @typeParam T The class of the message.  One of `Article`, `ChatMessage`,
 *              `Note`, or `Question`.
 * @typeParam TContextData The type of the context data.
 */
export interface Message<T extends MessageClass, TContextData> {
  /**
   * The underlying raw message object.
   */
  readonly raw: T;

  /**
   * The URI of the message.
   */
  readonly id: URL;

  /**
   * The actor who published the message.
   */
  readonly actor: Actor;

  /**
   * The visibility of the message.
   */
  readonly visibility: MessageVisibility;

  /**
   * The language of the message if the content is tagged with a language.
   */
  readonly language?: LanguageTag;

  /**
   * The plain text content of the message.
   */
  readonly text: string;

  /**
   * The HTML content of the message.
   */
  readonly html: string;

  /**
   * The original message in reply to, if the message is a reply.
   */
  readonly replyTarget?: Message<MessageClass, TContextData>;

  /**
   * The actors mentioned in the message.
   */
  readonly mentions: readonly Actor[];

  /**
   * The hashtags used in the message.
   */
  readonly hashtags: readonly Hashtag[];

  /**
   * The media attachments of the message.
   */
  readonly attachments: readonly Document[];

  /**
   * The published time of the message.
   */
  readonly published?: Temporal.Instant;

  /**
   * The updated time of the message, if it is updated.
   */
  readonly updated?: Temporal.Instant;

  /**
   * Publishes a reply to the message.
   * @param text The content of the message.
   * @param options The options for publishing the message.
   * @returns The published message.
   */
  reply(
    text: Text<"block", TContextData>,
    options?: SessionPublishOptions,
  ): Promise<AuthorizedMessage<Note, TContextData>>;

  /**
   * Publishes a reply to the message.
   * @typeParam T The class of the published message.
   * @param text The content of the message.
   * @param options The options for publishing the message.
   * @returns The published message.
   */
  reply<T extends MessageClass>(
    text: Text<"block", TContextData>,
    options?: SessionPublishOptionsWithClass<T>,
  ): Promise<AuthorizedMessage<T, TContextData>>;

  /**
   * Shares the message.
   *
   * It throws an error if the visibility of the message is neither `"public"`
   * nor `"unlisted"`.
   * @param options The options for sharing the message.
   * @returns The shared message.
   * @throws {TypeError} If the visibility of the message is not `"public"` or
   *                     `"unlisted"`.
   */
  share(
    options?: MessageShareOptions,
  ): Promise<AuthorizedSharedMessage<T, TContextData>>;

  /**
   * Likes the message.
   * @returns The like object.
   */
  like(): Promise<AuthorizedLike<TContextData>>;

  /**
   * Reacts to the message with a Unicode emoji or a custom emoji.
   * @param emoji The emoji to react with.  It can be either a Unicode emoji or
   *              a custom emoji.
   * @returns The reaction object.
   * @since 0.2.0
   */
  react(
    emoji: Emoji | CustomEmoji | DeferredCustomEmoji<TContextData>,
  ): Promise<AuthorizedReaction<TContextData>>;
}

/**
 * An authorized message in the ActivityPub network.  Usually it is a message
 * published by the bot itself.
 * @typeParam T The class of the message.  One of `Article`, `ChatMessage`,
 *              `Note`, or `Question`.
 * @typeParam TContextData The type of the context data.
 */
export interface AuthorizedMessage<T extends MessageClass, TContextData>
  extends Message<T, TContextData> {
  /**
   * Updates the message with new content.
   * @param text The new content of the message.
   */
  update(text: Text<"block", TContextData>): Promise<void>;

  /**
   * Deletes the message, if possible.
   *
   * If the message is already deleted, it will be a no-op.
   */
  delete(): Promise<void>;
}

/**
 * Options for sharing a message.
 */
export interface MessageShareOptions {
  /**
   * The visibility of the shared message.  If omitted, the visibility of the
   * original message will be used.
   */
  readonly visibility?: Exclude<MessageVisibility, "direct" | "unknown">;
}

/**
 * A shared message in the ActivityPub network.  It is a thin wrapper around
 * an `Announce`, which is a Fedify object.
 * @typeParam T The class of the message.  One of `Article`, `ChatMessage`,
 *              `Note`, or `Question`.
 * @typeParam TContextData The type of the context data.
 */
export interface SharedMessage<T extends MessageClass, TContextData> {
  /**
   * The underlying raw shared message object.
   */
  readonly raw: Announce;

  /**
   * The URI of the shared message.
   */
  readonly id: URL;

  /**
   * The actor who shared the message.
   */
  readonly actor: Actor;

  /**
   * The visibility of the shared message.
   */
  readonly visibility: MessageVisibility;

  /**
   * The original message.
   */
  readonly original: Message<T, TContextData>;
}

/**
 * An authorized shared message in the ActivityPub network.  Usually it is a
 * message shared by the bot itself.
 * @typeParam T The class of the message.  One of `Article`, `ChatMessage`,
 *              `Note`, or `Question`.
 * @typeParam TContextData The type of the context data.
 */
export interface AuthorizedSharedMessage<T extends MessageClass, TContextData>
  extends SharedMessage<T, TContextData> {
  /**
   * Undoes the shared message.
   *
   * If the shared message is already undone, it silently fails.
   */
  unshare(): Promise<void>;
}
