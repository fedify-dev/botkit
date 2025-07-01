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
  Question,
  type Recipient,
  Undo,
} from "@fedify/fedify/vocab";
import assert from "node:assert";
import { describe, test } from "node:test";
import { BotImpl } from "./bot-impl.ts";
import { createMessage } from "./message-impl.ts";
import { MemoryRepository, type Uuid } from "./repository.ts";
import { SessionImpl } from "./session-impl.ts";
import { mention, text } from "./text.ts";

test("SessionImpl.follow()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  await t.test("follow", async () => {
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    });
    await session.follow(actor);
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, [actor]);
    assert.ok(activity instanceof Follow);
    const parsed = ctx.parseUri(activity.id);
    assert.deepStrictEqual(parsed?.type, "object");
    assert.ok(parsed?.type === "object");
    assert.deepStrictEqual(parsed.class, Follow);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.objectId, actor.id);
    assert.deepStrictEqual(activity.toIds, [actor.id]);
    const follow = await repository.getSentFollow(parsed.values.id as Uuid);
    assert.ok(follow != null);
    assert.deepStrictEqual(
      await follow.toJsonLd({ format: "compact" }),
      await activity.toJsonLd({ format: "compact" }),
    );
  });

  await t.test("follow again", async () => {
    ctx.sentActivities = [];
    await repository.addFollowee(
      new URL("https://example.com/ap/actor/alice"),
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/4114eadb-2596-408f-ad99-06f467c9ace0",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new URL("https://example.com/ap/actor/alice"),
      }),
    );
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/alice"),
      preferredUsername: "alice",
    });
    await session.follow(actor);
    assert.deepStrictEqual(ctx.sentActivities, []);
  });

  await t.test("follow bot itself", async () => {
    ctx.sentActivities = [];
    await assert.rejects(
      () => session.follow(session.actorId.href),
      TypeError,
      "The bot cannot follow itself.",
    );
    assert.deepStrictEqual(ctx.sentActivities, []);

    await assert.rejects(
      () => session.follow(session.actorId),
      TypeError,
      "The bot cannot follow itself.",
    );
    assert.deepStrictEqual(ctx.sentActivities, []);

    await assert.rejects(
      () => session.follow(session.actorHandle),
      TypeError,
      "The bot cannot follow itself.",
    );
    assert.deepStrictEqual(ctx.sentActivities, []);

    const actor = await session.getActor();
    await assert.rejects(
      () => session.follow(actor),
      TypeError,
      "The bot cannot follow itself.",
    );
    assert.deepStrictEqual(ctx.sentActivities, []);
  });
});

test("SessionImpl.unfollow()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  await t.test("unfollow", async () => {
    await repository.addFollowee(
      new URL("https://example.com/ap/actor/alice"),
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/4114eadb-2596-408f-ad99-06f467c9ace0",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new URL("https://example.com/ap/actor/alice"),
      }),
    );
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/alice"),
      preferredUsername: "alice",
    });
    await session.unfollow(actor);
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, [actor]);
    assert.ok(activity instanceof Undo);
    const object = await activity.getObject(ctx);
    assert.ok(object instanceof Follow);
    assert.deepStrictEqual(
      object.id,
      new URL(
        "https://example.com/ap/follow/4114eadb-2596-408f-ad99-06f467c9ace0",
      ),
    );
    assert.deepStrictEqual(object.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(
      await repository.getFollowee(
        new URL("https://example.com/ap/actor/alice"),
      ),
      undefined,
    );
  });

  await t.test("unfollow again", async () => {
    ctx.sentActivities = [];
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/alice"),
      preferredUsername: "alice",
    });
    await session.unfollow(actor);
    assert.deepStrictEqual(ctx.sentActivities, []);
  });

  await t.test("unfollow bot itself", async () => {
    ctx.sentActivities = [];
    await assert.rejects(
      () => session.unfollow(session.actorId.href),
      TypeError,
      "The bot cannot unfollow itself.",
    );
    assert.deepStrictEqual(ctx.sentActivities, []);

    await assert.rejects(
      () => session.unfollow(session.actorId),
      TypeError,
      "The bot cannot unfollow itself.",
    );
    assert.deepStrictEqual(ctx.sentActivities, []);

    await assert.rejects(
      () => session.unfollow(session.actorHandle),
      TypeError,
      "The bot cannot unfollow itself.",
    );
    assert.deepStrictEqual(ctx.sentActivities, []);

    const actor = await session.getActor();
    await assert.rejects(
      () => session.unfollow(actor),
      TypeError,
      "The bot cannot unfollow itself.",
    );
    assert.deepStrictEqual(ctx.sentActivities, []);
  });
});

describe("SessionImpl.follows()", () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  test("when it follows", async () => {
    const followeeId = new URL("https://example.com/ap/actor/alice");
    const followee = new Person({
      id: followeeId,
      preferredUsername: "alice",
    });
    await repository.addFollowee(
      new URL("https://example.com/ap/actor/alice"),
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/4114eadb-2596-408f-ad99-06f467c9ace0",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: followee,
      }),
    );
    assert.ok(await session.follows(followeeId.href));
    assert.ok(await session.follows(followeeId));
    assert.ok(await session.follows(followee));
  });

  test("when it does not follow", async () => {
    const actorId = new URL("https://example.com/ap/actor/john");
    const actor = new Person({
      id: actorId,
      preferredUsername: "john",
    });
    assert.deepStrictEqual(await session.follows(actorId.href), false);
    assert.deepStrictEqual(await session.follows(actorId), false);
    assert.deepStrictEqual(await session.follows(actor), false);
  });

  test("bot itself", async () => {
    assert.deepStrictEqual(await session.follows(session.actorId.href), false);
    assert.deepStrictEqual(await session.follows(session.actorId), false);
    assert.deepStrictEqual(
      await session.follows(await session.getActor()),
      false,
    );
    assert.deepStrictEqual(await session.follows(session.actorHandle), false);
  });
});

test("SessionImpl.publish()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  await t.test("public", async () => {
    ctx.sentActivities = [];
    const publicMsg = await session.publish(text`Hello, world!`);
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Create);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.toIds, [PUBLIC_COLLECTION]);
    assert.deepStrictEqual(activity.ccIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    const object = await activity.getObject(ctx);
    assert.ok(object instanceof Note);
    assert.deepStrictEqual(
      object.attributionId,
      ctx.getActorUri(bot.identifier),
    );
    assert.deepStrictEqual(object.toIds, [PUBLIC_COLLECTION]);
    assert.deepStrictEqual(object.ccIds, [ctx.getFollowersUri(bot.identifier)]);
    assert.deepStrictEqual(object.content, "<p>Hello, world!</p>");
    assert.deepStrictEqual(object.tagIds, []);
    assert.deepStrictEqual(publicMsg.id, object.id);
    assert.deepStrictEqual(publicMsg.text, "Hello, world!");
    assert.deepStrictEqual(publicMsg.html, "<p>Hello, world!</p>");
    assert.deepStrictEqual(publicMsg.visibility, "public");
    assert.deepStrictEqual(publicMsg.mentions, []);
  });

  await t.test("unlisted", async () => {
    ctx.sentActivities = [];
    const unlistedMsg = await session.publish(text`Hello!`, {
      visibility: "unlisted",
    });
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Create);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.toIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    assert.deepStrictEqual(activity.ccIds, [PUBLIC_COLLECTION]);
    const object = await activity.getObject(ctx);
    assert.ok(object instanceof Note);
    assert.deepStrictEqual(
      object.attributionId,
      ctx.getActorUri(bot.identifier),
    );
    assert.deepStrictEqual(object.toIds, [ctx.getFollowersUri(bot.identifier)]);
    assert.deepStrictEqual(object.ccIds, [PUBLIC_COLLECTION]);
    assert.deepStrictEqual(object.content, "<p>Hello!</p>");
    assert.deepStrictEqual(object.tagIds, []);
    assert.deepStrictEqual(unlistedMsg.id, object.id);
    assert.deepStrictEqual(unlistedMsg.text, "Hello!");
    assert.deepStrictEqual(unlistedMsg.html, "<p>Hello!</p>");
    assert.deepStrictEqual(unlistedMsg.visibility, "unlisted");
    assert.deepStrictEqual(unlistedMsg.mentions, []);
  });

  await t.test("followers", async () => {
    ctx.sentActivities = [];
    const followersMsg = await session.publish(text`Hi!`, {
      visibility: "followers",
    });
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Create);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.toIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    assert.deepStrictEqual(activity.ccIds, []);
    const object = await activity.getObject(ctx);
    assert.ok(object instanceof Note);
    assert.deepStrictEqual(
      object.attributionId,
      ctx.getActorUri(bot.identifier),
    );
    assert.deepStrictEqual(object.toIds, [ctx.getFollowersUri(bot.identifier)]);
    assert.deepStrictEqual(object.ccIds, []);
    assert.deepStrictEqual(object.content, "<p>Hi!</p>");
    assert.deepStrictEqual(object.tagIds, []);
    assert.deepStrictEqual(followersMsg.id, object.id);
    assert.deepStrictEqual(followersMsg.text, "Hi!");
    assert.deepStrictEqual(followersMsg.html, "<p>Hi!</p>");
    assert.deepStrictEqual(followersMsg.visibility, "followers");
    assert.deepStrictEqual(followersMsg.mentions, []);
  });

  await t.test("direct", async () => {
    const mentioned = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    });
    ctx.sentActivities = [];
    const directMsg = await session.publish(
      text`Hey ${mention(mentioned)}!`,
      { visibility: "direct" },
    );
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, [mentioned]);
    assert.ok(activity instanceof Create);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.toIds, [mentioned.id]);
    assert.deepStrictEqual(activity.ccIds, []);
    const object = await activity.getObject(ctx);
    assert.ok(object instanceof Note);
    assert.deepStrictEqual(
      object.attributionId,
      ctx.getActorUri(bot.identifier),
    );
    assert.deepStrictEqual(object.toIds, [mentioned.id]);
    assert.deepStrictEqual(object.ccIds, []);
    assert.deepStrictEqual(
      object.content,
      '<p>Hey <a href="https://example.com/ap/actor/john" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>john@example.com' +
        "</span></a>!</p>",
    );
    const tags = await Array.fromAsync(object.getTags());
    assert.deepStrictEqual(tags.length, 1);
    assert.deepStrictEqual(directMsg.id, object.id);
    assert.deepStrictEqual(directMsg.text, "Hey @john@example.com!");
    assert.deepStrictEqual(directMsg.html, object.content);
    assert.deepStrictEqual(directMsg.visibility, "direct");
    // assert.deepStrictEqual(directMsg.mentions, [mentioned]); // FIXME
  });

  await t.test("quote", async () => {
    const originalAuthor = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    });
    const originalPost = new Note({
      id: new URL(
        "https://example.com/ap/note/c1c792ce-a0be-4685-b396-e59e5ef8c788",
      ),
      content: "<p>Hello, world!</p>",
      attribution: originalAuthor,
      to: new URL("https://example.com/ap/actor/john/followers"),
      cc: PUBLIC_COLLECTION,
    });
    const originalMsg = await createMessage<Note, void>(
      originalPost,
      session,
      {},
    );
    ctx.sentActivities = [];
    const quote = await session.publish(text`Check this out!`, {
      quoteTarget: originalMsg,
    });
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Create);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.toIds, [PUBLIC_COLLECTION]);
    assert.deepStrictEqual(activity.ccIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    const object = await activity.getObject(ctx);
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assert.deepStrictEqual(recipients2, [originalAuthor]);
    assert.ok(activity2 instanceof Create);
    assert.deepStrictEqual(activity2.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity2.toIds, [PUBLIC_COLLECTION]);
    assert.deepStrictEqual(activity2.ccIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    assert.ok(object instanceof Note);
    assert.deepStrictEqual(
      object.attributionId,
      ctx.getActorUri(bot.identifier),
    );
    assert.deepStrictEqual(object.toIds, [PUBLIC_COLLECTION]);
    assert.deepStrictEqual(object.ccIds, [ctx.getFollowersUri(bot.identifier)]);
    assert.deepStrictEqual(
      object.content,
      `<p>Check this out!</p>

<p class="quote-inline"><br>RE: <a href="${originalMsg.id.href}">${originalMsg.id.href}</a></p>`,
    );
    assert.deepStrictEqual(object.quoteUrl, originalMsg.id);
    assert.deepStrictEqual(quote.id, object.id);
    assert.deepStrictEqual(
      quote.text,
      `Check this out!\n\nRE: ${originalMsg.id.href}`,
    );
    assert.deepStrictEqual(
      quote.html,
      `<p>Check this out!</p>

<p><br>RE: <a href="${originalMsg.id.href}">${originalMsg.id.href}</a></p>`,
    );
    assert.deepStrictEqual(quote.visibility, "public");
    assert.deepStrictEqual(quote.quoteTarget?.id, originalMsg.id);
  });

  await t.test("poll single choice", async () => {
    ctx.sentActivities = [];
    const endTime = Temporal.Now.instant().add({ hours: 24 });
    const poll = await session.publish(text`What's your favorite color?`, {
      class: Question,
      poll: {
        multiple: false,
        options: ["Red", "Blue", "Green"],
        endTime,
      },
    });
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Create);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.toIds, [PUBLIC_COLLECTION]);
    assert.deepStrictEqual(activity.ccIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    const object = await activity.getObject(ctx);
    assert.ok(object instanceof Question);
    assert.deepStrictEqual(
      object.attributionId,
      ctx.getActorUri(bot.identifier),
    );
    assert.deepStrictEqual(object.toIds, [PUBLIC_COLLECTION]);
    assert.deepStrictEqual(object.ccIds, [ctx.getFollowersUri(bot.identifier)]);
    assert.deepStrictEqual(
      object.content,
      "<p>What&apos;s your favorite color?</p>",
    );
    assert.deepStrictEqual(object.endTime, endTime);
    assert.deepStrictEqual(object.voters, 0);
    assert.deepStrictEqual(object.inclusiveOptionIds, []);

    const exclusiveOptions = await Array.fromAsync(
      object.getExclusiveOptions(ctx),
    );
    assert.deepStrictEqual(exclusiveOptions.length, 3);
    assert.ok(exclusiveOptions[0] instanceof Note);
    assert.deepStrictEqual(exclusiveOptions[0].name?.toString(), "Red");
    assert.ok(exclusiveOptions[1] instanceof Note);
    assert.deepStrictEqual(exclusiveOptions[1].name?.toString(), "Blue");
    assert.ok(exclusiveOptions[2] instanceof Note);
    assert.deepStrictEqual(exclusiveOptions[2].name?.toString(), "Green");

    for (const option of exclusiveOptions) {
      const replies = await option.getReplies(ctx);
      assert.deepStrictEqual(replies?.totalItems, 0);
    }

    assert.deepStrictEqual(poll.id, object.id);
    assert.deepStrictEqual(poll.text, "What's your favorite color?");
    assert.deepStrictEqual(
      poll.html,
      "<p>What&apos;s your favorite color?</p>",
    );
    assert.deepStrictEqual(poll.visibility, "public");
  });

  await t.test("poll multiple choice", async () => {
    ctx.sentActivities = [];
    const endTime = Temporal.Now.instant().add({ hours: 24 * 7 });
    const poll = await session.publish(
      text`Which programming languages do you know?`,
      {
        class: Question,
        poll: {
          multiple: true,
          options: ["JavaScript", "TypeScript", "Python", "Rust"],
          endTime,
        },
        visibility: "unlisted",
      },
    );
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Create);
    const object = await activity.getObject(ctx);
    assert.ok(object instanceof Question);
    assert.deepStrictEqual(object.endTime, endTime);
    assert.deepStrictEqual(object.voters, 0);
    assert.deepStrictEqual(object.exclusiveOptionIds, []);

    const inclusiveOptions = await Array.fromAsync(
      object.getInclusiveOptions(ctx),
    );
    assert.deepStrictEqual(inclusiveOptions.length, 4);
    assert.ok(inclusiveOptions[0] instanceof Note);
    assert.deepStrictEqual(inclusiveOptions[0].name?.toString(), "JavaScript");
    assert.ok(inclusiveOptions[1] instanceof Note);
    assert.deepStrictEqual(inclusiveOptions[1].name?.toString(), "TypeScript");
    assert.ok(inclusiveOptions[2] instanceof Note);
    assert.deepStrictEqual(inclusiveOptions[2].name?.toString(), "Python");
    assert.ok(inclusiveOptions[3] instanceof Note);
    assert.deepStrictEqual(inclusiveOptions[3].name?.toString(), "Rust");

    assert.deepStrictEqual(poll.visibility, "unlisted");
    assert.deepStrictEqual(activity.toIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    assert.deepStrictEqual(activity.ccIds, [PUBLIC_COLLECTION]);
  });

  await t.test("poll with direct visibility", async () => {
    const mentioned = new Person({
      id: new URL("https://example.com/ap/actor/alice"),
      preferredUsername: "alice",
    });
    ctx.sentActivities = [];
    const endTime = Temporal.Now.instant().add({ hours: 12 });
    const poll = await session.publish(
      text`Hey ${mention(mentioned)}, what do you think?`,
      {
        class: Question,
        poll: {
          multiple: false,
          options: ["Good", "Bad", "Neutral"],
          endTime,
        },
        visibility: "direct",
      },
    );
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, [mentioned]);
    assert.ok(activity instanceof Create);
    const object = await activity.getObject(ctx);
    assert.ok(object instanceof Question);
    assert.deepStrictEqual(object.toIds, [mentioned.id]);
    assert.deepStrictEqual(object.ccIds, []);
    assert.deepStrictEqual(poll.visibility, "direct");
  });

  await t.test("poll end-to-end workflow", async () => {
    // Create fresh repository and session for isolation
    const freshRepository = new MemoryRepository();
    const freshBot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository: freshRepository,
      username: "testbot",
    });
    const freshCtx = createMockContext(freshBot, "https://example.com");
    const freshSession = new SessionImpl(freshBot, freshCtx);

    const endTime = Temporal.Now.instant().add({ hours: 1 });

    // 1. Create a poll
    const poll = await freshSession.publish(
      text`What should we have for lunch?`,
      {
        class: Question,
        poll: {
          multiple: false,
          options: ["Pizza", "Burgers", "Salad"],
          endTime,
        },
      },
    );

    // Verify poll was created correctly
    assert.deepStrictEqual(freshCtx.sentActivities.length, 1);
    const { activity: createActivity } = freshCtx.sentActivities[0];
    assert.ok(createActivity instanceof Create);
    const pollObject = await createActivity.getObject(freshCtx);
    assert.ok(pollObject instanceof Question);
    assert.deepStrictEqual(pollObject.endTime, endTime);

    // Get poll options
    const options = await Array.fromAsync(
      pollObject.getExclusiveOptions(freshCtx),
    );
    assert.deepStrictEqual(options.length, 3);
    assert.deepStrictEqual(options[0].name?.toString(), "Pizza");
    assert.deepStrictEqual(options[1].name?.toString(), "Burgers");
    assert.deepStrictEqual(options[2].name?.toString(), "Salad");

    // 2. Verify poll is accessible via getOutbox
    const outbox = freshSession.getOutbox({ order: "newest" });
    const messages = await Array.fromAsync(outbox);
    assert.deepStrictEqual(messages.length, 1);
    assert.deepStrictEqual(messages[0].id, poll.id);
    assert.deepStrictEqual(messages[0].text, "What should we have for lunch?");

    // 3. Verify poll structure
    assert.deepStrictEqual(poll.visibility, "public");
    assert.deepStrictEqual(poll.mentions, []);
  });
});

test("SessionImpl.getOutbox()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);

  const messageA = new Create({
    id: new URL(
      "https://example.com/ap/create/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
    ),
    actor: new URL("https://example.com/ap/actor/bot"),
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
    object: new Note({
      id: new URL(
        "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      ),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/bot/followers"),
      cc: PUBLIC_COLLECTION,
      content: "Hello, world!",
      published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
    }),
    published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
  });
  const messageB = new Create({
    id: new URL(
      "https://example.com/ap/create/0194244f-d800-7873-8993-ef71ccd47306",
    ),
    actor: new URL("https://example.com/ap/actor/bot"),
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
    object: new Note({
      id: new URL(
        "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
      ),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/bot/followers"),
      cc: PUBLIC_COLLECTION,
      content: "Hello, world!",
      published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
    }),
    published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
  });
  const messageC = new Create({
    id: new URL(
      "https://example.com/ap/create/01942976-3400-7f34-872e-2cbf0f9eeac4",
    ),
    actor: new URL("https://example.com/ap/actor/bot"),
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
    object: new Note({
      id: new URL(
        "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
      ),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/bot/followers"),
      cc: PUBLIC_COLLECTION,
      content: "Hello, world!",
      published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
    }),
    published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
  });
  const messageD = new Create({
    id: new URL(
      "https://example.com/ap/create/01942e9c-9000-7480-a553-7a6ce737ce14",
    ),
    actor: new URL("https://example.com/ap/actor/bot"),
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
    object: new Note({
      id: new URL(
        "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
      ),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/bot/followers"),
      cc: PUBLIC_COLLECTION,
      content: "Hello, world!",
      published: Temporal.Instant.from("2025-01-04T00:00:00Z"),
    }),
    published: Temporal.Instant.from("2025-01-04T00:00:00Z"),
  });
  await repository.addMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0", messageA);
  await repository.addMessage("0194244f-d800-7873-8993-ef71ccd47306", messageB);
  await repository.addMessage("01942976-3400-7f34-872e-2cbf0f9eeac4", messageC);
  await repository.addMessage("01942e9c-9000-7480-a553-7a6ce737ce14", messageD);

  await t.test("default", async () => {
    const outbox = session.getOutbox({ order: "oldest" });
    const messages = await Array.fromAsync(outbox);
    assert.deepStrictEqual(messages.length, 4);

    assert.deepStrictEqual(
      messages[0].id.href,
      "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
    );
    assert.deepStrictEqual(
      messages[0].actor.id?.href,
      "https://example.com/ap/actor/bot",
    );
    assert.deepStrictEqual(messages[0].visibility, "unlisted");
    assert.deepStrictEqual(messages[0].text, "Hello, world!");
    assert.deepStrictEqual(
      messages[0].published,
      Temporal.Instant.from("2025-01-01T00:00:00Z"),
    );

    assert.deepStrictEqual(
      messages[1].id.href,
      "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
    );
    assert.deepStrictEqual(
      messages[1].actor.id?.href,
      "https://example.com/ap/actor/bot",
    );
    assert.deepStrictEqual(messages[1].visibility, "unlisted");
    assert.deepStrictEqual(messages[1].text, "Hello, world!");
    assert.deepStrictEqual(
      messages[1].published,
      Temporal.Instant.from("2025-01-02T00:00:00Z"),
    );

    assert.deepStrictEqual(
      messages[2].id.href,
      "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
    );
    assert.deepStrictEqual(
      messages[2].actor.id?.href,
      "https://example.com/ap/actor/bot",
    );
    assert.deepStrictEqual(messages[2].visibility, "unlisted");
    assert.deepStrictEqual(messages[2].text, "Hello, world!");
    assert.deepStrictEqual(
      messages[2].published,
      Temporal.Instant.from("2025-01-03T00:00:00Z"),
    );

    assert.deepStrictEqual(
      messages[3].id.href,
      "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
    );
    assert.deepStrictEqual(
      messages[3].actor.id?.href,
      "https://example.com/ap/actor/bot",
    );
    assert.deepStrictEqual(messages[3].visibility, "unlisted");
    assert.deepStrictEqual(messages[3].text, "Hello, world!");
    assert.deepStrictEqual(
      messages[3].published,
      Temporal.Instant.from("2025-01-04T00:00:00Z"),
    );
  });

  await t.test("order: 'oldest'", async () => {
    const outbox = session.getOutbox({ order: "oldest" });
    const messages = await Array.fromAsync(outbox);
    const messageIds = messages.map((msg) => msg.id.href);
    assert.deepStrictEqual(messageIds, [
      "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
      "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
      "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
    ]);
  });

  await t.test("order: 'newest'", async () => {
    const outbox = session.getOutbox({ order: "newest" });
    const messages = await Array.fromAsync(outbox);
    const messageIds = messages.map((msg) => msg.id.href);
    assert.deepStrictEqual(messageIds, [
      "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
      "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
      "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
      "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
    ]);
  });

  await t.test("since", async () => {
    const outbox = session.getOutbox({
      since: Temporal.Instant.from("2025-01-03T00:00:00Z"),
    });
    const messages = await Array.fromAsync(outbox);
    const messageIds = messages.map((msg) => msg.id.href);
    assert.deepStrictEqual(messageIds, [
      "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
      "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
    ]);
  });

  await t.test("until", async () => {
    const outbox = session.getOutbox({
      until: Temporal.Instant.from("2025-01-02T00:00:00Z"),
    });
    const messages = await Array.fromAsync(outbox);
    const messageIds = messages.map((msg) => msg.id.href);
    assert.deepStrictEqual(messageIds, [
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
