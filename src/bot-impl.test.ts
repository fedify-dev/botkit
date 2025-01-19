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
import { type InboxContext, MemoryKvStore } from "@fedify/fedify/federation";
import { exportJwk } from "@fedify/fedify/sig";
import {
  Accept,
  type Activity,
  type Actor,
  Announce,
  Article,
  Create,
  CryptographicKey,
  Follow,
  Image,
  Mention,
  Note,
  Object,
  Person,
  Place,
  PropertyValue,
  PUBLIC_COLLECTION,
  type Recipient,
  Reject,
  Service,
  Undo,
} from "@fedify/fedify/vocab";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertFalse } from "@std/assert/false";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertNotEquals } from "@std/assert/not-equals";
import { BotImpl } from "./bot-impl.ts";
import { parseSemVer } from "./bot.ts";
import type { Message, MessageClass } from "./message.ts";
import { SessionImpl } from "./session-impl.ts";
import type { Session } from "./session.ts";
import { mention, strong, text } from "./text.ts";

Deno.test("BotImpl.getActorSummary()", async (t) => {
  await t.step("without summary", async () => {
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      username: "bot",
    });
    const session = bot.getSession("https://example.com");
    assertEquals(await bot.getActorSummary(session), null);
  });

  await t.step("with summary", async () => {
    const actor = new Person({
      id: new URL("https://example.com/actor/john"),
      preferredUsername: "john",
    });
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      username: "bot",
      summary: text`A summary with a mention: ${actor}.`,
    });
    const session = bot.getSession("https://example.com");
    const expected = {
      tags: [
        new Mention({
          href: new URL("https://example.com/actor/john"),
          name: "@john@example.com",
        }),
      ],
      text: "<p>A summary with a mention: " +
        '<a href="https://example.com/actor/john" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>' +
        "john@example.com</span></a>.</p>",
    };
    assertEquals(await bot.getActorSummary(session), expected);
    assertEquals(await bot.getActorSummary(session), expected);
  });
});

Deno.test("BotImpl.getActorProperties()", async () => {
  const actor = new Person({
    id: new URL("https://example.com/actor/john"),
    preferredUsername: "john",
  });
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
    properties: {
      Foo: strong("bar"),
      Baz: mention(actor),
      Qux: text`quux`,
    },
  });
  const session = bot.getSession("https://example.com");
  const expected = {
    pairs: [
      new PropertyValue({ name: "Foo", value: "<strong>bar</strong>" }),
      new PropertyValue({
        name: "Baz",
        value: '<a href="https://example.com/actor/john" translate="no" ' +
          'class="h-card u-url mention" target="_blank">@<span>' +
          "john@example.com</span></a>",
      }),
      new PropertyValue({ name: "Qux", value: "<p>quux</p>" }),
    ],
    tags: [
      new Mention({
        href: new URL("https://example.com/actor/john"),
        name: "@john@example.com",
      }),
    ],
  };
  assertEquals(await bot.getActorProperties(session), expected);
  assertEquals(await bot.getActorProperties(session), expected);
});

interface KeyPair {
  private: JsonWebKey;
  public: JsonWebKey;
}

Deno.test("BotImpl.dispatchActor()", async () => {
  const mentionActor = new Person({
    id: new URL("https://example.com/actor/john"),
    preferredUsername: "john",
  });
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({
    kv,
    username: "test",
    name: "Test Bot",
    summary: text`A summary with a mention: ${mentionActor}.`,
    properties: {
      Foo: strong("bar"),
      Baz: mention(mentionActor),
      Qux: text`quux`,
    },
    icon: new URL("https://example.com/icon.png"),
    image: new URL("https://example.com/image.png"),
  });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assertEquals(await bot.dispatchActor(ctx, "non-existent"), null);
  const actor = await bot.dispatchActor(ctx, "bot");
  assertInstanceOf(actor, Service);
  assertEquals(actor.id, new URL("https://example.com/ap/actor/bot"));
  assertEquals(actor.preferredUsername, "test");
  assertEquals(actor.name, "Test Bot");
  assertEquals(
    actor.summary,
    "<p>A summary with a mention: " +
      '<a href="https://example.com/actor/john" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>john@example.com' +
      "</span></a>.</p>",
  );
  const attachments = await Array.fromAsync(actor.getAttachments());
  assertEquals(attachments.length, 3);
  assertInstanceOf(attachments[0], PropertyValue);
  assertEquals(attachments[0].name, "Foo");
  assertEquals(attachments[0].value, "<strong>bar</strong>");
  assertInstanceOf(attachments[1], PropertyValue);
  assertEquals(attachments[1].name, "Baz");
  assertEquals(
    attachments[1].value,
    '<a href="https://example.com/actor/john" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>' +
      "john@example.com</span></a>",
  );
  assertInstanceOf(attachments[2], PropertyValue);
  assertEquals(attachments[2].name, "Qux");
  assertEquals(attachments[2].value, "<p>quux</p>");
  const tags = await Array.fromAsync(actor.getTags());
  assertEquals(tags.length, 1);
  assertInstanceOf(tags[0], Mention);
  assertEquals(tags[0].href, new URL("https://example.com/actor/john"));
  assertEquals(tags[0].name, "@john@example.com");
  const icon = await actor.getIcon();
  assertInstanceOf(icon, Image);
  assertEquals(icon.url, new URL("https://example.com/icon.png"));
  const image = await actor.getImage();
  assertInstanceOf(image, Image);
  assertEquals(image.url, new URL("https://example.com/image.png"));
  assertEquals(
    actor.inboxId,
    new URL("https://example.com/ap/actor/bot/inbox"),
  );
  assertEquals(
    actor.endpoints?.sharedInbox,
    new URL("https://example.com/ap/inbox"),
  );
  assertEquals(
    actor.followersId,
    new URL("https://example.com/ap/actor/bot/followers"),
  );
  assertEquals(
    actor.outboxId,
    new URL("https://example.com/ap/actor/bot/outbox"),
  );
  const publicKey = await actor.getPublicKey();
  assert(publicKey != null);
  assertEquals(publicKey.ownerId, actor.id);
  assert(publicKey.publicKey != null);
  const keys = await kv.get<KeyPair[]>(bot.kvPrefixes.keyPairs);
  assert(keys != null);
  assertEquals(await exportJwk(publicKey.publicKey), keys[0].public);
  const assertionMethods = await Array.fromAsync(actor.getAssertionMethods());
  assertEquals(assertionMethods.length, 2);
  assertEquals(
    assertionMethods.map((mk) => mk.controllerId),
    [actor.id, actor.id],
  );
  assertEquals(
    await Promise.all(assertionMethods.map((mk) => exportJwk(mk.publicKey!))),
    keys.map((k) => k.public),
  );
});

Deno.test("BotImpl.mapHandle()", () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "username",
  });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assertEquals(bot.mapHandle(ctx, "non-existent"), null);
  assertEquals(bot.mapHandle(ctx, "username"), "bot");
});

Deno.test("BotImpl.dispatchActorKeyPairs()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assertEquals(await bot.dispatchActorKeyPairs(ctx, "non-existent"), []);
  // Generation:
  const keyPairs = await bot.dispatchActorKeyPairs(ctx, "bot");
  const storedKeyPairs = await kv.get<KeyPair[]>(bot.kvPrefixes.keyPairs);
  assertEquals(
    await Promise.all(keyPairs.map(async (pair) => ({
      private: await exportJwk(pair.privateKey),
      public: await exportJwk(pair.publicKey),
    }))),
    storedKeyPairs,
  );
  // Retrieval:
  const keyPairs2 = await bot.dispatchActorKeyPairs(ctx, "bot");
  assertEquals(
    await Promise.all(keyPairs2.map(async (pair) => ({
      private: await exportJwk(pair.privateKey),
      public: await exportJwk(pair.publicKey),
    }))),
    storedKeyPairs,
  );
});

Deno.test("BotImpl.dispatchFollowers()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot", collectionWindow: 2 });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assertEquals(await bot.dispatchFollowers(ctx, "non-existent", null), null);
  assertEquals(await bot.dispatchFollowers(ctx, "non-existent", ""), null);
  const empty = await bot.dispatchFollowers(ctx, "bot", null);
  assertEquals(empty, { items: [], nextCursor: null });

  await kv.set(bot.kvPrefixes.followers, [
    "https://example.com/actor/1",
    "https://example.com/actor/2",
    "https://example.com/actor/3",
  ]);
  await kv.set([...bot.kvPrefixes.followers, "https://example.com/actor/1"], {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Person",
    "id": "https://example.com/actor/1",
    "preferredUsername": "john",
    "inbox": "https://example.com/actor/1/inbox",
  });
  await kv.set([...bot.kvPrefixes.followers, "https://example.com/actor/2"], {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Person",
    "id": "https://example.com/actor/2",
    "preferredUsername": "jane",
    "inbox": "https://example.com/actor/2/inbox",
  });
  await kv.set([...bot.kvPrefixes.followers, "https://example.com/actor/3"], {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Person",
    "id": "https://example.com/actor/3",
    "preferredUsername": "joe",
    "inbox": "https://example.com/actor/3/inbox",
  });
  const full = await bot.dispatchFollowers(ctx, "bot", null);
  assert(full != null);
  assertEquals(full.nextCursor, null);
  assertEquals(full.items.length, 3);
  assertInstanceOf(full.items[0], Person);
  assertEquals(full.items[0].id, new URL("https://example.com/actor/1"));
  assertInstanceOf(full.items[1], Person);
  assertEquals(full.items[1].id, new URL("https://example.com/actor/2"));
  assertInstanceOf(full.items[2], Person);
  assertEquals(full.items[2].id, new URL("https://example.com/actor/3"));

  const firstPage = await bot.dispatchFollowers(ctx, "bot", "");
  assert(firstPage != null);
  assertEquals(firstPage.nextCursor, "https://example.com/actor/3");
  assertEquals(firstPage.items.length, 2);
  assertInstanceOf(firstPage.items[0], Person);
  assertEquals(firstPage.items[0].id, new URL("https://example.com/actor/1"));
  assertInstanceOf(firstPage.items[1], Person);
  assertEquals(firstPage.items[1].id, new URL("https://example.com/actor/2"));

  const lastPage = await bot.dispatchFollowers(
    ctx,
    "bot",
    "https://example.com/actor/3",
  );
  assert(lastPage != null);
  assertEquals(lastPage.nextCursor, null);
  assertEquals(lastPage.items.length, 1);
  assertInstanceOf(lastPage.items[0], Person);
  assertEquals(lastPage.items[0].id, new URL("https://example.com/actor/3"));
});

Deno.test("BotImpl.getFollowersFirstCursor()", () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot", collectionWindow: 2 });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assertEquals(bot.getFollowersFirstCursor(ctx, "non-existent"), null);
  assertEquals(bot.getFollowersFirstCursor(ctx, "bot"), "");
});

Deno.test("BotImpl.countFollowers()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assertEquals(await bot.countFollowers(ctx, "non-existent"), null);
  assertEquals(await bot.countFollowers(ctx, "bot"), 0);
  kv.set(bot.kvPrefixes.followers, [
    "https://example.com/actor/1",
    "https://example.com/actor/2",
    "https://example.com/actor/3",
  ]);
  assertEquals(await bot.countFollowers(ctx, "non-existent"), null);
  assertEquals(await bot.countFollowers(ctx, "bot"), 3);
});

Deno.test("BotImpl.getPermissionChecker()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  const publicPost = new Note({
    to: PUBLIC_COLLECTION,
    cc: new URL("https://example.com/ap/actor/bot/followers"),
  });
  const unlistedPost = new Note({
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
  });
  const followersPost = new Note({
    tos: [
      new URL("https://example.com/ap/actor/bot/followers"),
      new URL("https://example.com/ap/actor/mentioned"),
    ],
  });
  const directPost = new Note({
    to: new URL("https://example.com/ap/actor/mentioned"),
  });
  const anonymous = await bot.getPermissionChecker(ctx);
  assertEquals(anonymous(publicPost), true);
  assertEquals(anonymous(unlistedPost), true);
  assertEquals(anonymous(followersPost), false);
  assertEquals(anonymous(directPost), false);

  const actor = new Person({ id: new URL("https://example.com/actor/john") });
  const ctx2 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  ctx2.getSignedKeyOwner = () => Promise.resolve(actor);
  const nonFollower = await bot.getPermissionChecker(ctx2);
  assertEquals(nonFollower(publicPost), true);
  assertEquals(nonFollower(unlistedPost), true);
  assertEquals(nonFollower(followersPost), false);
  assertEquals(nonFollower(directPost), false);

  kv.set(bot.kvPrefixes.followers, ["https://example.com/actor/john"]);
  kv.set([...bot.kvPrefixes.followers, "https://example.com/actor/john"], {});
  const ctx3 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  ctx3.getSignedKeyOwner = () => Promise.resolve(actor);
  const follower = await bot.getPermissionChecker(ctx3);
  assertEquals(follower(publicPost), true);
  assertEquals(follower(unlistedPost), true);
  assertEquals(follower(followersPost), true);
  assertEquals(follower(directPost), false);

  const mentionedActor = new Person({
    id: new URL("https://example.com/ap/actor/mentioned"),
  });
  const ctx4 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  ctx4.getSignedKeyOwner = () => Promise.resolve(mentionedActor);
  const mentioned = await bot.getPermissionChecker(ctx4);
  assertEquals(mentioned(publicPost), true);
  assertEquals(mentioned(unlistedPost), true);
  assertEquals(mentioned(followersPost), true);
  assertEquals(mentioned(directPost), true);
});

Deno.test("BotImpl.dispatchOutbox()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot", collectionWindow: 2 });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assertEquals(await bot.dispatchOutbox(ctx, "non-existent", null), null);
  assertEquals(await bot.dispatchOutbox(ctx, "non-existent", ""), null);
  assertEquals(await bot.dispatchOutbox(ctx, "bot", null), {
    items: [],
    nextCursor: null,
  });
  assertEquals(await bot.dispatchOutbox(ctx, "bot", ""), {
    items: [],
    nextCursor: null,
  });

  await kv.set(bot.kvPrefixes.messages, [
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    "46442170-836d-4a0d-9142-f31242abe2f9",
    "8386a4c7-06f8-409f-ad72-2bba43e83363",
  ]);
  await kv.set(
    [...bot.kvPrefixes.messages, "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      "object": {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Note",
        "id": "https://example.com/ap/actor/bot/note/1",
        "attributedTo": "https://example.com/ap/actor/bot",
        "to": "https://www.w3.org/ns/activitystreams#Public",
        "cc": "https://example.com/ap/actor/bot/followers",
        "content": "Hello, world!",
      },
    },
  );
  await kv.set(
    [...bot.kvPrefixes.messages, "46442170-836d-4a0d-9142-f31242abe2f9"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/actor/bot/create/46442170-836d-4a0d-9142-f31242abe2f9",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      "object": {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Note",
        "id": "https://example.com/ap/actor/bot/note/2",
        "attributedTo": "https://example.com/ap/actor/bot",
        "to": "https://www.w3.org/ns/activitystreams#Public",
        "cc": "https://example.com/ap/actor/bot/followers",
        "content": "Hello, followers!",
      },
    },
  );
  await kv.set(
    [...bot.kvPrefixes.messages, "8386a4c7-06f8-409f-ad72-2bba43e83363"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://example.com/ap/actor/john",
      "object": {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Note",
        "id": "https://example.com/ap/actor/bot/note/3",
        "attributedTo": "https://example.com/ap/actor/bot",
        "to": "https://example.com/ap/actor/john",
        "content": "Hello, followers!",
      },
    },
  );
  assertEquals(await bot.dispatchOutbox(ctx, "non-existent", null), null);
  assertEquals(await bot.dispatchOutbox(ctx, "non-existent", ""), null);
  const anonymous1 = await bot.dispatchOutbox(ctx, "bot", "");
  assert(anonymous1 != null);
  assertEquals(anonymous1.nextCursor, "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e");
  assertEquals(anonymous1.items.length, 1);
  assertInstanceOf(anonymous1.items[0], Create);
  assertEquals(
    anonymous1.items[0].id,
    new URL(
      "https://example.com/ap/actor/bot/create/46442170-836d-4a0d-9142-f31242abe2f9",
    ),
  );

  const anonymous2 = await bot.dispatchOutbox(
    ctx,
    "bot",
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
  );
  assert(anonymous2 != null);
  assertEquals(anonymous2.nextCursor, null);
  assertEquals(anonymous2.items.length, 1);
  assertInstanceOf(anonymous2.items[0], Create);
  assertEquals(
    anonymous2.items[0].id,
    new URL(
      "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    ),
  );

  const ctx2 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  const actor = new Person({
    id: new URL("https://example.com/ap/actor/john"),
  });
  ctx2.getSignedKeyOwner = () => Promise.resolve(actor);
  const mentioned = await bot.dispatchOutbox(ctx2, "bot", null);
  assert(mentioned != null);
  assertEquals(mentioned.nextCursor, null);
  assertEquals(mentioned.items.length, 3);
  assertInstanceOf(mentioned.items[0], Create);
  assertEquals(
    mentioned.items[0].id,
    new URL(
      "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
    ),
  );
  assertInstanceOf(mentioned.items[1], Create);
  assertEquals(
    mentioned.items[1].id,
    new URL(
      "https://example.com/ap/actor/bot/create/46442170-836d-4a0d-9142-f31242abe2f9",
    ),
  );
  assertInstanceOf(mentioned.items[2], Create);
  assertEquals(
    mentioned.items[2].id,
    new URL(
      "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    ),
  );
});

Deno.test("BotImpl.getOutboxFirstCursor()", () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const ctx = bot.federation.createContext(
    new URL("https://example.com/"),
    undefined,
  );
  assertEquals(bot.getOutboxFirstCursor(ctx, "non-existent"), null);
  assertEquals(bot.getOutboxFirstCursor(ctx, "bot"), "");
});

Deno.test("BotImpl.countOutbox()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assertEquals(await bot.countOutbox(ctx, "non-existent"), null);
  assertEquals(await bot.countOutbox(ctx, "bot"), 0);

  await kv.set(bot.kvPrefixes.messages, [
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    "46442170-836d-4a0d-9142-f31242abe2f9",
    "8386a4c7-06f8-409f-ad72-2bba43e83363",
  ]);
  assertEquals(await bot.countOutbox(ctx, "non-existent"), null);
  assertEquals(await bot.countOutbox(ctx, "bot"), 3);
});

Deno.test("BotImpl.dispatchFollow()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assertEquals(
    await bot.dispatchFollow(ctx, { id: crypto.randomUUID() }),
    null,
  );

  await kv.set(
    [...bot.kvPrefixes.follows, "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Follow",
      id: "https://example.com/ap/follow/b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
      actor: "https://example.com/ap/actor/bot",
      object: "https://example.com/ap/actor/john",
      to: "https://example.com/ap/actor/john",
    },
  );
  const follow = await bot.dispatchFollow(ctx, {
    id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
  });
  assertInstanceOf(follow, Follow);
  assertEquals(
    follow.id,
    new URL(
      "https://example.com/ap/follow/b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
    ),
  );
  assertEquals(follow.actorId, new URL("https://example.com/ap/actor/bot"));
  assertEquals(follow.objectId, new URL("https://example.com/ap/actor/john"));
  assertEquals(follow.toId, new URL("https://example.com/ap/actor/john"));
});

Deno.test("BotImpl.authorizeFollow()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  await kv.set(
    [...bot.kvPrefixes.follows, "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Follow",
      id: "https://example.com/ap/follow/b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
      actor: "https://example.com/ap/actor/bot",
      object: "https://example.com/ap/actor/john",
      to: "https://example.com/ap/actor/john",
    },
  );
  assert(
    await bot.authorizeFollow(
      ctx,
      { id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
      new CryptographicKey({}),
      new Person({ id: new URL("https://example.com/ap/actor/john") }),
    ),
  );
  assert(
    await bot.authorizeFollow(
      ctx,
      { id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
      new CryptographicKey({}),
      await new SessionImpl(bot, ctx).getActor(),
    ),
  );
  assertFalse(
    await bot.authorizeFollow(
      ctx,
      { id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
      new CryptographicKey({}),
      new Person({ id: new URL("https://example.com/ap/actor/alice") }),
    ),
  );
  assertFalse(
    await bot.authorizeFollow(
      ctx,
      { id: crypto.randomUUID() },
      new CryptographicKey({}),
      new Person({ id: new URL("https://example.com/ap/actor/john") }),
    ),
  );
});

Deno.test("BotImpl.dispatchCreate()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assertEquals(await bot.dispatchCreate(ctx, { id: "non-existent" }), null);

  await kv.set(
    [...bot.kvPrefixes.messages, "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      "object": {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Note",
        "id": "https://example.com/ap/actor/bot/note/1",
        "attributedTo": "https://example.com/ap/actor/bot",
        "to": "https://www.w3.org/ns/activitystreams#Public",
        "cc": "https://example.com/ap/actor/bot/followers",
        "content": "Hello, world!",
      },
    },
  );
  const create = await bot.dispatchCreate(ctx, {
    id: "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
  });
  assertInstanceOf(create, Create);
  assertEquals(
    create.id,
    new URL(
      "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    ),
  );
  const ctx2 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  const actor = new Person({
    id: new URL("https://example.com/ap/actor/john"),
  });
  ctx2.getSignedKeyOwner = () => Promise.resolve(actor);
  assertEquals(
    await bot.dispatchCreate(ctx2, {
      id: "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    }),
    create,
  );

  await kv.set(
    [...bot.kvPrefixes.messages, "8386a4c7-06f8-409f-ad72-2bba43e83363"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://example.com/ap/actor/john",
      "object": {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Note",
        "id": "https://example.com/ap/actor/bot/note/3",
        "attributedTo": "https://example.com/ap/actor/bot",
        "to": "https://example.com/ap/actor/john",
        "content": "Hello, followers!",
      },
    },
  );
  assertEquals(
    await bot.dispatchCreate(ctx, {
      id: "8386a4c7-06f8-409f-ad72-2bba43e83363",
    }),
    null,
  );
  const create2 = await bot.dispatchCreate(ctx2, {
    id: "8386a4c7-06f8-409f-ad72-2bba43e83363",
  });
  assertInstanceOf(create2, Create);
  assertEquals(
    create2.id,
    new URL(
      "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
    ),
  );

  await kv.set(
    [...bot.kvPrefixes.messages, "ce8081ac-f238-484b-9a70-5d8a4b66d829"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Announce",
      "id":
        "https://example.com/ap/actor/bot/announce/ce8081ac-f238-484b-9a70-5d8a4b66d829",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      "object": "https://example.com/ap/actor/bot/note/2",
    },
  );
  assertEquals(
    await bot.dispatchCreate(ctx, {
      id: "ce8081ac-f238-484b-9a70-5d8a4b66d829",
    }),
    null,
  );
});

Deno.test("BotImpl.dispatchMessage()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assertEquals(await bot.dispatchMessage(Note, ctx, "non-existent"), null);

  await kv.set(
    [...bot.kvPrefixes.messages, "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      "object": {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Note",
        "id": "https://example.com/ap/actor/bot/note/1",
        "attributedTo": "https://example.com/ap/actor/bot",
        "to": "https://www.w3.org/ns/activitystreams#Public",
        "cc": "https://example.com/ap/actor/bot/followers",
        "content": "Hello, world!",
      },
    },
  );
  const note = await bot.dispatchMessage(
    Note,
    ctx,
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
  );
  assertInstanceOf(note, Note);
  assertEquals(note.id, new URL("https://example.com/ap/actor/bot/note/1"));

  const ctx2 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  const actor = new Person({
    id: new URL("https://example.com/ap/actor/john"),
  });
  ctx2.getSignedKeyOwner = () => Promise.resolve(actor);
  assertEquals(
    await bot.dispatchMessage(
      Note,
      ctx2,
      "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    ),
    note,
  );

  assertEquals(
    await bot.dispatchMessage(
      Article,
      ctx,
      "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    ),
    null,
  );

  await kv.set(
    [...bot.kvPrefixes.messages, "8386a4c7-06f8-409f-ad72-2bba43e83363"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://example.com/ap/actor/john",
      "object": {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Note",
        "id": "https://example.com/ap/actor/bot/note/3",
        "attributedTo": "https://example.com/ap/actor/bot",
        "to": "https://example.com/ap/actor/john",
        "content": "Hello, followers!",
      },
    },
  );
  assertEquals(
    await bot.dispatchMessage(
      Note,
      ctx,
      "8386a4c7-06f8-409f-ad72-2bba43e83363",
    ),
    null,
  );
  const note2 = await bot.dispatchMessage(
    Note,
    ctx2,
    "8386a4c7-06f8-409f-ad72-2bba43e83363",
  );
  assertInstanceOf(note2, Note);
  assertEquals(note2.id, new URL("https://example.com/ap/actor/bot/note/3"));

  await kv.set(
    [...bot.kvPrefixes.messages, "ce8081ac-f238-484b-9a70-5d8a4b66d829"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Announce",
      "id":
        "https://example.com/ap/actor/bot/announce/ce8081ac-f238-484b-9a70-5d8a4b66d829",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      "object": "https://example.com/ap/actor/bot/note/2",
    },
  );
  assertEquals(
    await bot.dispatchMessage(
      Note,
      ctx,
      "ce8081ac-f238-484b-9a70-5d8a4b66d829",
    ),
    null,
  );
});

Deno.test("BotImpl.dispatchAnnounce()", async () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assertEquals(await bot.dispatchAnnounce(ctx, { id: "non-existent" }), null);

  await kv.set(
    [...bot.kvPrefixes.messages, "ce8081ac-f238-484b-9a70-5d8a4b66d829"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Announce",
      "id":
        "https://example.com/ap/actor/bot/announce/ce8081ac-f238-484b-9a70-5d8a4b66d829",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      "object": "https://example.com/ap/actor/bot/note/2",
    },
  );
  const announce = await bot.dispatchAnnounce(ctx, {
    id: "ce8081ac-f238-484b-9a70-5d8a4b66d829",
  });
  assertInstanceOf(announce, Announce);
  assertEquals(
    announce.id,
    new URL(
      "https://example.com/ap/actor/bot/announce/ce8081ac-f238-484b-9a70-5d8a4b66d829",
    ),
  );

  await kv.set(
    [...bot.kvPrefixes.messages, "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Create",
      "id":
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://www.w3.org/ns/activitystreams#Public",
      "cc": "https://example.com/ap/actor/bot/followers",
      "object": {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Note",
        "id": "https://example.com/ap/actor/bot/note/1",
        "attributedTo": "https://example.com/ap/actor/bot",
        "to": "https://www.w3.org/ns/activitystreams#Public",
        "cc": "https://example.com/ap/actor/bot/followers",
        "content": "Hello, world!",
      },
    },
  );
  assertEquals(
    await bot.dispatchAnnounce(ctx, {
      id: "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    }),
    null,
  );

  await kv.set(
    [...bot.kvPrefixes.messages, "d4a7ef9b-682c-4de9-b23c-87747d6725cb"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Announce",
      "id":
        "https://example.com/ap/actor/bot/announce/d4a7ef9b-682c-4de9-b23c-87747d6725cb",
      "actors": ["https://example.com/ap/actor/bot"],
      "to": "https://example.com/ap/actor/john",
      "object": "https://example.com/ap/actor/bot/note/2",
    },
  );
  assertEquals(
    await bot.dispatchAnnounce(ctx, {
      id: "d4a7ef9b-682c-4de9-b23c-87747d6725cb",
    }),
    null,
  );
  const ctx2 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  const actor = new Person({
    id: new URL("https://example.com/ap/actor/john"),
  });
  ctx2.getSignedKeyOwner = () => Promise.resolve(actor);
  const announce2 = await bot.dispatchAnnounce(ctx2, {
    id: "d4a7ef9b-682c-4de9-b23c-87747d6725cb",
  });
  assertInstanceOf(announce2, Announce);
  assertEquals(
    announce2.id,
    new URL(
      "https://example.com/ap/actor/bot/announce/d4a7ef9b-682c-4de9-b23c-87747d6725cb",
    ),
  );
});

Deno.test("BotImpl.dispatchSharedKey()", () => {
  const identifier = crypto.randomUUID();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
    identifier,
  });
  const ctx = bot.federation.createContext(new URL("https://example.com"));
  assertEquals(bot.dispatchSharedKey(ctx), { identifier });
});

Deno.test("BotImpl.onFollowed()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const followed: [Session<void>, Actor][] = [];
  bot.onFollow = (session, actor) => void (followed.push([session, actor]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  await t.step("without actor", async () => {
    const followWithoutActor = new Follow({
      id: new URL("https://example.com/ap/actor/john/follows/bot"),
      object: new URL("https://example.com/ap/actor/bot"),
    });
    await bot.onFollowed(ctx, followWithoutActor);
    assertEquals(await kv.get(bot.kvPrefixes.followers), undefined);
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followRequests,
        "https://example.com/ap/actor/john/follows/bot",
      ]),
      undefined,
    );
  });

  await t.step("with wrong actor", async () => {
    const followWithWrongActor = new Follow({
      id: new URL("https://example.com/ap/actor/bot/follows/bot"),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new URL("https://example.com/ap/actor/bot"),
    });
    await bot.onFollowed(ctx, followWithWrongActor);
    assertEquals(await kv.get(bot.kvPrefixes.followers), undefined);
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followers,
        "https://example.com/ap/actor/bot",
      ]),
      undefined,
    );
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followRequests,
        "https://example.com/ap/actor/john/follows/bot",
      ]),
      undefined,
    );
  });

  const actor = new Person({
    id: new URL("https://example.com/ap/actor/john"),
    preferredUsername: "john",
  });

  await t.step("with wrong recipient", async () => {
    const followWithWrongRecipient = new Follow({
      id: new URL("https://example.com/ap/actor/john/follows/bot"),
      actor,
      object: new URL("https://example.com/ap/actor/non-existent"),
    });
    await bot.onFollowed(ctx, followWithWrongRecipient);
    assertEquals(await kv.get(bot.kvPrefixes.followers), undefined);
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followers,
        "https://example.com/ap/actor/john",
      ]),
      undefined,
    );
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followRequests,
        "https://example.com/ap/actor/john/follows/bot",
      ]),
      undefined,
    );
  });

  await t.step("with correct follow", async () => {
    const follow = new Follow({
      id: new URL("https://example.com/ap/actor/john/follows/bot"),
      actor,
      object: new URL("https://example.com/ap/actor/bot"),
    });
    await bot.onFollowed(ctx, follow);
    assertEquals(await kv.get(bot.kvPrefixes.followers), [
      "https://example.com/ap/actor/john",
    ]);
    const storedFollower = await kv.get([
      ...bot.kvPrefixes.followers,
      "https://example.com/ap/actor/john",
    ]);
    assertNotEquals(storedFollower, undefined);
    const deserializedFollower = await Object.fromJsonLd(storedFollower);
    assertInstanceOf(deserializedFollower, Person);
    assertEquals(deserializedFollower.id, actor.id);
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followRequests,
        "https://example.com/ap/actor/john/follows/bot",
      ]),
      "https://example.com/ap/actor/john",
    );
    assertEquals(ctx.sentActivities.length, 1);
    const { activity, recipients } = ctx.sentActivities[0];
    assertInstanceOf(activity, Accept);
    assertEquals(activity.actorId, new URL("https://example.com/ap/actor/bot"));
    assertEquals(activity.objectId, follow.id);
    assertEquals(recipients.length, 1);
    assertEquals(recipients[0], actor);
    assertEquals(ctx.forwardedRecipients, []);
    assertEquals(followed.length, 1);
    const [session, followerActor] = followed[0];
    assertEquals(session.bot, bot);
    assertEquals(session.context, ctx);
    assertInstanceOf(followerActor, Person);
    assertEquals(followerActor.id, actor.id);
  });
});

Deno.test("BotImpl.onUnfollowed()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const unfollowed: [Session<void>, Actor][] = [];
  bot.onUnfollow = (session, actor) => void (unfollowed.push([session, actor]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  await kv.set(bot.kvPrefixes.followers, ["https://example.com/ap/actor/john"]);
  await kv.set(
    [...bot.kvPrefixes.followers, "https://example.com/ap/actor/john"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Person",
      "id": "https://example.com/ap/actor/john",
      "preferredUsername": "john",
    },
  );
  await kv.set(
    [
      ...bot.kvPrefixes.followRequests,
      "https://example.com/ap/actor/john/follows/bot",
    ],
    "https://example.com/ap/actor/john",
  );

  async function assertNoEffect() {
    assertEquals(await kv.get(bot.kvPrefixes.followers), [
      "https://example.com/ap/actor/john",
    ]);
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followers,
        "https://example.com/ap/actor/john",
      ]),
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        "type": "Person",
        "id": "https://example.com/ap/actor/john",
        "preferredUsername": "john",
      },
    );
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followRequests,
        "https://example.com/ap/actor/john/follows/bot",
      ]),
      "https://example.com/ap/actor/john",
    );
    assertEquals(ctx.sentActivities, []);
    assertEquals(ctx.forwardedRecipients, []);
    assertEquals(unfollowed, []);
  }

  await t.step("without Follow object", async () => {
    const undo = new Undo({
      actor: new URL("https://example.com/ap/actor/john"),
    });
    await bot.onUnfollowed(ctx, undo);
    await assertNoEffect();
  });

  await t.step("without Follow.id", async () => {
    const undo = new Undo({
      actor: new URL("https://example.com/ap/actor/john"),
      object: new Follow({}),
    });
    await bot.onUnfollowed(ctx, undo);
    await assertNoEffect();
  });

  await t.step("with non-existent Follow.id", async () => {
    const undo = new Undo({
      actor: new URL("https://example.com/ap/actor/john"),
      object: new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/non-existent"),
      }),
    });
    await bot.onUnfollowed(ctx, undo);
    await assertNoEffect();
  });

  await t.step("with incorrect Follow.actorId", async () => {
    const undo = new Undo({
      actor: new URL("https://example.com/ap/actor/wrong-actor"),
      object: new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/bot"),
      }),
    });
    await bot.onUnfollowed(ctx, undo);
    await assertNoEffect();
  });

  await t.step("with correct Follow object", async () => {
    const undo = new Undo({
      actor: new Person({
        id: new URL("https://example.com/ap/actor/john"),
        preferredUsername: "john",
      }),
      object: new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/bot"),
      }),
    });
    await bot.onUnfollowed(ctx, undo);
    assertEquals(await kv.get(bot.kvPrefixes.followers), []);
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followers,
        "https://example.com/ap/actor/john",
      ]),
      undefined,
    );
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.followRequests,
        "https://example.com/ap/actor/john/follows/bot",
      ]),
      undefined,
    );
    assertEquals(ctx.sentActivities, []);
    assertEquals(ctx.forwardedRecipients, []);
    assertEquals(unfollowed.length, 1);
    const [session, follower] = unfollowed[0];
    assertEquals(session.bot, bot);
    assertEquals(session.context, ctx);
    assertInstanceOf(follower, Person);
    assertEquals(follower.id, new URL("https://example.com/ap/actor/john"));
  });
});

Deno.test("BotImpl.onAccepted()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const accepted: [Session<void>, Actor][] = [];
  bot.onAccept = (session, actor) => void (accepted.push([session, actor]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  await t.step("without object", async () => {
    await bot.onAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
      }),
    );
    assertEquals(accepted, []);
  });

  await t.step("with invalid object URI", async () => {
    await bot.onAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL("https://example.com/"),
      }),
    );
    assertEquals(accepted, []);
  });

  await t.step("with non-existent object", async () => {
    await bot.onAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(`https://example.com/ap/follow/${crypto.randomUUID()}`),
      }),
    );
    assertEquals(accepted, []);
  });

  await t.step("with non-actor", async () => {
    await kv.set(
      [...bot.kvPrefixes.follows, "2ca58e2a-a34a-43e6-81af-c4f21ffed0c5"],
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Follow",
        id:
          "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
        actor: "https://example.com/ap/actor/bot",
        object: {
          type: "Note",
        },
      },
    );
    await bot.onAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
        ),
      }),
    );
    assertEquals(accepted, []);
  });

  await t.step("with actor without URI", async () => {
    await kv.set(
      [...bot.kvPrefixes.follows, "a99ff3bf-72a2-412b-83b9-cba894d38805"],
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Follow",
        id:
          "https://example.com/ap/follow/a99ff3bf-72a2-412b-83b9-cba894d38805",
        actor: "https://example.com/ap/actor/bot",
        object: {
          type: "Person",
          preferredUsername: "john",
        },
      },
    );
    await bot.onAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/a99ff3bf-72a2-412b-83b9-cba894d38805",
        ),
      }),
    );
    assertEquals(accepted, []);
  });

  await t.step("with actor", async () => {
    await kv.set(
      [...bot.kvPrefixes.follows, "3bca0b8e-503a-47ea-ad69-6b7c29369fbd"],
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Follow",
        id:
          "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
        actor: "https://example.com/ap/actor/bot",
        object: {
          type: "Person",
          id: "https://example.com/ap/actor/john",
          preferredUsername: "john",
        },
      },
    );
    await bot.onAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
        ),
      }),
    );
    assertEquals(accepted.length, 1);
    const [session, actor] = accepted[0];
    assertEquals(session.bot, bot);
    assertEquals(session.context, ctx);
    assertInstanceOf(actor, Person);
    assertEquals(actor.id, new URL("https://example.com/ap/actor/john"));
    const followJson = await kv.get([
      ...bot.kvPrefixes.followees,
      "https://example.com/ap/actor/john",
    ]);
    assert(followJson != null);
    const follow = await Follow.fromJsonLd(followJson);
    assertInstanceOf(follow, Follow);
    assertEquals(
      follow.id,
      new URL(
        "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
      ),
    );
    assertEquals(follow.objectId, actor.id);
  });
});

Deno.test("BotImpl.onRejected()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  const rejected: [Session<void>, Actor][] = [];
  bot.onReject = (session, actor) => void (rejected.push([session, actor]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  await t.step("without object", async () => {
    await bot.onRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
      }),
    );
    assertEquals(rejected, []);
  });

  await t.step("with invalid object URI", async () => {
    await bot.onRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL("https://example.com/"),
      }),
    );
    assertEquals(rejected, []);
  });

  await t.step("with non-existent object", async () => {
    await bot.onRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(`https://example.com/ap/follow/${crypto.randomUUID()}`),
      }),
    );
    assertEquals(rejected, []);
  });

  await t.step("with non-actor", async () => {
    await kv.set(
      [...bot.kvPrefixes.follows, "2ca58e2a-a34a-43e6-81af-c4f21ffed0c5"],
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Follow",
        id:
          "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
        actor: "https://example.com/ap/actor/bot",
        object: {
          type: "Note",
        },
      },
    );
    await bot.onRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
        ),
      }),
    );
    assertEquals(rejected, []);
  });

  await t.step("with actor without URI", async () => {
    await kv.set(
      [...bot.kvPrefixes.follows, "a99ff3bf-72a2-412b-83b9-cba894d38805"],
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Follow",
        id:
          "https://example.com/ap/follow/a99ff3bf-72a2-412b-83b9-cba894d38805",
        actor: "https://example.com/ap/actor/bot",
        object: {
          type: "Person",
          preferredUsername: "john",
        },
      },
    );
    await bot.onRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/a99ff3bf-72a2-412b-83b9-cba894d38805",
        ),
      }),
    );
    assertEquals(rejected, []);
  });

  await t.step("with actor", async () => {
    await kv.set(
      [...bot.kvPrefixes.follows, "3bca0b8e-503a-47ea-ad69-6b7c29369fbd"],
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Follow",
        id:
          "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
        actor: "https://example.com/ap/actor/bot",
        object: {
          type: "Person",
          id: "https://example.com/ap/actor/john",
          preferredUsername: "john",
        },
      },
    );
    await bot.onRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
        ),
      }),
    );
    assertEquals(rejected.length, 1);
    const [session, actor] = rejected[0];
    assertEquals(session.bot, bot);
    assertEquals(session.context, ctx);
    assertInstanceOf(actor, Person);
    assertEquals(actor.id, new URL("https://example.com/ap/actor/john"));
    assertEquals(
      await kv.get([
        ...bot.kvPrefixes.follows,
        "3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
      ]),
      undefined,
    );
  });
});

Deno.test("BotImpl.onCreated()", async (t) => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot" });
  let replied: [Session<void>, Message<MessageClass, void>][] = [];
  bot.onReply = (session, msg) => void (replied.push([session, msg]));
  let mentioned: [Session<void>, Message<MessageClass, void>][] = [];
  bot.onMention = (session, msg) => void (mentioned.push([session, msg]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  await t.step("without object", async () => {
    const createWithoutObject = new Create({
      actor: new URL("https://example.com/ap/actor/john"),
    });
    await bot.onCreated(ctx, createWithoutObject);
    assertEquals(replied, []);
    assertEquals(mentioned, []);
    assertEquals(ctx.sentActivities, []);
    assertEquals(ctx.forwardedRecipients, []);
  });

  await t.step("with non-message object", async () => {
    const createWithNonMessageObject = new Create({
      actor: new URL("https://example.com/ap/actor/john"),
      object: new Place({}),
    });
    await bot.onCreated(ctx, createWithNonMessageObject);
    assertEquals(replied, []);
    assertEquals(mentioned, []);
    assertEquals(ctx.sentActivities, []);
    assertEquals(ctx.forwardedRecipients, []);
  });

  await kv.set(
    bot.kvPrefixes.messages,
    ["a6358f1b-c978-49d3-8065-37a1df6168de"],
  );
  await kv.set(
    [...bot.kvPrefixes.messages, "a6358f1b-c978-49d3-8065-37a1df6168de"],
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Create",
      id: "https://example.com/ap/create/a6358f1b-c978-49d3-8065-37a1df6168de",
      actor: "https://example.com/ap/actor/bot",
      to: "https://www.w3.org/ns/activitystreams#Public",
      cc: "https://example.com/ap/actor/bot/followers",
      object: {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Note",
        id: "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
        attributedTo: "https://example.com/ap/actor/bot",
        to: "https://www.w3.org/ns/activitystreams#Public",
        cc: "https://example.com/ap/actor/bot/followers",
        content: "Hello, world!",
      },
    },
  );

  await t.step("on reply", async () => {
    const create = new Create({
      id: new URL(
        "https://example.com/ap/create/9cfd7129-4cf0-4505-90d8-3cac2dc42434",
      ),
      actor: new URL("https://example.com/ap/actor/john"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/john/followers"),
      object: new Note({
        id: new URL(
          "https://example.com/ap/note/9cfd7129-4cf0-4505-90d8-3cac2dc42434",
        ),
        attribution: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/john/followers"),
        content: "It's reply!",
        replyTarget: new URL(
          "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
        ),
      }),
    });
    await bot.onCreated(ctx, create);
    assertEquals(replied.length, 1);
    const [session, msg] = replied[0];
    assertEquals(session.bot, bot);
    assertEquals(session.context, ctx);
    assertInstanceOf(msg.raw, Note);
    assertEquals(msg.raw.id, create.objectId);
    assert(msg.replyTarget != null);
    assertEquals(
      msg.replyTarget.id,
      new URL(
        "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
      ),
    );
    assertEquals(mentioned, []);
    assertEquals(ctx.sentActivities, []);
    assertEquals(ctx.forwardedRecipients, ["followers"]);
  });

  replied = [];
  ctx.forwardedRecipients = [];

  await t.step("on mention", async () => {
    const create = new Create({
      id: new URL(
        "https://example.com/ap/create/9cfd7129-4cf0-4505-90d8-3cac2dc42434",
      ),
      actor: new URL("https://example.com/ap/actor/john"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/john/followers"),
      object: new Note({
        id: new URL(
          "https://example.com/ap/note/9cfd7129-4cf0-4505-90d8-3cac2dc42434",
        ),
        attribution: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/john/followers"),
        content:
          '<p><a href="https://example.com/ap/actor/bot">@bot</a> Hey!</p>',
        tags: [
          new Mention({
            href: new URL("https://example.com/ap/actor/bot"),
            name: "@bot",
          }),
        ],
      }),
    });
    await bot.onCreated(ctx, create);
    assertEquals(replied, []);
    assertEquals(mentioned.length, 1);
    const [session, msg] = mentioned[0];
    assertEquals(session.bot, bot);
    assertEquals(session.context, ctx);
    assertInstanceOf(msg.raw, Note);
    assertEquals(msg.raw.id, create.objectId);
    assertEquals(msg.mentions.length, 1);
    assertEquals(
      msg.mentions[0].id,
      new URL("https://example.com/ap/actor/bot"),
    );
    assertEquals(ctx.sentActivities, []);
    assertEquals(ctx.forwardedRecipients, []);
  });

  mentioned = [];
});

Deno.test("BotImpl.dispatchNodeInfo()", () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
    software: {
      name: "test",
      version: parseSemVer("1.2.3"),
      homepage: new URL("https://example.com/"),
      repository: new URL("https://git.example.com/"),
    },
  });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assertEquals(bot.dispatchNodeInfo(ctx), {
    software: {
      name: "test",
      version: parseSemVer("1.2.3"),
      homepage: new URL("https://example.com/"),
      repository: new URL("https://git.example.com/"),
    },
    protocols: ["activitypub"],
    services: {
      outbound: ["atom1.0"],
    },
    usage: {
      users: {
        total: 1,
        activeMonth: 1,
        activeHalfyear: 1,
      },
      localPosts: 0,
      localComments: 0,
    },
  });
});

Deno.test("BotImpl.fetch()", async () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const request = new Request(
    "http://localhost/.well-known/webfinger?resource=acct:bot@example.com",
    {
      headers: {
        "X-Forwarded-Host": "example.com",
        "X-Forwarded-Proto": "https",
      },
    },
  );
  const response = await bot.fetch(request);
  assertEquals(response.status, 404);

  const botBehindProxy = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
    behindProxy: true,
  });
  const response2 = await botBehindProxy.fetch(request);
  assertEquals(response2.status, 200);
});

interface SentActivity {
  recipients: "followers" | Recipient[];
  activity: Activity;
}

interface MockInboxContext extends InboxContext<void> {
  sentActivities: SentActivity[];
  forwardedRecipients: ("followers" | Recipient)[];
}

function createMockInboxContext(
  bot: BotImpl<void>,
  origin: string | URL,
  recipient?: string | null,
): MockInboxContext {
  const ctx = bot.federation.createContext(
    new URL(origin),
    undefined,
  ) as MockInboxContext;
  ctx.recipient = recipient ?? null;
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
  ctx.forwardedRecipients = [];
  ctx.forwardActivity = (_, recipients) => {
    if (recipients === "followers") {
      ctx.forwardedRecipients.push("followers");
    } else if (Array.isArray(recipients)) {
      ctx.forwardedRecipients.push(...recipients);
    } else {
      ctx.forwardedRecipients.push(recipients);
    }
    return Promise.resolve();
  };
  return ctx;
}
