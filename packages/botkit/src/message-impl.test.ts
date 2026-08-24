// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2025–2026 Hong Minhee <https://hongminhee.org/>
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
  QuoteAuthorization,
  Tombstone,
  Undo,
  Update,
} from "@fedify/vocab";
import { LanguageString } from "@fedify/vocab-runtime";
import assert from "node:assert/strict";
import { test } from "node:test";
import { BotImpl } from "./bot-impl.ts";
import { type DeferredCustomEmoji, emoji } from "./emoji.ts";
import {
  createMessage,
  getMessageClass,
  getMessageVisibility,
  isMessageObject,
} from "./message-impl.ts";
import { MemoryRepository, type Uuid } from "./repository.ts";
import { InstanceImpl } from "./instance-impl.ts";
import { createMockContext } from "./session-impl.test.ts";
import { SessionImpl } from "./session-impl.ts";
import {
  customEmoji,
  hashtag,
  inline,
  link,
  mention,
  type Text,
  text,
} from "./text.ts";

test("isMessageObject()", () => {
  assert.ok(isMessageObject(new Article({})));
  assert.ok(isMessageObject(new ChatMessage({})));
  assert.ok(isMessageObject(new Note({})));
  assert.ok(isMessageObject(new Question({})));
  assert.ok(!isMessageObject(new Person({})));
});

test("getMessageClass()", () => {
  assert.deepStrictEqual(
    getMessageClass(new Article({})),
    Article,
  );
  assert.deepStrictEqual(
    getMessageClass(new ChatMessage({})),
    ChatMessage,
  );
  assert.deepStrictEqual(
    getMessageClass(new Note({})),
    Note,
  );
  assert.deepStrictEqual(
    getMessageClass(new Question({})),
    Question,
  );
});

test("createMessage()", async () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const session = bot.getSession("https://example.com", undefined);
  await assert.rejects(
    () => createMessage<Note, void>(new Note({}), session, {}),
    TypeError,
    "The raw.id is required.",
  );
  await assert.rejects(
    () =>
      createMessage<Note, void>(
        new Note({ id: new URL("https://example.com/notes/1") }),
        session,
        {},
      ),
    TypeError,
    "The raw.content is required.",
  );
  await assert.rejects(
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
  assert.deepStrictEqual(publicMessage.raw, publicNote);
  assert.deepStrictEqual(publicMessage.id, publicNote.id);
  assert.deepStrictEqual(publicMessage.actor, await session.getActor());
  assert.deepStrictEqual(publicMessage.visibility, "public");
  assert.deepStrictEqual(publicMessage.language, undefined);
  assert.deepStrictEqual(publicMessage.text, "#Hello, world!");
  assert.deepStrictEqual(publicMessage.html, "<p>#Hello, <em>world</em>!</p>");
  assert.deepStrictEqual(publicMessage.replyTarget, undefined);
  assert.deepStrictEqual(publicMessage.mentions, [await session.getActor()]);
  assert.deepStrictEqual(publicMessage.hashtags, [
    new Hashtag({
      name: "#Hello",
      href: new URL("https://example.com/tags/hello"),
    }),
  ]);
  assert.deepStrictEqual(publicMessage.attachments, []);
  assert.deepStrictEqual(publicMessage.published, undefined);
  assert.deepStrictEqual(publicMessage.updated, undefined);

  const unlistedNote = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
  });
  const unlistedMessage = await createMessage<Note, void>(
    unlistedNote,
    session,
    {},
  );
  assert.deepStrictEqual(unlistedMessage.visibility, "unlisted");

  const followersNote = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot/followers"),
    ccs: [],
  });
  const followersMessage = await createMessage<Note, void>(
    followersNote,
    session,
    {},
  );
  assert.deepStrictEqual(followersMessage.visibility, "followers");

  const direct = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot"),
    ccs: [],
  });
  const directMessage = await createMessage<Note, void>(direct, session, {});
  assert.deepStrictEqual(directMessage.visibility, "direct");

  const unknown = publicNote.clone({
    tos: [],
    ccs: [],
  });
  const unknownMessage = await createMessage<Note, void>(unknown, session, {});
  assert.deepStrictEqual(unknownMessage.visibility, "unknown");
});

test("createMessage() verifies quote approvals", async (t) => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://author.example/users/alice"),
    preferredUsername: "alice",
  });
  const quoter = new Person({
    id: new URL("https://quote.example/users/bob"),
    preferredUsername: "bob",
  });
  const targetId = new URL("https://author.example/notes/original");
  const quoteId = new URL("https://quote.example/notes/quote");
  const authorizationId = new URL("https://author.example/stamps/1");
  const target = new Note({
    id: targetId,
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });

  const materialize = async (
    options: {
      readonly attribution?: Person;
      readonly quote?: URL;
      readonly quoteUrl?: URL;
      readonly quoteAuthorization?: URL;
      readonly authorization?: QuoteAuthorization | null;
      readonly authorizationError?: unknown;
      readonly throwOnAuthorization?: boolean;
      readonly signal?: AbortSignal;
      readonly onAuthorizationLookup?: (
        options: Parameters<typeof ctx.lookupObject>[1],
      ) => void;
    } = {},
  ) => {
    Object.defineProperty(ctx, "lookupObject", {
      value: (
        id: URL,
        lookupOptions?: Parameters<typeof ctx.lookupObject>[1],
      ) => {
        if (id.href === targetId.href) return Promise.resolve(target);
        if (id.href === authorizationId.href) {
          options.onAuthorizationLookup?.(lookupOptions);
          if (options.authorizationError != null) {
            return Promise.reject(options.authorizationError);
          }
          if (options.throwOnAuthorization === true) {
            return Promise.reject(new TypeError("Fetch failed."));
          }
          return Promise.resolve(options.authorization ?? null);
        }
        return Promise.resolve(null);
      },
      configurable: true,
    });
    return await createMessage<Note, void>(
      new Note({
        id: quoteId,
        attribution: options.attribution ?? quoter,
        content: "Quote.",
        to: PUBLIC_COLLECTION,
        quote: options.quote,
        quoteUrl: options.quoteUrl,
        quoteAuthorization: options.quoteAuthorization,
      }),
      session,
      {},
      undefined,
      undefined,
      undefined,
      options.signal,
    );
  };

  const noQuote = await createMessage<Note, void>(
    new Note({
      id: new URL("https://quote.example/notes/plain"),
      attribution: quoter,
      content: "Plain.",
      to: PUBLIC_COLLECTION,
    }),
    session,
    {},
  );
  assert.deepStrictEqual(noQuote.quoteApproved, undefined);

  await t.test("self-quote", async () => {
    const message = await materialize({
      attribution: author,
      quote: targetId,
    });
    assert.deepStrictEqual(message.quoteApproved, true);
  });

  await t.test("valid stamp", async () => {
    const message = await materialize({
      quote: targetId,
      quoteAuthorization: authorizationId,
      authorization: new QuoteAuthorization({
        id: authorizationId,
        attribution: author.id,
        interactingObject: quoteId,
        interactionTarget: targetId,
      }),
    });
    assert.deepStrictEqual(message.quoteApproved, true);
  });

  await t.test("wrong attributedTo", async () => {
    const message = await materialize({
      quote: targetId,
      quoteAuthorization: authorizationId,
      authorization: new QuoteAuthorization({
        id: authorizationId,
        attribution: quoter.id,
        interactingObject: quoteId,
        interactionTarget: targetId,
      }),
    });
    assert.deepStrictEqual(message.quoteApproved, false);
  });

  await t.test("wrong interactingObject", async () => {
    const message = await materialize({
      quote: targetId,
      quoteAuthorization: authorizationId,
      authorization: new QuoteAuthorization({
        id: authorizationId,
        attribution: author.id,
        interactingObject: new URL("https://quote.example/notes/other"),
        interactionTarget: targetId,
      }),
    });
    assert.deepStrictEqual(message.quoteApproved, false);
  });

  await t.test("wrong interactionTarget", async () => {
    const message = await materialize({
      quote: targetId,
      quoteAuthorization: authorizationId,
      authorization: new QuoteAuthorization({
        id: authorizationId,
        attribution: author.id,
        interactingObject: quoteId,
        interactionTarget: new URL("https://author.example/notes/other"),
      }),
    });
    assert.deepStrictEqual(message.quoteApproved, false);
  });

  await t.test("cross-origin stamp", async () => {
    const message = await materialize({
      quote: targetId,
      quoteAuthorization: authorizationId,
      authorization: new QuoteAuthorization({
        id: new URL("https://other.example/stamps/1"),
        attribution: author.id,
        interactingObject: quoteId,
        interactionTarget: targetId,
      }),
    });
    assert.deepStrictEqual(message.quoteApproved, false);
  });

  await t.test("fetch failure", async () => {
    const message = await materialize({
      quote: targetId,
      quoteAuthorization: authorizationId,
      throwOnAuthorization: true,
    });
    assert.deepStrictEqual(message.quoteApproved, false);
  });

  await t.test("passes abort signal to remote stamp lookup", async () => {
    const controller = new AbortController();
    let lookupSignal: AbortSignal | undefined;
    const message = await materialize({
      quote: targetId,
      quoteAuthorization: authorizationId,
      authorization: new QuoteAuthorization({
        id: authorizationId,
        attribution: author.id,
        interactingObject: quoteId,
        interactionTarget: targetId,
      }),
      signal: controller.signal,
      onAuthorizationLookup: (options) => {
        lookupSignal = options?.signal;
      },
    });
    assert.deepStrictEqual(message.quoteApproved, true);
    assert.deepStrictEqual(lookupSignal, controller.signal);
  });

  await t.test("preserves abort errors from remote stamp lookup", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Aborted.", "AbortError");
    controller.abort(reason);
    await assert.rejects(
      () =>
        materialize({
          quote: targetId,
          quoteAuthorization: authorizationId,
          authorizationError: reason,
          signal: controller.signal,
        }),
      (error) => error === reason,
    );
  });

  await t.test("preserves custom errors after abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new TypeError("Lookup cancelled.");
    await assert.rejects(
      () =>
        materialize({
          quote: targetId,
          quoteAuthorization: authorizationId,
          authorizationError: error,
          signal: controller.signal,
        }),
      (actual) => actual === error,
    );
  });

  await t.test("legacy quote", async () => {
    const message = await materialize({
      quoteUrl: targetId,
    });
    assert.deepStrictEqual(message.quoteApproved, false);
  });
});

test("AuthorizedMessageImpl.delete()", async () => {
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
    undefined,
    true,
  );
  await repository.addMessage(
    "bot",
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
  assert.deepStrictEqual(await repository.countMessages("bot"), 0);
  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, "followers");
  assert.ok(activity instanceof Delete);
  assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
  assert.deepStrictEqual(activity.toIds, [PUBLIC_COLLECTION]);
  assert.deepStrictEqual(activity.ccIds, [ctx.getFollowersUri(bot.identifier)]);
  const tombstone = await activity.getObject();
  assert.ok(tombstone instanceof Tombstone);
  assert.deepStrictEqual(tombstone.id, note.id);
});

test("AuthorizedMessageImpl.delete() clears quote authorization references", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockContext(bot, "https://example.com");
  const session = new SessionImpl(bot, ctx);
  const messageId = "01950000-0000-7000-8000-000000000501" as Uuid;
  const authorization = new URL("https://remote.example/stamps/1");
  const note = new Note({
    id: ctx.getObjectUri(Note, { identifier: bot.identifier, id: messageId }),
    content: "<p>Hello, world!</p>",
    attribution: ctx.getActorUri(bot.identifier),
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(bot.identifier),
    quote: new URL("https://remote.example/notes/original"),
    quoteAuthorization: authorization,
  });
  const msg = await createMessage<Note, void>(
    note,
    session,
    {},
    undefined,
    undefined,
    true,
  );
  await repository.addMessage(
    "bot",
    messageId,
    new Create({
      id: ctx.getObjectUri(Create, {
        identifier: bot.identifier,
        id: messageId,
      }),
      actor: ctx.getActorUri(bot.identifier),
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(bot.identifier),
      object: note,
    }),
  );
  await repository.addQuoteAuthorizationReference(
    "bot",
    authorization,
    messageId,
  );

  await msg.delete();

  assert.deepStrictEqual(await repository.countMessages("bot"), 0);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference("bot", authorization),
    undefined,
  );
});

test("MessageImpl.reply()", async () => {
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
  assert.deepStrictEqual(await repository.countMessages("bot"), 1);
  const [create] = await Array.fromAsync(repository.getMessages("bot"));
  assert.ok(create != null);
  assert.deepStrictEqual(ctx.sentActivities.length, 2);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, "followers");
  assert.ok(activity instanceof Create);
  assert.deepStrictEqual(
    await activity.toJsonLd({ format: "compact" }),
    await create.toJsonLd({ format: "compact" }),
  );
  const { recipients: recipients2, activity: activity2 } =
    ctx.sentActivities[1];
  assert.deepStrictEqual(recipients2, [originalMsg.actor]);
  assert.ok(activity2 instanceof Create);
  assert.deepStrictEqual(
    await activity2.toJsonLd({ format: "compact" }),
    await create.toJsonLd({ format: "compact" }),
  );
  assert.deepStrictEqual(
    await reply.raw.toJsonLd({ format: "compact" }),
    await (await create.getObject())?.toJsonLd({ format: "compact" }),
  );
  assert.deepStrictEqual(reply.actor, await session.getActor());
  assert.deepStrictEqual(reply.replyTarget, originalMsg);
  assert.deepStrictEqual(reply.visibility, "unlisted");
});

test("MessageImpl.share()", async (t) => {
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

  await t.test("share()", async () => {
    assert.deepStrictEqual(await repository.countMessages("bot"), 1);
    const [announce] = await Array.fromAsync(repository.getMessages("bot"));
    assert.ok(announce != null);
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Announce);
    assert.deepStrictEqual(activity.toIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    assert.deepStrictEqual(activity.ccIds, [
      PUBLIC_COLLECTION,
      originalPost.attributionId,
    ]);
    assert.deepStrictEqual(
      await activity.toJsonLd({ format: "compact" }),
      await announce.toJsonLd({ format: "compact" }),
    );
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assert.deepStrictEqual(recipients2, [originalMsg.actor]);
    assert.ok(activity2 instanceof Announce);
    assert.deepStrictEqual(activity2.toIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    assert.deepStrictEqual(activity2.ccIds, [
      PUBLIC_COLLECTION,
      originalPost.attributionId,
    ]);
    assert.deepStrictEqual(
      await activity2.toJsonLd({ format: "compact" }),
      await announce.toJsonLd({ format: "compact" }),
    );
    assert.deepStrictEqual(
      await sharedMsg.raw.toJsonLd({ format: "compact" }),
      await announce.toJsonLd({ format: "compact" }),
    );
    assert.deepStrictEqual(sharedMsg.actor, await session.getActor());
    assert.deepStrictEqual(sharedMsg.visibility, "unlisted");
    assert.deepStrictEqual(sharedMsg.original, originalMsg);
  });

  await t.test("unshare()", async () => {
    ctx.sentActivities = [];

    await sharedMsg.unshare();
    assert.deepStrictEqual(await repository.countMessages("bot"), 0);
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Undo);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.toIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    assert.deepStrictEqual(activity.ccIds, [
      PUBLIC_COLLECTION,
      originalPost.attributionId,
    ]);
    assert.deepStrictEqual(activity.objectId, sharedMsg.id);
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assert.deepStrictEqual(recipients2, [originalMsg.actor]);
    assert.ok(activity2 instanceof Undo);
    assert.deepStrictEqual(activity2.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity2.toIds, [
      ctx.getFollowersUri(bot.identifier),
    ]);
    assert.deepStrictEqual(activity2.ccIds, [
      PUBLIC_COLLECTION,
      originalPost.attributionId,
    ]);
    assert.deepStrictEqual(activity2.objectId, sharedMsg.id);
  });
});

test("MessageImpl.like()", async (t) => {
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

  await t.test("like()", async () => {
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof RawLike);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.objectId, message.id);
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assert.deepStrictEqual(recipients2, [message.actor]);
    assert.ok(activity2 instanceof RawLike);
    assert.deepStrictEqual(activity2, activity);
    assert.deepStrictEqual(like.actor, await session.getActor());
    assert.deepStrictEqual(like.raw, activity);
    assert.deepStrictEqual(like.id, activity.id);
    assert.deepStrictEqual(like.message, message);
  });

  await t.test("unlike()", async () => {
    ctx.sentActivities = [];

    await like.unlike();
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof Undo);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    const object = await activity.getObject();
    assert.ok(object instanceof RawLike);
    assert.deepStrictEqual(object.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(object.objectId, message.id);
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assert.deepStrictEqual(recipients2, [message.actor]);
    assert.ok(activity2 instanceof Undo);
    assert.deepStrictEqual(activity2, activity);
  });
});

test("AuthorizedMessage.update()", async (t) => {
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

    await t.test(visibility, async () => {
      const msg = await session.publish(text`Hello, ${actorA}`, { visibility });
      assert.deepStrictEqual(await repository.countMessages("bot"), 1);
      const originalRaw = msg.raw;
      ctx.sentActivities = [];
      const before = Temporal.Now.instant();
      await msg.update(text`Hello, ${actorB}`);
      const after = Temporal.Now.instant();
      assert.deepStrictEqual(msg.text, "Hello, @jane@example.com");
      assert.deepStrictEqual(
        msg.html,
        '<p>Hello, <a href="https://example.com/ap/actor/jane" ' +
          'translate="no" class="h-card u-url mention" target="_blank">' +
          "@<span>jane@example.com</span></a></p>",
      );
      assert.deepStrictEqual(msg.mentions.length, 1);
      assert.deepStrictEqual(msg.mentions[0].id, actorB.id);
      assert.deepStrictEqual(msg.hashtags, []);
      assert.ok(msg.updated != null);
      assert.ok(msg.updated.epochNanoseconds >= before.epochNanoseconds);
      assert.ok(msg.updated.epochNanoseconds <= after.epochNanoseconds);
      assert.deepStrictEqual(msg.raw.content, msg.html);
      if (visibility === "public") {
        assert.deepStrictEqual(msg.raw.toIds, [PUBLIC_COLLECTION, actorB.id]);
        assert.deepStrictEqual(msg.raw.ccIds, [
          ctx.getFollowersUri(bot.identifier),
        ]);
      } else if (visibility === "unlisted") {
        assert.deepStrictEqual(msg.raw.toIds, [
          ctx.getFollowersUri(bot.identifier),
          actorB.id,
        ]);
        assert.deepStrictEqual(msg.raw.ccIds, [PUBLIC_COLLECTION]);
      } else if (visibility === "followers") {
        assert.deepStrictEqual(msg.raw.toIds, [
          ctx.getFollowersUri(bot.identifier),
          actorB.id,
        ]);
        assert.deepStrictEqual(msg.raw.ccIds, []);
      } else {
        assert.deepStrictEqual(msg.raw.toIds, [actorB.id]);
        assert.deepStrictEqual(msg.raw.ccIds, []);
      }
      const tags = await Array.fromAsync(msg.raw.getTags());
      assert.deepStrictEqual(tags.length, 1);
      assert.ok(tags[0] instanceof Mention);
      assert.deepStrictEqual(tags[0].name, "@jane@example.com");
      assert.deepStrictEqual(tags[0].href, actorB.id);
      assert.deepStrictEqual(msg.raw.published, originalRaw.published);
      assert.deepStrictEqual(msg.raw.updated, msg.updated);
      const [create] = await Array.fromAsync(repository.getMessages("bot"));
      assert.deepStrictEqual(
        await (await create.getObject())?.toJsonLd({ format: "compact" }),
        await msg.raw.toJsonLd({ format: "compact" }),
      );
      assert.deepStrictEqual(
        ctx.sentActivities.length,
        visibility === "direct" ? 1 : 2,
      );
      const { recipients, activity } = ctx.sentActivities[0];
      assert.deepStrictEqual(
        recipients,
        visibility === "direct" ? [actorA, actorB] : "followers",
      );
      assert.ok(activity instanceof Update);
      assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
      if (visibility === "public") {
        assert.deepStrictEqual(activity.toIds, [
          PUBLIC_COLLECTION,
          actorA.id,
          actorB.id,
        ]);
        assert.deepStrictEqual(activity.ccIds, [
          ctx.getFollowersUri(bot.identifier),
        ]);
      } else if (visibility === "unlisted") {
        assert.deepStrictEqual(activity.toIds, [
          ctx.getFollowersUri(bot.identifier),
          actorA.id,
          actorB.id,
        ]);
        assert.deepStrictEqual(activity.ccIds, [PUBLIC_COLLECTION]);
      } else if (visibility === "followers") {
        assert.deepStrictEqual(activity.toIds, [
          ctx.getFollowersUri(bot.identifier),
          actorA.id,
          actorB.id,
        ]);
        assert.deepStrictEqual(activity.ccIds, []);
      } else {
        assert.deepStrictEqual(activity.toIds, [actorA.id, actorB.id]);
        assert.deepStrictEqual(activity.ccIds, []);
      }
      assert.deepStrictEqual(await activity.getObject(), msg.raw);
      assert.deepStrictEqual(activity.updated, msg.updated);
      if (visibility !== "direct") {
        const { recipients, activity } = ctx.sentActivities[1];
        assert.deepStrictEqual(recipients, [actorA, actorB]);
        assert.ok(activity instanceof Update);
        assert.deepStrictEqual(
          activity.actorId,
          ctx.getActorUri(bot.identifier),
        );
        assert.deepStrictEqual(await activity.getObject(), msg.raw);
        assert.deepStrictEqual(activity.updated, msg.updated);
      }
    });
  }

  await t.test("quote policy", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);
    const msg = await session.publish(text`Hello`);
    assert.deepStrictEqual(msg.quotePolicy, {
      automatic: "public",
      manual: undefined,
    });
    await msg.update(text`Hello again`, { quotePolicy: "nobody" });
    assert.deepStrictEqual(msg.quotePolicy, {
      automatic: "nobody",
      manual: undefined,
    });
    const [create] = await Array.fromAsync(repository.getMessages("bot"));
    assert.ok(create instanceof Create);
    const object = await create.getObject(ctx);
    assert.ok(object instanceof Note);
    assert.deepStrictEqual(
      object.interactionPolicy?.canQuote?.automaticApprovals,
      [ctx.getActorUri(bot.identifier)],
    );
  });

  await t.test("name, summary, and URL", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);
    const mentioned = new Person({
      id: new URL("https://remote.example/ap/actor/john"),
      preferredUsername: "john",
      url: new URL("https://remote.example/@john"),
    });
    const firstUrl = new URL("https://blog.example/posts/first");
    const secondUrl = new URL("https://blog.example/posts/second");
    const msg = await session.publish(text`Original content for ${mentioned}`, {
      name: "Original title",
      summary: inline`Original summary for ${mentioned}`,
      url: firstUrl,
    });

    ctx.sentActivities = [];
    await msg.update(text`Updated content for ${mentioned}`);
    assert.deepStrictEqual(msg.raw.name, "Original title");
    assert.deepStrictEqual(
      msg.raw.summary,
      'Original summary for <a href="https://remote.example/@john" ' +
        'translate="no" class="h-card u-url mention" target="_blank">' +
        "@<span>john@remote.example</span></a>",
    );
    assert.deepStrictEqual(msg.raw.url, firstUrl);
    assert.ok(msg.raw.toIds.some((id) => id.href === mentioned.id?.href));
    let tags = await Array.fromAsync(msg.raw.getTags(ctx));
    assert.deepStrictEqual(tags.length, 1);
    assert.ok(tags[0] instanceof Mention);
    assert.deepStrictEqual(tags[0].href, mentioned.id);

    await msg.update(text`Updated again for ${mentioned}`);
    tags = await Array.fromAsync(msg.raw.getTags(ctx));
    assert.deepStrictEqual(tags.length, 1);

    await msg.update(text`Updated with replacement metadata`, {
      name: "Replacement title",
      summary: "Replacement <summary>",
      url: secondUrl,
    });
    assert.deepStrictEqual(msg.raw.name, "Replacement title");
    assert.deepStrictEqual(msg.raw.summary, "Replacement &lt;summary&gt;");
    assert.deepStrictEqual(msg.raw.url, secondUrl);
    assert.ok(!msg.raw.toIds.some((id) => id.href === mentioned.id?.href));
    tags = await Array.fromAsync(msg.raw.getTags(ctx));
    assert.deepStrictEqual(tags, []);

    await msg.update(text`Updated once more`, {
      name: null,
      summary: null,
      url: null,
    });
    assert.deepStrictEqual(msg.raw.names, []);
    assert.deepStrictEqual(msg.raw.summaries, []);
    assert.deepStrictEqual(msg.raw.urls, []);
    const [create] = await Array.fromAsync(repository.getMessages("bot"));
    assert.ok(create instanceof Create);
    const object = await create.getObject(ctx);
    assert.ok(object instanceof Note);
    assert.deepStrictEqual(object.names, []);
    assert.deepStrictEqual(object.summaries, []);
    assert.deepStrictEqual(object.urls, []);
  });

  await t.test("preserves unresolved summary mentions", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);
    const mentioned = new Person({
      id: new URL("https://remote.example/ap/actor/john"),
      preferredUsername: "john",
      url: new URL("https://remote.example/@john"),
    });
    await session.publish(text`Original content`, {
      summary: inline`Original summary for ${mentioned}`,
      visibility: "direct",
    });

    let lookupCount = 0;
    Object.defineProperty(ctx, "lookupObject", {
      value: (url: URL) => {
        if (url.href !== mentioned.id?.href) return Promise.resolve(null);
        lookupCount++;
        return Promise.resolve(lookupCount === 1 ? null : mentioned);
      },
      configurable: true,
    });
    ctx.sentActivities = [];
    const [message] = await Array.fromAsync(session.getOutbox());
    assert.deepStrictEqual(message.mentions, []);

    await message.update(text`Updated content`);

    assert.deepStrictEqual(lookupCount, 2);
    const tags = await Array.fromAsync(message.raw.getTags(ctx));
    assert.deepStrictEqual(tags.length, 1);
    assert.ok(tags[0] instanceof Mention);
    assert.deepStrictEqual(tags[0].href, mentioned.id);
    assert.deepStrictEqual(message.raw.toIds, [mentioned.id]);
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    assert.deepStrictEqual(ctx.sentActivities[0].recipients, [mentioned]);
    assert.ok(ctx.sentActivities[0].activity instanceof Update);
  });

  await t.test("preserves tags from every localized summary", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);
    const mentioned = new Person({
      id: new URL("https://remote.example/ap/actor/john"),
      preferredUsername: "john",
      url: new URL("https://remote.example/@john"),
    });
    const message = await session.publish(text`Original content`, {
      summary: "Primary summary",
      visibility: "direct",
    });
    let localizedSummary = "";
    for await (
      const chunk of inline`Localized summary for ${mentioned}`.getHtml(session)
    ) {
      localizedSummary += chunk;
    }
    const parsed = ctx.parseUri(message.id);
    assert.ok(parsed?.type === "object");
    await repository.updateMessage(
      "bot",
      parsed.values.id as Uuid,
      async (create) => {
        assert.ok(create instanceof Create);
        const object = await create.getObject(ctx);
        assert.ok(object instanceof Note);
        return create.clone({
          object: object.clone({
            summaries: [
              new LanguageString("Primary summary", "en"),
              new LanguageString(localizedSummary, "ja"),
              "Primary summary",
            ],
            tags: [
              new Mention({
                name: "@john@remote.example",
                href: mentioned.id,
              }),
            ],
            tos: [mentioned.id!],
          }),
        });
      },
    );
    Object.defineProperty(ctx, "lookupObject", {
      value: (url: URL) =>
        Promise.resolve(url.href === mentioned.id?.href ? mentioned : null),
      configurable: true,
    });
    ctx.sentActivities = [];

    await message.update(text`Updated content`);

    const tags = await Array.fromAsync(message.raw.getTags(ctx));
    assert.deepStrictEqual(tags.length, 1);
    assert.ok(tags[0] instanceof Mention);
    assert.deepStrictEqual(tags[0].href, mentioned.id);
    assert.deepStrictEqual(message.raw.toIds, [mentioned.id]);
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    assert.deepStrictEqual(ctx.sentActivities[0].recipients, [mentioned]);
  });

  await t.test("refreshes content-only mentions", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);
    const contentActor = new Person({
      id: new URL("https://remote.example/ap/actor/content"),
      preferredUsername: "content",
      name: "Old profile",
      url: new URL("https://remote.example/@content"),
    });
    const summaryActor = new Person({
      id: new URL("https://remote.example/ap/actor/summary"),
      preferredUsername: "summary",
      url: new URL("https://remote.example/@summary"),
    });
    const message = await session.publish(
      text`Original content for ${contentActor}`,
      {
        summary: inline`Original summary for ${summaryActor}`,
        visibility: "direct",
      },
    );
    const refreshedContentActor = contentActor.clone({
      name: "Fresh profile",
    });
    let lookupCount = 0;
    Object.defineProperty(ctx, "lookupObject", {
      value: (url: URL) => {
        if (url.href === contentActor.id?.href) {
          lookupCount++;
          return Promise.resolve(refreshedContentActor);
        }
        return Promise.resolve(null);
      },
      configurable: true,
    });
    const updatedText: Text<"block", void> = {
      type: "block",
      async *getHtml() {
        yield "<p>Updated content</p>";
      },
      async *getTags() {
        yield new Mention({ name: "someone", href: contentActor.id });
      },
      getCachedObjects() {
        return [];
      },
    };

    await message.update(updatedText);

    assert.deepStrictEqual(lookupCount, 1);
    assert.deepStrictEqual(
      message.mentions.find((actor) => actor.id?.href === contentActor.id?.href)
        ?.name,
      "Fresh profile",
    );
  });

  await t.test("does not preserve mentions for ordinary summary links", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);
    const actorUrl = new URL("https://remote.example/@john");
    const mentioned = new Person({
      id: new URL("https://remote.example/ap/actor/john"),
      preferredUsername: "john",
      url: actorUrl,
    });
    const message = await session.publish(
      text`Original content for ${mentioned}`,
      {
        summary: inline`Profile: ${link(actorUrl)}`,
        visibility: "direct",
      },
    );

    await message.update(text`Updated content`);

    assert.deepStrictEqual(
      message.raw.summary,
      'Profile: <a href="https://remote.example/@john" target="_blank">' +
        "https://remote.example/@john</a>",
    );
    assert.deepStrictEqual(await Array.fromAsync(message.raw.getTags(ctx)), []);
    assert.deepStrictEqual(message.raw.toIds, []);
  });

  await t.test("preserves summary hashtags and custom emojis", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);
    const emoji = new CustomEmoji({
      id: new URL("https://example.com/emojis/party"),
      name: ":party:",
      icon: new Image({
        url: new URL("https://example.com/emojis/party.png"),
      }),
    });
    const message = await session.publish(text`Original content`, {
      summary: inline`Summary for ${hashtag("BotKit")} ${customEmoji(emoji)}`,
    });

    await message.update(text`Updated content`);

    const tags = await Array.fromAsync(message.raw.getTags(ctx));
    assert.deepStrictEqual(tags.length, 2);
    assert.ok(tags[0] instanceof Hashtag);
    assert.ok(tags[1] instanceof CustomEmoji);
    assert.deepStrictEqual(tags[1].id, emoji.id);
  });

  await t.test("disambiguates summary mentions with the same label", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockContext(bot, "https://example.com");
    const session = new SessionImpl(bot, ctx);
    const contentActor = new Person({
      id: new URL("https://remote.example/ap/actor/content"),
      preferredUsername: "content",
      url: new URL("https://remote.example/@content"),
    });
    const summaryActor = new Person({
      id: new URL("https://remote.example/ap/actor/summary"),
      preferredUsername: "summary",
      url: new URL("https://remote.example/@summary"),
    });
    const message = await session.publish(
      text`Original content for ${mention("someone", contentActor)}`,
      {
        summary: inline`Original summary for ${
          mention("someone", summaryActor)
        }`,
        visibility: "direct",
      },
    );

    await message.update(text`Updated content`);

    const tags = await Array.fromAsync(message.raw.getTags(ctx));
    assert.deepStrictEqual(tags.length, 1);
    assert.ok(tags[0] instanceof Mention);
    assert.deepStrictEqual(tags[0].href, summaryActor.id);
    assert.deepStrictEqual(message.raw.toIds, [summaryActor.id]);
  });
});

test("getMessageVisibility()", () => {
  assert.deepStrictEqual(
    getMessageVisibility([PUBLIC_COLLECTION], [], new Person({})),
    "public",
  );
  assert.deepStrictEqual(
    getMessageVisibility([], [PUBLIC_COLLECTION], new Person({})),
    "unlisted",
  );
  assert.deepStrictEqual(
    getMessageVisibility(
      [],
      [new URL("https://example.com/followers")],
      new Person({
        followers: new URL("https://example.com/followers"),
      }),
    ),
    "followers",
  );
  assert.deepStrictEqual(
    getMessageVisibility(
      [new URL("https://example.com/followers")],
      [],
      new Person({
        followers: new URL("https://example.com/followers"),
      }),
    ),
    "followers",
  );
  assert.deepStrictEqual(
    getMessageVisibility(
      [new URL("https://example.com/actor")],
      [],
      new Person({}),
      new Set(["https://example.com/actor"]),
    ),
    "direct",
  );
  assert.deepStrictEqual(
    getMessageVisibility([], [], new Person({})),
    "unknown",
  );
});

test("MessageImpl.react()", async (t) => {
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

  await t.test("react() with string emoji", async () => {
    ctx.sentActivities = []; // Clear previous activities
    const reaction = await message.react(emoji`👍`);
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { recipients, activity } = ctx.sentActivities[0];
    assert.deepStrictEqual(recipients, "followers");
    assert.ok(activity instanceof EmojiReact);
    assert.deepStrictEqual(activity.actorId, ctx.getActorUri(bot.identifier));
    assert.deepStrictEqual(activity.objectId, message.id);
    assert.deepStrictEqual(activity.name, "👍");
    assert.deepStrictEqual(await Array.fromAsync(activity.getTags()), []);
    const { recipients: recipients2, activity: activity2 } =
      ctx.sentActivities[1];
    assert.deepStrictEqual(recipients2, [message.actor]);
    assert.ok(activity2 instanceof EmojiReact);
    assert.deepStrictEqual(activity2, activity);
    assert.deepStrictEqual(reaction.actor, await session.getActor());
    assert.deepStrictEqual(reaction.raw, activity);
    assert.deepStrictEqual(reaction.id, activity.id);
    assert.deepStrictEqual(reaction.message, message);
    assert.deepStrictEqual(reaction.emoji, emoji`👍`);

    // Test unreact
    ctx.sentActivities = [];
    await reaction.unreact();
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { recipients: urRecipients, activity: urActivity } =
      ctx.sentActivities[0];
    assert.deepStrictEqual(urRecipients, "followers");
    assert.ok(urActivity instanceof Undo);
    assert.deepStrictEqual(urActivity.actorId, ctx.getActorUri(bot.identifier));
    const urObject = await urActivity.getObject();
    assert.ok(urObject instanceof EmojiReact);
    assert.deepStrictEqual(urObject.id, reaction.id);
    const { recipients: urRecipients2, activity: urActivity2 } =
      ctx.sentActivities[1];
    assert.deepStrictEqual(urRecipients2, [message.actor]);
    assert.ok(urActivity2 instanceof Undo);
    assert.deepStrictEqual(urActivity2, urActivity);
  });

  await t.test("react() with CustomEmoji", async () => {
    ctx.sentActivities = [];
    const customEmoji = new CustomEmoji({
      id: new URL("https://example.com/emojis/custom"),
      name: ":custom:",
      icon: new Image({
        url: new URL("https://example.com/emojis/custom.png"),
      }),
    });
    const reaction = await message.react(customEmoji);
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { activity } = ctx.sentActivities[0];
    assert.ok(activity instanceof EmojiReact);
    assert.deepStrictEqual(activity.name, ":custom:");
    const tags = await Array.fromAsync(activity.getTags());
    assert.deepStrictEqual(tags.length, 1);
    assert.deepStrictEqual(tags[0], customEmoji);
    assert.deepStrictEqual(reaction.emoji, customEmoji);

    // Test unreact
    ctx.sentActivities = [];
    await reaction.unreact();
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { activity: urActivity } = ctx.sentActivities[0];
    assert.ok(urActivity instanceof Undo);
    const urObject = await urActivity.getObject();
    assert.ok(urObject instanceof EmojiReact);
    assert.deepStrictEqual(urObject.id, reaction.id);
    const urTags = await Array.fromAsync(urActivity.getTags());
    assert.deepStrictEqual(urTags.length, 1);
    assert.deepStrictEqual(urTags[0], customEmoji);
  });

  await t.test("react() with DeferredCustomEmoji", async () => {
    ctx.sentActivities = [];
    const deferredEmoji: DeferredCustomEmoji<void> = (sessionParam) => {
      assert.deepStrictEqual(sessionParam, session); // Ensure correct session is passed
      return new CustomEmoji({
        id: new URL("https://example.com/emojis/deferred"),
        name: ":deferred:",
        icon: new Image({
          url: new URL("https://example.com/emojis/deferred.png"),
        }),
      });
    };
    const reaction = await message.react(deferredEmoji);
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { activity } = ctx.sentActivities[0];
    assert.ok(activity instanceof EmojiReact);
    assert.deepStrictEqual(activity.name, ":deferred:");
    const tags = await Array.fromAsync(activity.getTags());
    assert.deepStrictEqual(tags.length, 1);
    assert.ok(tags[0] instanceof CustomEmoji);
    assert.deepStrictEqual(
      tags[0].id?.href,
      "https://example.com/emojis/deferred",
    );
    assert.deepStrictEqual(reaction.emoji, tags[0]);

    // Test unreact
    ctx.sentActivities = [];
    await reaction.unreact();
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const { activity: urActivity } = ctx.sentActivities[0];
    assert.ok(urActivity instanceof Undo);
    const urObject = await urActivity.getObject();
    assert.ok(urObject instanceof EmojiReact);
    assert.deepStrictEqual(urObject.id, reaction.id);
    const urTags = await Array.fromAsync(urActivity.getTags());
    assert.deepStrictEqual(urTags.length, 1);
    assert.deepStrictEqual(urTags[0], tags[0]); // Should be the resolved CustomEmoji
  });
});

test("AuthorizedMessage ignores other bots' messages", async (t) => {
  const repository = new MemoryRepository();
  const instance = new InstanceImpl<void>({
    kv: new MemoryKvStore(),
    repository,
  });
  instance.createBot("alpha", { username: "alphabot" });
  instance.createBot("beta", { username: "betabot" });
  const alpha = instance.getBot("alpha")!;
  const beta = instance.getBot("beta")!;

  // alpha publishes a message:
  const alphaCtx = createMockContext(alpha, "https://example.com");
  const alphaSession = new SessionImpl(alpha, alphaCtx);
  const published = await alphaSession.publish(text`Hello from alpha!`);
  assert.deepStrictEqual(await repository.countMessages("alpha"), 1);

  // An authorized view of alpha's message under beta's session must not be
  // able to touch alpha's data, since the URI identifies alpha as the owner:
  const betaCtx = createMockContext(beta, "https://example.com");
  const betaSession = new SessionImpl(beta, betaCtx);
  // The attribution is embedded so that no remote fetch is needed;
  // the message URI still identifies alpha as the owner:
  const rawWithActor = published.raw.clone({
    attribution: await alphaSession.getActor(),
  });
  const crossBot = await createMessage(
    rawWithActor,
    betaSession,
    {},
    undefined,
    undefined,
    true,
  );

  await t.test("update() is a no-op", async () => {
    betaCtx.sentActivities = [];
    await crossBot.update(text`Hijacked!`);
    assert.deepStrictEqual(betaCtx.sentActivities, []);
    const [stored] = await Array.fromAsync(repository.getMessages("alpha"));
    const object = await stored.getObject(alphaCtx);
    assert.ok(object?.content?.toString().includes("Hello from alpha!"));
  });

  await t.test("delete() is a no-op", async () => {
    betaCtx.sentActivities = [];
    await crossBot.delete();
    assert.deepStrictEqual(betaCtx.sentActivities, []);
    assert.deepStrictEqual(await repository.countMessages("alpha"), 1);
  });
});
