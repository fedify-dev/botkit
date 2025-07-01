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
import type { Actor, Note, Question } from "@fedify/fedify/vocab";
import type { Message } from "./message.ts";

/**
 * An interface representing a poll.
 * @since 0.3.0
 */
export interface Poll {
  /**
   * Whether the poll allows multiple selections.
   */
  readonly multiple: boolean;

  /**
   * The options of the poll.  Each option is a string.  **Every option must be
   * unique, and must not be empty.**
   */
  readonly options: readonly string[];

  /**
   * The time when the poll ends.
   */
  readonly endTime: Temporal.Instant;
}

/**
 * An interface representing a vote in a poll.  Note that if the poll allows
 * multiple selections, the options are represented as multiple {@link Vote}
 * objects, each with a single option.
 * @typeParam TContextData The type of the context data.
 * @since 0.3.0
 */
export interface Vote<TContextData> {
  /**
   * The underlying raw note object.
   */
  readonly raw: Note;

  /**
   * The actor who voted.
   */
  readonly actor: Actor;

  /**
   * The question to which the poll belongs.
   */
  readonly message: Message<Question, TContextData>;

  /**
   * The poll to which the vote belongs.
   */
  readonly poll: Poll;

  /**
   * The options selected by the actor.  Note that this is a string even
   * if the poll allows multiple selections.  If the poll allows multiple
   * selections, the options are represented as multiple {@link Vote} objects.
   */
  readonly option: string;
}
