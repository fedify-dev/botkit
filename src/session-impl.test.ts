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
import { type Context, MemoryKvStore } from "@fedify/fedify/federation";
import {
  type Activity,
  Create,
  Follow,
  Note,
  Person,
  PUBLIC_COLLECTION,
  type Recipient,
  Undo,
} from "@fedify/fedify/vocab";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { BotImpl } from "./bot-impl.ts";
import { SessionImpl } from "./session-impl.ts";
import { mention, text } from "./text.ts";

Deno.test("SessionImpl.follow()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  await t.step("follow", async () => {
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    });
    await session.follow(actor);
    assertEquals(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, [actor]);
    assertInstanceOf(activity, Follow);
    const parsed = ctx.parseUri(activity.id);
    assertEquals(parsed?.type, "object");
    assert(parsed?.type === "object");
    assertEquals(parsed.class, Follow);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(activity.objectId, actor.id);
    assertEquals(activity.toIds, [actor.id]);
    const followJson = await kv.get([
      ...bot.kvPrefixes.follows,
      parsed.values.id,
    ]);
    assert(followJson != null);
    const follow = await Follow.fromJsonLd(followJson);
    assertEquals(
      await follow.toJsonLd({ format: "compact" }),
      await activity.toJsonLd({ format: "compact" }),
    );
  });

  ctx.sentActivities = [];

  await t.step("follow again", async () => {
    await kv.set(
      [...bot.kvPrefixes.followees, "https://example.com/ap/actor/alice"],
      {},
    );
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/alice"),
      preferredUsername: "alice",
    });
    await session.follow(actor);
    assertEquals(ctx.sentActivities, []);
  });
});

Deno.test("SessionImpl.unfollow()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  await t.step("unfollow", async () => {
    await kv.set(
      [...bot.kvPrefixes.followees, "https://example.com/ap/actor/alice"],
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Follow",
        id:
          "https://example.com/ap/follow/4114eadb-2596-408f-ad99-06f467c9ace0",
        actor: "https://example.com/ap/actor/bot",
        object: "https://example.com/ap/actor/alice",
      },
    );
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/alice"),
      preferredUsername: "alice",
    });
    await session.unfollow(actor);
    assertEquals(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, [actor]);
    assertInstanceOf(activity, Undo);
    const object = await activity.getObject(ctx);
    assertInstanceOf(object, Follow);
    assertEquals(
      object.id,
      new URL(
        "https://example.com/ap/follow/4114eadb-2596-408f-ad99-06f467c9ace0",
      ),
    );
    assertEquals(object.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followees,
        "https://example.com/ap/actor/alice",
      ]),
      undefined,
    );
  });

  ctx.sentActivities = [];

  await t.step("unfollow again", async () => {
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/alice"),
      preferredUsername: "alice",
    });
    await session.unfollow(actor);
    assertEquals(ctx.sentActivities, []);
  });
});

Deno.test("SessionImpl.publish()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  await t.step("public", async () => {
    const publicMsg = await session.publish(text`Hello, world!`);
    assertEquals(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, "followers");
    assertInstanceOf(activity, Create);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(activity.toIds, [PUBLIC_COLLECTION]);
    assertEquals(activity.ccIds, [ctx.getFollowersUri(bot.identifier)]);
    const object = await activity.getObject(ctx);
    assertInstanceOf(object, Note);
    assertEquals(object.attributionId, ctx.getActorUri(bot.identifier));
    assertEquals(object.toIds, [PUBLIC_COLLECTION]);
    assertEquals(object.ccIds, [ctx.getFollowersUri(bot.identifier)]);
    assertEquals(object.content, "<p>Hello, world!</p>");
    assertEquals(object.tagIds, []);
    assertEquals(publicMsg.id, object.id);
    assertEquals(publicMsg.text, "Hello, world!");
    assertEquals(publicMsg.html, "<p>Hello, world!</p>");
    assertEquals(publicMsg.visibility, "public");
    assertEquals(publicMsg.mentions, []);
  });

  ctx.sentActivities = [];

  await t.step("unlisted", async () => {
    const unlistedMsg = await session.publish(text`Hello!`, {
      visibility: "unlisted",
    });
    assertEquals(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, "followers");
    assertInstanceOf(activity, Create);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(activity.toIds, [ctx.getFollowersUri(bot.identifier)]);
    assertEquals(activity.ccIds, [PUBLIC_COLLECTION]);
    const object = await activity.getObject(ctx);
    assertInstanceOf(object, Note);
    assertEquals(object.attributionId, ctx.getActorUri(bot.identifier));
    assertEquals(object.toIds, [ctx.getFollowersUri(bot.identifier)]);
    assertEquals(object.ccIds, [PUBLIC_COLLECTION]);
    assertEquals(object.content, "<p>Hello!</p>");
    assertEquals(object.tagIds, []);
    assertEquals(unlistedMsg.id, object.id);
    assertEquals(unlistedMsg.text, "Hello!");
    assertEquals(unlistedMsg.html, "<p>Hello!</p>");
    assertEquals(unlistedMsg.visibility, "unlisted");
    assertEquals(unlistedMsg.mentions, []);
  });

  ctx.sentActivities = [];

  await t.step("followers", async () => {
    const followersMsg = await session.publish(text`Hi!`, {
      visibility: "followers",
    });
    assertEquals(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, "followers");
    assertInstanceOf(activity, Create);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(activity.toIds, [ctx.getFollowersUri(bot.identifier)]);
    assertEquals(activity.ccIds, []);
    const object = await activity.getObject(ctx);
    assertInstanceOf(object, Note);
    assertEquals(object.attributionId, ctx.getActorUri(bot.identifier));
    assertEquals(object.toIds, [ctx.getFollowersUri(bot.identifier)]);
    assertEquals(object.ccIds, []);
    assertEquals(object.content, "<p>Hi!</p>");
    assertEquals(object.tagIds, []);
    assertEquals(followersMsg.id, object.id);
    assertEquals(followersMsg.text, "Hi!");
    assertEquals(followersMsg.html, "<p>Hi!</p>");
    assertEquals(followersMsg.visibility, "followers");
    assertEquals(followersMsg.mentions, []);
  });

  ctx.sentActivities = [];

  await t.step("direct", async () => {
    const mentioned = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    });
    const directMsg = await session.publish(
      text`Hey ${mention(mentioned)}!`,
      { visibility: "direct" },
    );
    assertEquals(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, [mentioned]);
    assertInstanceOf(activity, Create);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(activity.toIds, [mentioned.id]);
    assertEquals(activity.ccIds, []);
    const object = await activity.getObject(ctx);
    assertInstanceOf(object, Note);
    assertEquals(object.attributionId, ctx.getActorUri(bot.identifier));
    assertEquals(object.toIds, [mentioned.id]);
    assertEquals(object.ccIds, []);
    assertEquals(
      object.content,
      '<p>Hey <a href="https://example.com/ap/actor/john" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>john@example.com' +
        "</span></a>!</p>",
    );
    const tags = await Array.fromAsync(object.getTags());
    assertEquals(tags.length, 1);
    assertEquals(directMsg.id, object.id);
    assertEquals(directMsg.text, "Hey @john@example.com!");
    assertEquals(directMsg.html, object.content);
    assertEquals(directMsg.visibility, "direct");
    // assertEquals(directMsg.mentions, [mentioned]); // FIXME
  });
});

export interface SentActivity {
  recipients: "followers" | Recipient[];
  activity: Activity;
}

export interface MockContext extends Context<void> {
  sentActivities: SentActivity[];
}

export function createMockContext(
  bot: BotImpl<void>,
  origin: URL | string,
): MockContext {
  const ctx = bot.federation.createContext(
    new URL(origin),
    undefined,
  ) as MockContext;
  ctx.sentActivities = [];
  ctx.sendActivity = (_, recipients, activity) => {
    ctx.sentActivities.push({
      recipients: recipients === "followers"
        ? "followers"
        : Array.isArray(recipients)
        ? recipients
        : [recipients],
      activity,
    });
    return Promise.resolve();
  };
  return ctx;
}
