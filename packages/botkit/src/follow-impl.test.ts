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
import { Person } from "@fedify/fedify";
import { MemoryKvStore } from "@fedify/fedify/federation";
import { Accept, Follow, Reject } from "@fedify/fedify/vocab";
import assert from "node:assert";
import { test } from "node:test";
import { BotImpl } from "./bot-impl.ts";
import { FollowRequestImpl } from "./follow-impl.ts";
import { MemoryRepository } from "./repository.ts";
import { createMockContext } from "./session-impl.test.ts";
import { SessionImpl } from "./session-impl.ts";

test("new FollowRequestImpl()", () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  const follower = new Person({
    id: new URL("https://example.com/ap/actor/john"),
    preferredUsername: "john",
  });
  const follow = new Follow({
    id: new URL("https://example.com/ap/follow/1"),
    actor: follower,
    object: session.actorId,
  });
  const followRequest = new FollowRequestImpl(session, follow, follower);
  assert.deepStrictEqual(followRequest.session, session);
  assert.deepStrictEqual(followRequest.id, follow.id);
  assert.deepStrictEqual(followRequest.raw, follow);
  assert.deepStrictEqual(followRequest.follower, follower);
  assert.deepStrictEqual(followRequest.state, "pending");
});

test("FollowRequestImpl.accept()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  const follower = new Person({
    id: new URL("https://example.com/ap/actor/john"),
    preferredUsername: "john",
  });
  const follow = new Follow({
    id: new URL("https://example.com/ap/follow/1"),
    actor: follower,
    object: session.actorId,
  });
  const followRequest = new FollowRequestImpl(session, follow, follower);
  await followRequest.accept();
  assert.deepStrictEqual(followRequest.state, "accepted");
  assert.ok(
    await repository.hasFollower(new URL("https://example.com/ap/actor/john")),
  );
  const [storedFollower] = await Array.fromAsync(repository.getFollowers());
  assert.ok(storedFollower != null);
  assert.deepStrictEqual(storedFollower.id, follower.id);
  assert.deepStrictEqual(
    storedFollower.preferredUsername,
    follower.preferredUsername,
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [follower]);
  assert.ok(activity instanceof Accept);
  assert.deepStrictEqual(activity.actorId, session.actorId);
  assert.deepStrictEqual(activity.toId, follower.id);
  assert.deepStrictEqual(activity.objectId, follow.id);

  assert.rejects(
    () => followRequest.accept(),
    TypeError,
    "The follow request is not pending.",
  );
  assert.rejects(
    () => followRequest.reject(),
    TypeError,
    "The follow request is not pending.",
  );
});

test("FollowRequestImpl.reject()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  const follower = new Person({
    id: new URL("https://example.com/ap/actor/john"),
    preferredUsername: "john",
  });
  const follow = new Follow({
    id: new URL("https://example.com/ap/follow/1"),
    actor: follower,
    object: session.actorId,
  });
  const followRequest = new FollowRequestImpl(session, follow, follower);
  await followRequest.reject();
  assert.deepStrictEqual(followRequest.state, "rejected");
  assert.deepStrictEqual(
    await repository.hasFollower(new URL("https://example.com/ap/actor/john")),
    false,
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [follower]);
  assert.ok(activity instanceof Reject);
  assert.deepStrictEqual(activity.actorId, session.actorId);
  assert.deepStrictEqual(activity.toId, follower.id);
  assert.deepStrictEqual(activity.objectId, follow.id);

  assert.rejects(
    () => followRequest.accept(),
    TypeError,
    "The follow request is not pending.",
  );
  assert.rejects(
    () => followRequest.reject(),
    TypeError,
    "The follow request is not pending.",
  );
});
