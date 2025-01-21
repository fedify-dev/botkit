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
  Create,
  Delete,
  Hashtag,
  Mention,
  Note,
  Person,
  PUBLIC_COLLECTION,
  Tombstone,
  Undo,
} from "@fedify/fedify/vocab";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertRejects } from "@std/assert/rejects";
import { BotImpl } from "./bot-impl.ts";
import { createMessage } from "./message-impl.ts";
import { createMockContext } from "./session-impl.test.ts";
import { SessionImpl } from "./session-impl.ts";
import { text } from "./text.ts";

Deno.test("createMessage()", async () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const session = bot.getSession("https://example.com", undefined);
  await assertRejects(
    () => createMessage<Note, void>(new Note({}), session),
    TypeError,
    "The raw.id is required.",
  );
  await assertRejects(
    () =>
      createMessage<Note, void>(
        new Note({ id: new URL("https://example.com/notes/1") }),
        session,
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
  const publicMessage = await createMessage<Note, void>(publicNote, session);
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
  );
  assertEquals(unlistedMessage.visibility, "unlisted");

  const followersNote = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot/followers"),
    ccs: [],
  });
  const followersMessage = await createMessage<Note, void>(
    followersNote,
    session,
  );
  assertEquals(followersMessage.visibility, "followers");

  const direct = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot"),
    ccs: [],
  });
  const directMessage = await createMessage<Note, void>(direct, session);
  assertEquals(directMessage.visibility, "direct");

  const unknown = publicNote.clone({
    tos: [],
    ccs: [],
  });
  const unknownMessage = await createMessage<Note, void>(unknown, session);
  assertEquals(unknownMessage.visibility, "unknown");
});

Deno.test("AuthorizedMessageImpl.delete()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
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
  const msg = await createMessage<Note, void>(note, session, undefined, true);
  await kv.set(
    bot.kvPrefixes.messages,
    ["c1c792ce-a0be-4685-b396-e59e5ef8c788"],
  );
  await kv.set(
    [...bot.kvPrefixes.messages, "c1c792ce-a0be-4685-b396-e59e5ef8c788"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/create/c1c792ce-a0be-4685-b396-e59e5ef8c788",
      "actor": "https://example.com/ap/actor/bot",
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      object: await note.toJsonLd(),
    },
  );
  await msg.delete();
  assertEquals(await kv.get(bot.kvPrefixes.messages), []);
  assertEquals(
    await kv.get([
      ...bot.kvPrefixes.messages,
      "c1c792ce-a0be-4685-b396-e59e5ef8c788",
    ]),
    undefined,
  );
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
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
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
  const originalMsg = await createMessage<Note, void>(originalPost, session);
  const reply = await originalMsg.reply(text`Hello, John!`);
  const msgIds = await kv.get<string[]>(bot.kvPrefixes.messages);
  assert(msgIds != null);
  assertEquals(msgIds.length, 1);
  const [msgId] = msgIds;
  const activityJson = await kv.get([...bot.kvPrefixes.messages, msgId]);
  assert(activityJson != null);
  const create = await Create.fromJsonLd(activityJson);
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
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
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
  const originalMsg = await createMessage<Note, void>(originalPost, session);
  const sharedMsg = await originalMsg.share();
  let msgId: string;

  await t.step("share()", async () => {
    const msgIds = await kv.get<string[]>(bot.kvPrefixes.messages);
    assert(msgIds != null);
    assertEquals(msgIds.length, 1);
    [msgId] = msgIds;
    const activityJson = await kv.get([...bot.kvPrefixes.messages, msgId]);
    assert(activityJson != null);
    const announce = await Announce.fromJsonLd(activityJson);
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
    assertEquals(await kv.get(bot.kvPrefixes.messages), []);
    assertEquals(
      await kv.get([...bot.kvPrefixes.messages, msgId]),
      undefined,
    );
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
