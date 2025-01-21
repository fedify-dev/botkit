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

Deno.test("SessionImpl.getOutbox()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  await kv.set(
    [...bot.kvPrefixes.messages, "01941f29-7c00-7fe8-ab0a-7b593990a3c0"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Create",
      id: "https://example.com/ap/create/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      actor: "https://example.com/ap/actor/bot",
      to: ["https://example.com/ap/actor/bot/followers"],
      cc: ["https://www.w3.org/ns/activitystreams#Public"],
      object: {
        type: "Note",
        id: "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        attributedTo: "https://example.com/ap/actor/bot",
        to: ["https://example.com/ap/actor/bot/followers"],
        cc: ["https://www.w3.org/ns/activitystreams#Public"],
        content: "Hello, world!",
        published: "2025-01-01T00:00:00Z",
      },
      published: "2025-01-01T00:00:00Z",
    },
  );
  await kv.set(
    [...bot.kvPrefixes.messages, "0194244f-d800-7873-8993-ef71ccd47306"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Create",
      id: "https://example.com/ap/create/0194244f-d800-7873-8993-ef71ccd47306",
      actor: "https://example.com/ap/actor/bot",
      to: ["https://example.com/ap/actor/bot/followers"],
      cc: ["https://www.w3.org/ns/activitystreams#Public"],
      object: {
        type: "Note",
        id: "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
        attributedTo: "https://example.com/ap/actor/bot",
        to: ["https://example.com/ap/actor/bot/followers"],
        cc: ["https://www.w3.org/ns/activitystreams#Public"],
        content: "Hello, world!",
        published: "2025-01-02T00:00:00Z",
      },
      published: "2025-01-02T00:00:00Z",
    },
  );
  await kv.set(
    [...bot.kvPrefixes.messages, "01942976-3400-7f34-872e-2cbf0f9eeac4"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Create",
      id: "https://example.com/ap/create/01942976-3400-7f34-872e-2cbf0f9eeac4",
      actor: "https://example.com/ap/actor/bot",
      to: ["https://example.com/ap/actor/bot/followers"],
      cc: ["https://www.w3.org/ns/activitystreams#Public"],
      object: {
        type: "Note",
        id: "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
        attributedTo: "https://example.com/ap/actor/bot",
        to: ["https://example.com/ap/actor/bot/followers"],
        cc: ["https://www.w3.org/ns/activitystreams#Public"],
        content: "Hello, world!",
        published: "2025-01-03T00:00:00Z",
      },
      published: "2025-01-03T00:00:00Z",
    },
  );
  await kv.set(
    [...bot.kvPrefixes.messages, "01942e9c-9000-7480-a553-7a6ce737ce14"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Create",
      id: "https://example.com/ap/create/01942e9c-9000-7480-a553-7a6ce737ce14",
      actor: "https://example.com/ap/actor/bot",
      to: ["https://example.com/ap/actor/bot/followers"],
      cc: ["https://www.w3.org/ns/activitystreams#Public"],
      object: {
        type: "Note",
        id: "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
        attributedTo: "https://example.com/ap/actor/bot",
        to: ["https://example.com/ap/actor/bot/followers"],
        cc: ["https://www.w3.org/ns/activitystreams#Public"],
        content: "Hello, world!",
        published: "2025-01-04T00:00:00Z",
      },
      published: "2025-01-04T00:00:00Z",
    },
  );
  await kv.set(
    bot.kvPrefixes.messages,
    [
      "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      "0194244f-d800-7873-8993-ef71ccd47306",
      "01942976-3400-7f34-872e-2cbf0f9eeac4",
      "01942e9c-9000-7480-a553-7a6ce737ce14",
    ],
  );

  await t.step("default", async () => {
    const outbox = session.getOutbox({ order: "oldest" });
    const messages = await Array.fromAsync(outbox);
    assertEquals(messages.length, 4);

    assertEquals(
      messages[0].id.href,
      "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
    );
    assertEquals(
      messages[0].actor.id?.href,
      "https://example.com/ap/actor/bot",
    );
    assertEquals(messages[0].visibility, "unlisted");
    assertEquals(messages[0].text, "Hello, world!");
    assertEquals(
      messages[0].published,
      Temporal.Instant.from("2025-01-01T00:00:00Z"),
    );

    assertEquals(
      messages[1].id.href,
      "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
    );
    assertEquals(
      messages[1].actor.id?.href,
      "https://example.com/ap/actor/bot",
    );
    assertEquals(messages[1].visibility, "unlisted");
    assertEquals(messages[1].text, "Hello, world!");
    assertEquals(
      messages[1].published,
      Temporal.Instant.from("2025-01-02T00:00:00Z"),
    );

    assertEquals(
      messages[2].id.href,
      "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
    );
    assertEquals(
      messages[2].actor.id?.href,
      "https://example.com/ap/actor/bot",
    );
    assertEquals(messages[2].visibility, "unlisted");
    assertEquals(messages[2].text, "Hello, world!");
    assertEquals(
      messages[2].published,
      Temporal.Instant.from("2025-01-03T00:00:00Z"),
    );

    assertEquals(
      messages[3].id.href,
      "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
    );
    assertEquals(
      messages[3].actor.id?.href,
      "https://example.com/ap/actor/bot",
    );
    assertEquals(messages[3].visibility, "unlisted");
    assertEquals(messages[3].text, "Hello, world!");
    assertEquals(
      messages[3].published,
      Temporal.Instant.from("2025-01-04T00:00:00Z"),
    );
  });

  await t.step("order: 'oldest'", async () => {
    const outbox = session.getOutbox({ order: "oldest" });
    const messages = await Array.fromAsync(outbox);
    const messageIds = messages.map((msg) => msg.id.href);
    assertEquals(messageIds, [
      "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
      "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
      "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
    ]);
  });

  await t.step("order: 'newest'", async () => {
    const outbox = session.getOutbox({ order: "newest" });
    const messages = await Array.fromAsync(outbox);
    const messageIds = messages.map((msg) => msg.id.href);
    assertEquals(messageIds, [
      "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
      "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
      "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
      "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
    ]);
  });

  await t.step("since", async () => {
    const outbox = session.getOutbox({
      since: Temporal.Instant.from("2025-01-03T00:00:00Z"),
    });
    const messages = await Array.fromAsync(outbox);
    const messageIds = messages.map((msg) => msg.id.href);
    assertEquals(messageIds, [
      "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
      "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
    ]);
  });

  await t.step("until", async () => {
    const outbox = session.getOutbox({
      until: Temporal.Instant.from("2025-01-02T00:00:00Z"),
    });
    const messages = await Array.fromAsync(outbox);
    const messageIds = messages.map((msg) => msg.id.href);
    assertEquals(messageIds, [
      "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
      "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
    ]);
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
