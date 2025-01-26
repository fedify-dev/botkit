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
import { Accept, type Actor, type Follow, Reject } from "@fedify/fedify/vocab";
import type { FollowRequest } from "./follow.ts";
import type { SessionImpl } from "./session-impl.ts";

export class FollowRequestImpl<TContextData> implements FollowRequest {
  readonly session: SessionImpl<TContextData>;
  readonly id: URL;
  readonly raw: Follow;
  readonly follower: Actor;
  #state: "pending" | "accepted" | "rejected";

  get state(): "pending" | "accepted" | "rejected" {
    return this.#state;
  }

  constructor(
    session: SessionImpl<TContextData>,
    raw: Follow,
    follower: Actor,
  ) {
    if (raw.id == null) {
      throw new TypeError("The follow request ID is missing.");
    } else if (follower.id == null) {
      throw new TypeError("The follower ID is missing.");
    }
    this.session = session;
    this.id = raw.id;
    this.raw = raw;
    this.follower = follower;
    this.#state = "pending";
  }

  async accept(): Promise<void> {
    if (this.#state !== "pending") {
      throw new TypeError("The follow request is not pending.");
    }
    await this.session.context.sendActivity(
      this.session.bot,
      this.follower,
      new Accept({
        id: new URL(`/#accept/${this.id.href}`, this.session.actorId),
        actor: this.session.actorId,
        to: this.follower.id,
        object: this.raw,
      }),
      { excludeBaseUris: [new URL(this.session.context.origin)] },
    );
    await this.session.bot.repository.addFollower(this.id, this.follower);
    this.#state = "accepted";
  }

  async reject(): Promise<void> {
    if (this.#state !== "pending") {
      throw new TypeError("The follow request is not pending.");
    }
    await this.session.context.sendActivity(
      this.session.bot,
      this.follower,
      new Reject({
        id: new URL(`/#accept/${this.id.href}`, this.session.actorId),
        actor: this.session.actorId,
        to: this.follower.id,
        object: this.raw,
      }),
      { excludeBaseUris: [new URL(this.session.context.origin)] },
    );
    this.#state = "rejected";
  }
}
