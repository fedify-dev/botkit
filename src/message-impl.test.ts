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
import { MemoryKvStore } from "@fedify/fedify/federation";
import {
  Announce,
  Article,
  ChatMessage,
  Create,
  Delete,
  Emoji as CustomEmoji,
  EmojiReact,
  Hashtag,
  Image,
  Like as RawLike,
  Mention,
  Note,
  Person,
  PUBLIC_COLLECTION,
  Question,
  Tombstone,
  Undo,
  Update,
} from "@fedify/fedify/vocab";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertRejects } from "@std/assert/rejects";
import { BotImpl } from "./bot-impl.ts";
import { type DeferredCustomEmoji, isEmoji } from "./emoji.ts";
import {
  createMessage,
  getMessageClass,
  getMessageVisibility,
  isMessageObject,
} from "./message-impl.ts";
import { MemoryRepository } from "./repository.ts";
import { createMockContext } from "./session-impl.test.ts";
import { SessionImpl } from "./session-impl.ts";
import { text } from "./text.ts";

Deno.test("isMessageObject()", () => {
  assert(isMessageObject(new Article({})));
  assert(isMessageObject(new ChatMessage({})));
  assert(isMessageObject(new Note({})));
  assert(isMessageObject(new Question({})));
  assert(!isMessageObject(new Person({})));
});

Deno.test("getMessageClass()", () => {
  assertEquals(
    getMessageClass(new Article({})),
    Article,
  );
  assertEquals(
    getMessageClass(new ChatMessage({})),
    ChatMessage,
  );
  assertEquals(
    getMessageClass(new Note({})),
    Note,
  );
  assertEquals(
    getMessageClass(new Question({})),
    Question,
  );
});

Deno.test("createMessage()", async () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const session = bot.getSession("https://example.com", undefined);
  await assertRejects(
    () => createMessage<Note, void>(new Note({}), session, {}),
    TypeError,
    "The raw.id is required.",
  );
  await assertRejects(
    () =>
      createMessage<Note, void>(
        new Note({ id: new URL("https://example.com/notes/1") }),
        session,
        {},
      ),
    TypeError,
    "The raw.content is required.",
  );
  await assertRejects(
    () =>
      createMessage<Note, void>(
        new Note({
          id: new URL("https://example.com/notes/1"),
          content: "<p>Hello, world!</p>",
        }),
        session,
        {},
      ),
    TypeError,
    "The raw.attributionId is required.",
  );

  const publicNote = new Note({
    id: new URL("https://example.com/notes/1"),
    content: "<p>#Hello, <em>world</em>!</p>",
    attribution: new URL("https://example.com/ap/actor/bot"),
    to: PUBLIC_COLLECTION,
    cc: new URL("https://example.com/ap/actor/bot/followers"),
    tags: [
      new Mention({
        name: "@bot",
        href: new URL("https://example.com/ap/actor/bot"),
      }),
      new Hashtag({
        name: "#Hello",
        href: new URL("https://example.com/tags/hello"),
      }),
    ],
  });
  const publicMessage = await createMessage<Note, void>(
    publicNote,
    session,
    {},
  );
  assertEquals(publicMessage.raw, publicNote);
  assertEquals(publicMessage.id, publicNote.id);
  assertEquals(publicMessage.actor, await session.getActor());
  assertEquals(publicMessage.visibility, "public");
  assertEquals(publicMessage.language, undefined);
  assertEquals(publicMessage.text, "#Hello, world!");
  assertEquals(publicMessage.html, "<p>#Hello, <em>world</em>!</p>");
  assertEquals(publicMessage.replyTarget, undefined);
  assertEquals(publicMessage.mentions, [await session.getActor()]);
  assertEquals(publicMessage.hashtags, [
    new Hashtag({
      name: "#Hello",
      href: new URL("https://example.com/tags/hello"),
    }),
  ]);
  assertEquals(publicMessage.attachments, []);
  assertEquals(publicMessage.published, undefined);
  assertEquals(publicMessage.updated, undefined);

  const unlistedNote = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
  });
  const unlistedMessage = await createMessage<Note, void>(
    unlistedNote,
    session,
    {},
  );
  assertEquals(unlistedMessage.visibility, "unlisted");

  const followersNote = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot/followers"),
    ccs: [],
  });
  const followersMessage = await createMessage<Note, void>(
    followersNote,
    session,
    {},
  );
  assertEquals(followersMessage.visibility, "followers");

  const direct = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot"),
    ccs: [],
  });
  const directMessage = await createMessage<Note, void>(direct, session, {});
  assertEquals(directMessage.visibility, "direct");

  const unknown = publicNote.clone({
    tos: [],
    ccs: [],
  });
  const unknownMessage = await createMessage<Note, void>(unknown, session, {});
  assertEquals(unknownMessage.visibility, "unknown");
});

Deno.test("AuthorizedMessageImpl.delete()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);
  const note = new Note({
    id: new URL(
      "https://example.com/ap/note/c1c792ce-a0be-4685-b396-e59e5ef8c788",
    ),
    content: "<p>Hello, world!</p>",
    attribution: new URL("https://example.com/ap/actor/bot"),
    to: PUBLIC_COLLECTION,
    cc: new URL("https://example.com/ap/actor/bot/followers"),
  });
  const msg = await createMessage<Note, void>(
    note,
    session,
    {},
    undefined,
    true,
  );
  await repository.addMessage(
    "c1c792ce-a0be-4685-b396-e59e5ef8c788",
    new Create({
      id: new URL(
        "https://example.com/ap/create/c1c792ce-a0be-4685-b396-e59e5ef8c788",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: note,
    }),
  );
  await msg.delete();
  assertEquals(await repository.countMessages(), 0);
  assertEquals(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assertEquals(recipients, "followers");
  assertInstanceOf(activity, Delete);
  assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
  assertEquals(activity.toIds, [PUBLIC_COLLECTION]);
  assertEquals(activity.ccIds, [ctx.getFollowersUri(bot.identifier)]);
  const tombstone = await activity.getObject();
  assertInstanceOf(tombstone, Tombstone);
  assertEquals(tombstone.id, note.id);
});

Deno.test("MessageImpl.reply()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);
  const originalPost = new Note({
    id: new URL(
      "https://example.com/ap/note/c1c792ce-a0be-4685-b396-e59e5ef8c788",
    ),
    content: "<p>Hello, world!</p>",
    attribution: new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    }),
    to: new URL("https://example.com/ap/actor/john/followers"),
    cc: PUBLIC_COLLECTION,
  });
  const originalMsg = await createMessage<Note, void>(
    originalPost,
    session,
    {},
  );
  const reply = await originalMsg.reply(text`Hello, John!`);
  assertEquals(await repository.countMessages(), 1);
  const [create] = await Array.fromAsync(repository.getMessages());
  assert(create != null);
  assertEquals(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assertEquals(recipients, "followers");
  assertInstanceOf(activity, Create);
  assertEquals(
    await activity.toJsonLd({ format: "compact" }),
    await create.toJsonLd({ format: "compact" }),
  );
  assertEquals(
    await reply.raw.toJsonLd({ format: "compact" }),
    await (await create.getObject())?.toJsonLd({ format: "compact" }),
  );
  assertEquals(reply.actor, await session.getActor());
  assertEquals(reply.replyTarget, originalMsg);
  assertEquals(reply.visibility, "unlisted");
});

Deno.test("MessageImpl.share()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);
  const originalPost = new Note({
    id: new URL(
      "https://example.com/ap/note/c1c792ce-a0be-4685-b396-e59e5ef8c788",
    ),
    content: "<p>Hello, world!</p>",
    attribution: new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    }),
    to: new URL("https://example.com/ap/actor/john/followers"),
    cc: PUBLIC_COLLECTION,
  });
  const originalMsg = await createMessage<Note, void>(
    originalPost,
    session,
    {},
  );
  const sharedMsg = await originalMsg.share();

  await t.step("share()", async () => {
    assertEquals(await repository.countMessages(), 1);
    const [announce] = await Array.fromAsync(repository.getMessages());
    assert(announce != null);
    assertEquals(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, "followers");
    assertInstanceOf(activity, Announce);
    assertEquals(activity.toIds, [ctx.getFollowersUri(bot.identifier)]);
    assertEquals(activity.ccIds, [
      PUBLIC_COLLECTION,
      originalPost.attributionId,
    ]);
    assertEquals(
      await activity.toJsonLd({ format: "compact" }),
      await announce.toJsonLd({ format: "compact" }),
    );
    assertEquals(
      await sharedMsg.raw.toJsonLd({ format: "compact" }),
      await announce.toJsonLd({ format: "compact" }),
    );
    assertEquals(sharedMsg.actor, await session.getActor());
    assertEquals(sharedMsg.visibility, "unlisted");
    assertEquals(sharedMsg.original, originalMsg);
  });

  ctx.sentActivities = [];

  await t.step("unshare()", async () => {
    await sharedMsg.unshare();
    assertEquals(await repository.countMessages(), 0);
    assertEquals(ctx.sentActivities.length, 1);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, "followers");
    assertInstanceOf(activity, Undo);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(activity.toIds, [ctx.getFollowersUri(bot.identifier)]);
    assertEquals(activity.ccIds, [
      PUBLIC_COLLECTION,
      originalPost.attributionId,
    ]);
    assertEquals(activity.objectId, sharedMsg.id);
  });
});

Deno.test("MessageImpl.like()", async (t) => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);
  const originalPost = new Note({
    id: new URL(
      "https://example.com/ap/note/c1c792ce-a0be-4685-b396-e59e5ef8c788",
    ),
    content: "<p>Hello, world!</p>",
    attribution: new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    }),
    to: new URL("https://example.com/ap/actor/john/followers"),
    cc: PUBLIC_COLLECTION,
  });
  const message = await createMessage<Note, void>(
    originalPost,
    session,
    {},
  );
  const like = await message.like();

  await t.step("like()", async () => {
    assertEquals(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, "followers");
    assertInstanceOf(activity, RawLike);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(activity.objectId, message.id);
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assertEquals(recipients2, [message.actor]);
    assertInstanceOf(activity2, RawLike);
    assertEquals(activity2, activity);
    assertEquals(like.actor, await session.getActor());
    assertEquals(like.raw, activity);
    assertEquals(like.id, activity.id);
    assertEquals(like.message, message);
  });

  ctx.sentActivities = [];

  await t.step("unlike()", async () => {
    await like.unlike();
    assertEquals(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, "followers");
    assertInstanceOf(activity, Undo);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    const object = await activity.getObject();
    assertInstanceOf(object, RawLike);
    assertEquals(object.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(object.objectId, message.id);
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assertEquals(recipients2, [message.actor]);
    assertInstanceOf(activity2, Undo);
    assertEquals(activity2, activity);
  });
});

Deno.test("AuthorizedMessage.update()", async (t) => {
  const actorA = new Person({
    id: new URL("https://example.com/ap/actor/john"),
    preferredUsername: "john",
  });
  const actorB = new Person({
    id: new URL("https://example.com/ap/actor/jane"),
    preferredUsername: "jane",
  });

  for (
    const visibility of ["public", "unlisted", "followers", "direct"] as const
  ) {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);

    await t.step(visibility, async () => {
      const msg = await session.publish(text`Hello, ${actorA}`, { visibility });
      assertEquals(await repository.countMessages(), 1);
      const originalRaw = msg.raw;
      ctx.sentActivities = [];
      const before = Temporal.Now.instant();
      await msg.update(text`Hello, ${actorB}`);
      const after = Temporal.Now.instant();
      assertEquals(msg.text, "Hello, @jane@example.com");
      assertEquals(
        msg.html,
        '<p>Hello, <a href="https://example.com/ap/actor/jane" ' +
          'translate="no" class="h-card u-url mention" target="_blank">' +
          "@<span>jane@example.com</span></a></p>",
      );
      assertEquals(msg.mentions.length, 1);
      assertEquals(msg.mentions[0].id, actorB.id);
      assertEquals(msg.hashtags, []);
      assert(msg.updated != null);
      assert(msg.updated.epochNanoseconds >= before.epochNanoseconds);
      assert(msg.updated.epochNanoseconds <= after.epochNanoseconds);
      assertEquals(msg.raw.content, msg.html);
      if (visibility === "public") {
        assertEquals(msg.raw.toIds, [PUBLIC_COLLECTION, actorB.id]);
        assertEquals(msg.raw.ccIds, [ctx.getFollowersUri(bot.identifier)]);
      } else if (visibility === "unlisted") {
        assertEquals(msg.raw.toIds, [
          ctx.getFollowersUri(bot.identifier),
          actorB.id,
        ]);
        assertEquals(msg.raw.ccIds, [PUBLIC_COLLECTION]);
      } else if (visibility === "followers") {
        assertEquals(msg.raw.toIds, [
          ctx.getFollowersUri(bot.identifier),
          actorB.id,
        ]);
        assertEquals(msg.raw.ccIds, []);
      } else {
        assertEquals(msg.raw.toIds, [actorB.id]);
        assertEquals(msg.raw.ccIds, []);
      }
      const tags = await Array.fromAsync(msg.raw.getTags());
      assertEquals(tags.length, 1);
      assertInstanceOf(tags[0], Mention);
      assertEquals(tags[0].name, "@jane@example.com");
      assertEquals(tags[0].href, actorB.id);
      assertEquals(msg.raw.published, originalRaw.published);
      assertEquals(msg.raw.updated, msg.updated);
      const [create] = await Array.fromAsync(repository.getMessages());
      assertEquals(
        await (await create.getObject())?.toJsonLd({ format: "compact" }),
        await msg.raw.toJsonLd({ format: "compact" }),
      );
      assertEquals(ctx.sentActivities.length, visibility === "direct" ? 1 : 2);
      const { recipients, activity } = ctx.sentActivities[0];
      assertEquals(
        recipients,
        visibility === "direct" ? [actorA, actorB] : "followers",
      );
      assertInstanceOf(activity, Update);
      assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
      if (visibility === "public") {
        assertEquals(activity.toIds, [PUBLIC_COLLECTION, actorA.id, actorB.id]);
        assertEquals(activity.ccIds, [ctx.getFollowersUri(bot.identifier)]);
      } else if (visibility === "unlisted") {
        assertEquals(activity.toIds, [
          ctx.getFollowersUri(bot.identifier),
          actorA.id,
          actorB.id,
        ]);
        assertEquals(activity.ccIds, [PUBLIC_COLLECTION]);
      } else if (visibility === "followers") {
        assertEquals(activity.toIds, [
          ctx.getFollowersUri(bot.identifier),
          actorA.id,
          actorB.id,
        ]);
        assertEquals(activity.ccIds, []);
      } else {
        assertEquals(activity.toIds, [actorA.id, actorB.id]);
        assertEquals(activity.ccIds, []);
      }
      assertEquals(await activity.getObject(), msg.raw);
      assertEquals(activity.updated, msg.updated);
      if (visibility !== "direct") {
        const { recipients, activity } = ctx.sentActivities[1];
        assertEquals(recipients, [actorA, actorB]);
        assertInstanceOf(activity, Update);
        assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
        assertEquals(await activity.getObject(), msg.raw);
        assertEquals(activity.updated, msg.updated);
      }
    });
  }
});

Deno.test("getMessageVisibility()", () => {
  assertEquals(
    getMessageVisibility([PUBLIC_COLLECTION], [], new Person({})),
    "public",
  );
  assertEquals(
    getMessageVisibility([], [PUBLIC_COLLECTION], new Person({})),
    "unlisted",
  );
  assertEquals(
    getMessageVisibility(
      [],
      [new URL("https://example.com/followers")],
      new Person({
        followers: new URL("https://example.com/followers"),
      }),
    ),
    "followers",
  );
  assertEquals(
    getMessageVisibility(
      [new URL("https://example.com/followers")],
      [],
      new Person({
        followers: new URL("https://example.com/followers"),
      }),
    ),
    "followers",
  );
  assertEquals(
    getMessageVisibility(
      [new URL("https://example.com/actor")],
      [],
      new Person({}),
      new Set(["https://example.com/actor"]),
    ),
    "direct",
  );
  assertEquals(getMessageVisibility([], [], new Person({})), "unknown");
});

Deno.test("MessageImpl.react()", async (t) => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);
  const originalPost = new Note({
    id: new URL(
      "https://example.com/ap/note/react-test-note",
    ),
    content: "<p>React to this!</p>",
    attribution: new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    }),
    to: PUBLIC_COLLECTION,
  });
  const message = await createMessage<Note, void>(
    originalPost,
    session,
    {},
  );

  await t.step("react() with string emoji", async () => {
    ctx.sentActivities = []; // Clear previous activities
    const emoji = "👍";
    assert(isEmoji(emoji));
    const reaction = await message.react(emoji);
    assertEquals(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assertEquals(recipients, "followers");
    assertInstanceOf(activity, EmojiReact);
    assertEquals(activity.actorId, ctx.getActorUri(bot.identifier));
    assertEquals(activity.objectId, message.id);
    assertEquals(activity.name, "👍");
    assertEquals(await Array.fromAsync(activity.getTags()), []);
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assertEquals(recipients2, [message.actor]);
    assertInstanceOf(activity2, EmojiReact);
    assertEquals(activity2, activity);
    assertEquals(reaction.actor, await session.getActor());
    assertEquals(reaction.raw, activity);
    assertEquals(reaction.id, activity.id);
    assertEquals(reaction.message, message);
    assertEquals(reaction.emoji, emoji);

    // Test unreact
    ctx.sentActivities = [];
    await reaction.unreact();
    assertEquals(ctx.sentActivities.length, 2);
    const { recipients: urRecipients, activity: urActivity } =
      ctx.sentActivities[0];
    assertEquals(urRecipients, "followers");
    assertInstanceOf(urActivity, Undo);
    assertEquals(urActivity.actorId, ctx.getActorUri(bot.identifier));
    const urObject = await urActivity.getObject();
    assertInstanceOf(urObject, EmojiReact);
    assertEquals(urObject.id, reaction.id);
    const { recipients: urRecipients2, activity: urActivity2 } =
      ctx.sentActivities[1];
    assertEquals(urRecipients2, [message.actor]);
    assertInstanceOf(urActivity2, Undo);
    assertEquals(urActivity2, urActivity);
  });

  await t.step("react() with CustomEmoji", async () => {
    ctx.sentActivities = [];
    const customEmoji = new CustomEmoji({
      id: new URL("https://example.com/emojis/custom"),
      name: ":custom:",
      icon: new Image({
        url: new URL("https://example.com/emojis/custom.png"),
      }),
    });
    const reaction = await message.react(customEmoji);
    assertEquals(ctx.sentActivities.length, 2);
    const { activity } = ctx.sentActivities[0];
    assertInstanceOf(activity, EmojiReact);
    assertEquals(activity.name, ":custom:");
    const tags = await Array.fromAsync(activity.getTags());
    assertEquals(tags.length, 1);
    assertEquals(tags[0], customEmoji);
    assertEquals(reaction.emoji, customEmoji);

    // Test unreact
    ctx.sentActivities = [];
    await reaction.unreact();
    assertEquals(ctx.sentActivities.length, 2);
    const { activity: urActivity } = ctx.sentActivities[0];
    assertInstanceOf(urActivity, Undo);
    const urObject = await urActivity.getObject();
    assertInstanceOf(urObject, EmojiReact);
    assertEquals(urObject.id, reaction.id);
    const urTags = await Array.fromAsync(urActivity.getTags());
    assertEquals(urTags.length, 1);
    assertEquals(urTags[0], customEmoji);
  });

  await t.step("react() with DeferredCustomEmoji", async () => {
    ctx.sentActivities = [];
    const deferredEmoji: DeferredCustomEmoji<void> = (sessionParam) => {
      assertEquals(sessionParam, session); // Ensure correct session is passed
      return new CustomEmoji({
        id: new URL("https://example.com/emojis/deferred"),
        name: ":deferred:",
        icon: new Image({
          url: new URL("https://example.com/emojis/deferred.png"),
        }),
      });
    };
    const reaction = await message.react(deferredEmoji);
    assertEquals(ctx.sentActivities.length, 2);
    const { activity } = ctx.sentActivities[0];
    assertInstanceOf(activity, EmojiReact);
    assertEquals(activity.name, ":deferred:");
    const tags = await Array.fromAsync(activity.getTags());
    assertEquals(tags.length, 1);
    assertInstanceOf(tags[0], CustomEmoji);
    assertEquals(tags[0].id?.href, "https://example.com/emojis/deferred");
    assertEquals(reaction.emoji, tags[0]);

    // Test unreact
    ctx.sentActivities = [];
    await reaction.unreact();
    assertEquals(ctx.sentActivities.length, 2);
    const { activity: urActivity } = ctx.sentActivities[0];
    assertInstanceOf(urActivity, Undo);
    const urObject = await urActivity.getObject();
    assertInstanceOf(urObject, EmojiReact);
    assertEquals(urObject.id, reaction.id);
    const urTags = await Array.fromAsync(urActivity.getTags());
    assertEquals(urTags.length, 1);
    assertEquals(urTags[0], tags[0]); // Should be the resolved CustomEmoji
  });
});
