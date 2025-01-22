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
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertRejects } from "@std/assert/rejects";
import { BotImpl } from "./bot-impl.ts";
import { FollowRequestImpl } from "./follow-impl.ts";
import { createMockContext } from "./session-impl.test.ts";
import { SessionImpl } from "./session-impl.ts";

Deno.test("new FollowRequestImpl()", () => {
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
  assertEquals(followRequest.session, session);
  assertEquals(followRequest.id, follow.id);
  assertEquals(followRequest.raw, follow);
  assertEquals(followRequest.follower, follower);
  assertEquals(followRequest.followerId, follower.id);
  assertEquals(followRequest.state, "pending");
});

Deno.test("FollowRequestImpl.accept()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
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
  assertEquals(followRequest.state, "accepted");
  const followerJson = await kv.get([
    ...bot.kvPrefixes.followers,
    "https://example.com/ap/actor/john",
  ]);
  assert(followerJson != null);
  const storedFollower = await Person.fromJsonLd(followerJson);
  assertEquals(storedFollower.id, follower.id);
  assertEquals(storedFollower.preferredUsername, follower.preferredUsername);
  assertEquals(
    await kv.get(bot.kvPrefixes.followers),
    ["https://example.com/ap/actor/john"],
  );
  assertEquals(
    await kv.get([
      ...bot.kvPrefixes.followRequests,
      "https://example.com/ap/follow/1",
    ]),
    "https://example.com/ap/actor/john",
  );
  assertEquals(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assertEquals(recipients, [follower]);
  assertInstanceOf(activity, Accept);
  assertEquals(activity.actorId, session.actorId);
  assertEquals(activity.toId, follower.id);
  assertEquals(activity.objectId, follow.id);

  assertRejects(
    () => followRequest.accept(),
    TypeError,
    "The follow request is not pending.",
  );
  assertRejects(
    () => followRequest.reject(),
    TypeError,
    "The follow request is not pending.",
  );
});

Deno.test("FollowRequestImpl.reject()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
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
  assertEquals(followRequest.state, "rejected");
  const followerJson = await kv.get([
    ...bot.kvPrefixes.followers,
    "https://example.com/ap/actor/john",
  ]);
  assertEquals(followerJson, undefined);
  assertEquals(await kv.get(bot.kvPrefixes.followers), undefined);
  assertEquals(
    await kv.get([
      ...bot.kvPrefixes.followRequests,
      "https://example.com/ap/follow/1",
    ]),
    undefined,
  );
  assertEquals(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assertEquals(recipients, [follower]);
  assertInstanceOf(activity, Reject);
  assertEquals(activity.actorId, session.actorId);
  assertEquals(activity.toId, follower.id);
  assertEquals(activity.objectId, follow.id);

  assertRejects(
    () => followRequest.accept(),
    TypeError,
    "The follow request is not pending.",
  );
  assertRejects(
    () => followRequest.reject(),
    TypeError,
    "The follow request is not pending.",
  );
});
