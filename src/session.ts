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
  Article,
  ChatMessage,
  Context,
  Document,
  Note,
  Question,
} from "@fedify/fedify";
import type { LanguageTag } from "@phensley/language-tag";
import type { Bot } from "./bot.ts";
import type { Message, MessageClass, MessageVisibility } from "./message.ts";
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
   * Publishes a message attributed to the bot.
   * @param text The content of the note.
   * @param options The options for publishing the message.
   * @returns The published message.
   */
  publish(
    content: Text<"block", TContextData>,
    options?: SessionPublishOptions,
  ): Promise<Message<Note, TContextData>>;

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
  ): Promise<Message<T, TContextData>>;
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
