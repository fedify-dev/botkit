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
import type { Actor, Like as RawLike } from "@fedify/fedify/vocab";
import type { Message, MessageClass } from "./message.ts";
export { type Actor, Like as RawLike } from "@fedify/fedify/vocab";

/**
 * A like of a message.  It is a thin wrapper around a `Like`, which is
 * a Fedify object.
 * @typeParam TContextData The type of the context data.
 */
export interface Like<TContextData> {
  /**
   * The underlying raw `Like` activity.
   */
  readonly raw: RawLike;

  /**
   * The URI of the like activity.
   */
  readonly id: URL;

  /**
   * The actor who liked the message.
   */
  readonly actor: Actor;

  /**
   * The message that was liked.
   */
  readonly message: Message<MessageClass, TContextData>;
}

/**
 * An authorized like of a message.  Usually it is a like that the bot
 * itself made.
 * @typeParam TContextData The type of the context data.
 */
export interface AuthorizedLike<TContextData> extends Like<TContextData> {
  /**
   * Undoes the like.
   *
   * If the like is already undone, this method does nothing.
   */
  unlike(): Promise<void>;
}
