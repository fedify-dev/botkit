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
import type { Emoji } from "@fedify/fedify/vocab";
import type { Session } from "./session.ts";
export { Emoji } from "@fedify/fedify/vocab";

/**
 * The common interface for defining custom emojis.
 * @since 0.2.0
 */
export interface CustomEmojiBase {
  /**
   * The media type of the emoji.  It has to start with `image/`.
   */
  readonly type: `image/${string}`;
}

/**
 * The interface for defining custom emojis from a remote image URL.
 * @since 0.2.0
 */
export interface CustomEmojiFromUrl extends CustomEmojiBase {
  /**
   * The URL of the remote image.
   */
  readonly url: string | URL;
}

/**
 * The interface for defining custom emojis from a local image file.
 * @since 0.2.0
 */
export interface CustomEmojiFromFile extends CustomEmojiBase {
  /**
   * The path to the local image file.
   */
  readonly file: string | URL;
}

/**
 * A definition of a custom emoji.  It can be either a remote image URL or
 * a local image file.
 * @since 0.2.0
 */
export type CustomEmoji = CustomEmojiFromUrl | CustomEmojiFromFile;

/**
 * A deferred {@link Emoji}, which is a function that takes a {@link Session}
 * and returns an {@link Emoji}.  This is useful for creating emojis that
 * depend on the session data.
 * @since 0.2.0
 * @param TContextData The type of the context data.
 * @return The {@link Emoji} object.
 */
export type DeferredEmoji<TContextData> = (
  session: Session<TContextData>,
) => Emoji;
