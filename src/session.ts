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
  Article,
  ChatMessage,
  Context,
  Document,
  Note,
  Question,
} from "@fedify/fedify";
import type { LanguageTag } from "@phensley/language-tag";
import type { Bot } from "./bot.ts";
import type {
  AuthorizedMessage,
  MessageClass,
  MessageVisibility,
} from "./message.ts";
import type { RepositoryGetMessagesOptions } from "./repository.ts";
import type { Text } from "./text.ts";

/**
 * A session to control the bot.
 */
export interface Session<TContextData> {
  /**
   * The bot to which the session belongs.
   */
  readonly bot: Bot<TContextData>;

  /**
   * The Fedify context of the session.
   */
  readonly context: Context<TContextData>;

  /**
   * The URI of the bot actor.
   */
  readonly actorId: URL;

  /**
   * The fediverse handle of the bot actor.  It starts with `@`.
   */
  readonly actorHandle: `@${string}@${string}`;

  /**
   * Gets the `Actor` object of the bot.
   * @returns The `Actor` object of the bot.
   */
  getActor(): Promise<Actor>;

  /**
   * Send a follow request to the specified actor.
   *
   * Note that it does not guarantee that the follow request will be accepted.
   * You might need to handle {@link Bot.onAcceptFollow} and {@link Bot.onRejectFollow}
   * events to know the result.
   *
   * If the bot is already following the actor, it does nothing.
   * @param actor The actor to follow.  It can be an `Actor` object, or a `URL`
   *              of the actor, or a URI string or a fediverse handle of the
   *              actor.
   * @throws {TypeError} If the actor URL is invalid or the resolved object
   *                     is not an `Actor`.
   */
  follow(actor: Actor | URL | string): Promise<void>;

  /**
   * Unfollow the specified actor.
   *
   * Unlike {@link Session.follow}, it immediately unfollows the actor without
   * any confirmation.
   *
   * If the bot is not following the actor, it does nothing.
   * @param actor The actor to unfollow.  It can be an `Actor` object,
   *              or a `URL` of the actor, or a URI string or a fediverse handle
   *              of the actor.
   * @throws {TypeError} If the actor URL is invalid or the resolved object
   *                     is not an `Actor`.
   */
  unfollow(actor: Actor | URL | string): Promise<void>;

  /**
   * Publishes a message attributed to the bot.
   * @param text The content of the note.
   * @param options The options for publishing the message.
   * @returns The published message.
   */
  publish(
    content: Text<"block", TContextData>,
    options?: SessionPublishOptions,
  ): Promise<AuthorizedMessage<Note, TContextData>>;

  /**
   * Publishes a message attributed to the bot.
   * @typeParam T The class of the published message.
   * @param text The content of the note.
   * @param options The options for publishing the message.
   * @returns The published message.
   */
  publish<T extends MessageClass>(
    content: Text<"block", TContextData>,
    options: SessionPublishOptionsWithClass<T>,
  ): Promise<AuthorizedMessage<T, TContextData>>;

  /**
   * Gets messages from the bot's outbox.
   * @param options The options for getting messages.
   * @returns An async iterable of messages.
   */
  getOutbox(
    options?: SessionGetOutboxOptions,
  ): AsyncIterable<AuthorizedMessage<MessageClass, TContextData>>;
}

/**
 * Options for publishing a message.
 */
export interface SessionPublishOptions {
  /**
   * The language of the published message.
   */
  readonly language?: string | LanguageTag;

  /**
   * The visibility of the published message.  If omitted, `"public"` will be
   * used.
   */
  readonly visibility?: Exclude<MessageVisibility, "unknown">;

  /**
   * The media attachments of the published message.
   */
  readonly attachments?: Document[];
}

/**
 * Options for publishing a message with a specific class.
 */
export interface SessionPublishOptionsWithClass<T extends MessageClass>
  extends SessionPublishOptions {
  /**
   * The class of the published message.  If omitted, `Note` will be used.
   */
  readonly class: T extends Article ? typeof Article
    : T extends ChatMessage ? typeof ChatMessage
    : T extends Note ? typeof Note
    : T extends Question ? typeof Question
    : never;
}

/**
 * Options for getting messages from the bot's outbox.
 */
export interface SessionGetOutboxOptions extends RepositoryGetMessagesOptions {
}
