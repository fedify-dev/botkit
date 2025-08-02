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
import type { Actor, Follow } from "@fedify/fedify/vocab";

/**
 * A follow request to the bot.
 */
export interface FollowRequest {
  /**
   * The URI of the follow request.
   */
  readonly id: URL;

  /**
   * The raw follow request object.
   */
  readonly raw: Follow;

  /**
   * The follower actor.
   */
  readonly follower: Actor;

  /**
   * The state of the follow request.
   *
   * - `"pending"`: The follow request is pending.
   * - `"accepted"`: The follow request is accepted.
   * - `"rejected"`: The follow request is rejected.
   */
  readonly state: "pending" | "accepted" | "rejected";

  /**
   * Accepts the follow request.
   * @throws {TypeError} The follow request is not pending.
   */
  accept(): Promise<void>;

  /**
   * Rejects the follow request.
   * @throws {TypeError} The follow request is not pending.
   */
  reject(): Promise<void>;
}
