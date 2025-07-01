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
import {
  Accept,
  type Activity,
  type Actor,
  Announce,
  Article,
  Collection,
  Create,
  CryptographicKey,
  Emoji,
  EmojiReact,
  Follow,
  Image,
  Like as RawLike,
  Mention,
  Note,
  Person,
  Place,
  PropertyValue,
  PUBLIC_COLLECTION,
  Question,
  type Recipient,
  Reject,
  Service,
  Undo,
  Update,
} from "@fedify/fedify/vocab";
import assert from "node:assert";
import { describe, test } from "node:test";
import { BotImpl } from "./bot-impl.ts";
import { parseSemVer } from "./bot.ts";
import type { CustomEmoji } from "./emoji.ts";
import type { FollowRequest } from "./follow.ts";
import type { Message, MessageClass, SharedMessage } from "./message.ts";
import type { Vote } from "./poll.ts";
import type { Like, Reaction } from "./reaction.ts";
import { MemoryRepository } from "./repository.ts";
import { SessionImpl } from "./session-impl.ts";
import type { Session } from "./session.ts";
import { mention, strong, text } from "./text.ts";

describe("BotImpl.getActorSummary()", () => {
  test("without summary", async () => {
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      username: "bot",
    });
    const session = bot.getSession("https://example.com");
    assert.deepStrictEqual(await bot.getActorSummary(session), null);
  });

  test("with summary", async () => {
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
    assert.deepStrictEqual(await bot.getActorSummary(session), expected);
    assert.deepStrictEqual(await bot.getActorSummary(session), expected);
  });
});

test("BotImpl.getActorProperties()", async () => {
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
  assert.deepStrictEqual(await bot.getActorProperties(session), expected);
  assert.deepStrictEqual(await bot.getActorProperties(session), expected);
});

interface KeyPair {
  private: JsonWebKey;
  public: JsonWebKey;
}

test("BotImpl.dispatchActor()", async () => {
  const mentionActor = new Person({
    id: new URL("https://example.com/actor/john"),
    preferredUsername: "john",
  });
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
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
  assert.deepStrictEqual(await bot.dispatchActor(ctx, "non-existent"), null);
  const actor = await bot.dispatchActor(ctx, "bot");
  assert.ok(actor instanceof Service);
  assert.deepStrictEqual(actor.id, new URL("https://example.com/ap/actor/bot"));
  assert.deepStrictEqual(actor.preferredUsername, "test");
  assert.deepStrictEqual(actor.name, "Test Bot");
  assert.deepStrictEqual(
    actor.summary,
    "<p>A summary with a mention: " +
      '<a href="https://example.com/actor/john" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>john@example.com' +
      "</span></a>.</p>",
  );
  const attachments = await Array.fromAsync(actor.getAttachments());
  assert.deepStrictEqual(attachments.length, 3);
  assert.ok(attachments[0] instanceof PropertyValue);
  assert.deepStrictEqual(attachments[0].name, "Foo");
  assert.deepStrictEqual(attachments[0].value, "<strong>bar</strong>");
  assert.ok(attachments[1] instanceof PropertyValue);
  assert.deepStrictEqual(attachments[1].name, "Baz");
  assert.deepStrictEqual(
    attachments[1].value,
    '<a href="https://example.com/actor/john" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>' +
      "john@example.com</span></a>",
  );
  assert.ok(attachments[2] instanceof PropertyValue);
  assert.deepStrictEqual(attachments[2].name, "Qux");
  assert.deepStrictEqual(attachments[2].value, "<p>quux</p>");
  const tags = await Array.fromAsync(actor.getTags());
  assert.deepStrictEqual(tags.length, 1);
  assert.ok(tags[0] instanceof Mention);
  assert.deepStrictEqual(
    tags[0].href,
    new URL("https://example.com/actor/john"),
  );
  assert.deepStrictEqual(tags[0].name, "@john@example.com");
  const icon = await actor.getIcon();
  assert.ok(icon instanceof Image);
  assert.deepStrictEqual(icon.url, new URL("https://example.com/icon.png"));
  const image = await actor.getImage();
  assert.ok(image instanceof Image);
  assert.deepStrictEqual(image.url, new URL("https://example.com/image.png"));
  assert.deepStrictEqual(
    actor.inboxId,
    new URL("https://example.com/ap/actor/bot/inbox"),
  );
  assert.deepStrictEqual(
    actor.endpoints?.sharedInbox,
    new URL("https://example.com/ap/inbox"),
  );
  assert.deepStrictEqual(
    actor.followersId,
    new URL("https://example.com/ap/actor/bot/followers"),
  );
  assert.deepStrictEqual(
    actor.outboxId,
    new URL("https://example.com/ap/actor/bot/outbox"),
  );
  const publicKey = await actor.getPublicKey();
  assert.ok(publicKey != null);
  assert.deepStrictEqual(publicKey.ownerId, actor.id);
  assert.ok(publicKey.publicKey != null);
  const keys = await repository.getKeyPairs();
  assert.ok(keys != null);
  assert.deepStrictEqual(publicKey.publicKey, keys[0].publicKey);
  const assertionMethods = await Array.fromAsync(actor.getAssertionMethods());
  assert.deepStrictEqual(assertionMethods.length, 2);
  assert.deepStrictEqual(
    assertionMethods.map((mk) => mk.controllerId),
    [actor.id, actor.id],
  );
  assert.deepStrictEqual(
    await Promise.all(assertionMethods.map((mk) => mk.publicKey)),
    keys.map((k) => k.publicKey),
  );
});

test("BotImpl.mapHandle()", () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "username",
  });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assert.deepStrictEqual(bot.mapHandle(ctx, "non-existent"), null);
  assert.deepStrictEqual(bot.mapHandle(ctx, "username"), "bot");
});

test("BotImpl.dispatchActorKeyPairs()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assert.deepStrictEqual(
    await bot.dispatchActorKeyPairs(ctx, "non-existent"),
    [],
  );
  // Generation:
  const keyPairs = await bot.dispatchActorKeyPairs(ctx, "bot");
  const storedKeyPairs = await repository.getKeyPairs();
  assert.deepStrictEqual(keyPairs, storedKeyPairs);
  // Retrieval:
  const keyPairs2 = await bot.dispatchActorKeyPairs(ctx, "bot");
  assert.deepStrictEqual(keyPairs2, storedKeyPairs);
});

test("BotImpl.dispatchFollowers()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    collectionWindow: 2,
  });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assert.deepStrictEqual(
    await bot.dispatchFollowers(ctx, "non-existent", null),
    null,
  );
  assert.deepStrictEqual(
    await bot.dispatchFollowers(ctx, "non-existent", ""),
    null,
  );
  const empty = await bot.dispatchFollowers(ctx, "bot", null);
  assert.deepStrictEqual(empty, { items: [], nextCursor: null });

  await repository.addFollower(
    new URL("https://example.com/actor/1#follow"),
    new Person({
      id: new URL("https://example.com/actor/1"),
      preferredUsername: "john",
      inbox: new URL("https://example.com/actor/1/inbox"),
    }),
  );
  await repository.addFollower(
    new URL("https://example.com/actor/2#follow"),
    new Person({
      id: new URL("https://example.com/actor/2"),
      preferredUsername: "jane",
      inbox: new URL("https://example.com/actor/2/inbox"),
    }),
  );
  await repository.addFollower(
    new URL("https://example.com/actor/3#follow"),
    new Person({
      id: new URL("https://example.com/actor/3"),
      preferredUsername: "joe",
      inbox: new URL("https://example.com/actor/3/inbox"),
    }),
  );
  const full = await bot.dispatchFollowers(ctx, "bot", null);
  assert.ok(full != null);
  assert.deepStrictEqual(full.nextCursor, null);
  assert.deepStrictEqual(full.items.length, 3);
  const items = full.items.toSorted((a, b) =>
    (a.id?.href ?? "").localeCompare(b.id?.href ?? "")
  );
  assert.ok(items[0] instanceof Person);
  assert.deepStrictEqual(items[0].id, new URL("https://example.com/actor/1"));
  assert.ok(items[1] instanceof Person);
  assert.deepStrictEqual(items[1].id, new URL("https://example.com/actor/2"));
  assert.ok(items[2] instanceof Person);
  assert.deepStrictEqual(items[2].id, new URL("https://example.com/actor/3"));

  const firstPage = await bot.dispatchFollowers(ctx, "bot", "0");
  assert.ok(firstPage != null);
  assert.deepStrictEqual(firstPage.nextCursor, "2");
  assert.deepStrictEqual(firstPage.items.length, 2);
  assert.ok(firstPage.items[0] instanceof Person);
  assert.deepStrictEqual(
    firstPage.items[0].id,
    new URL("https://example.com/actor/3"),
  );
  assert.ok(firstPage.items[1] instanceof Person);
  assert.deepStrictEqual(
    firstPage.items[1].id,
    new URL("https://example.com/actor/2"),
  );

  const lastPage = await bot.dispatchFollowers(
    ctx,
    "bot",
    "2",
  );
  assert.ok(lastPage != null);
  assert.deepStrictEqual(lastPage.nextCursor, null);
  assert.deepStrictEqual(lastPage.items.length, 1);
  assert.ok(lastPage.items[0] instanceof Person);
  assert.deepStrictEqual(
    lastPage.items[0].id,
    new URL("https://example.com/actor/1"),
  );
});

test("BotImpl.getFollowersFirstCursor()", () => {
  const kv = new MemoryKvStore();
  const bot = new BotImpl<void>({ kv, username: "bot", collectionWindow: 2 });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assert.deepStrictEqual(
    bot.getFollowersFirstCursor(ctx, "non-existent"),
    null,
  );
  assert.deepStrictEqual(bot.getFollowersFirstCursor(ctx, "bot"), "0");
});

test("BotImpl.countFollowers()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assert.deepStrictEqual(await bot.countFollowers(ctx, "non-existent"), null);
  assert.deepStrictEqual(await bot.countFollowers(ctx, "bot"), 0);
  await repository.addFollower(
    new URL("https://example.com/actor/1#follow"),
    new Person({
      id: new URL("https://example.com/actor/1"),
      preferredUsername: "john",
      inbox: new URL("https://example.com/actor/1/inbox"),
    }),
  );
  await repository.addFollower(
    new URL("https://example.com/actor/2#follow"),
    new Person({
      id: new URL("https://example.com/actor/2"),
      preferredUsername: "jane",
      inbox: new URL("https://example.com/actor/2/inbox"),
    }),
  );
  await repository.addFollower(
    new URL("https://example.com/actor/3#follow"),
    new Person({
      id: new URL("https://example.com/actor/3"),
      preferredUsername: "joe",
      inbox: new URL("https://example.com/actor/3/inbox"),
    }),
  );
  assert.deepStrictEqual(await bot.countFollowers(ctx, "non-existent"), null);
  assert.deepStrictEqual(await bot.countFollowers(ctx, "bot"), 3);
});

test("BotImpl.getPermissionChecker()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
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
  assert.deepStrictEqual(anonymous(publicPost), true);
  assert.deepStrictEqual(anonymous(unlistedPost), true);
  assert.deepStrictEqual(anonymous(followersPost), false);
  assert.deepStrictEqual(anonymous(directPost), false);

  const actor = new Person({ id: new URL("https://example.com/actor/john") });
  const ctx2 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  ctx2.getSignedKeyOwner = () => Promise.resolve(actor);
  const nonFollower = await bot.getPermissionChecker(ctx2);
  assert.deepStrictEqual(nonFollower(publicPost), true);
  assert.deepStrictEqual(nonFollower(unlistedPost), true);
  assert.deepStrictEqual(nonFollower(followersPost), false);
  assert.deepStrictEqual(nonFollower(directPost), false);

  await repository.addFollower(
    new URL("https://example.com/actor/john#follow"),
    new Person({
      id: new URL("https://example.com/actor/john"),
      preferredUsername: "john",
    }),
  );
  const ctx3 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  ctx3.getSignedKeyOwner = () => Promise.resolve(actor);
  const follower = await bot.getPermissionChecker(ctx3);
  assert.deepStrictEqual(follower(publicPost), true);
  assert.deepStrictEqual(follower(unlistedPost), true);
  assert.deepStrictEqual(follower(followersPost), true);
  assert.deepStrictEqual(follower(directPost), false);

  const mentionedActor = new Person({
    id: new URL("https://example.com/ap/actor/mentioned"),
  });
  const ctx4 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  ctx4.getSignedKeyOwner = () => Promise.resolve(mentionedActor);
  const mentioned = await bot.getPermissionChecker(ctx4);
  assert.deepStrictEqual(mentioned(publicPost), true);
  assert.deepStrictEqual(mentioned(unlistedPost), true);
  assert.deepStrictEqual(mentioned(followersPost), true);
  assert.deepStrictEqual(mentioned(directPost), true);
});

test("BotImpl.dispatchOutbox()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    collectionWindow: 2,
  });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assert.deepStrictEqual(
    await bot.dispatchOutbox(ctx, "non-existent", null),
    null,
  );
  assert.deepStrictEqual(
    await bot.dispatchOutbox(ctx, "non-existent", ""),
    null,
  );
  assert.deepStrictEqual(await bot.dispatchOutbox(ctx, "bot", null), {
    items: [],
    nextCursor: null,
  });
  assert.deepStrictEqual(await bot.dispatchOutbox(ctx, "bot", ""), {
    items: [],
    nextCursor: null,
  });

  await repository.addMessage(
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/1"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, world!",
        published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
      }),
      published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
    }),
  );
  await repository.addMessage(
    "46442170-836d-4a0d-9142-f31242abe2f9",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/46442170-836d-4a0d-9142-f31242abe2f9",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/2"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, followers!",
        published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
      }),
      published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
    }),
  );
  await repository.addMessage(
    "8386a4c7-06f8-409f-ad72-2bba43e83363",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/john"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/3"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/john"),
        content: "Hello, followers!",
        published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
      }),
      published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
    }),
  );
  assert.deepStrictEqual(
    await bot.dispatchOutbox(ctx, "non-existent", null),
    null,
  );
  assert.deepStrictEqual(
    await bot.dispatchOutbox(ctx, "non-existent", ""),
    null,
  );
  const anonymous1 = await bot.dispatchOutbox(ctx, "bot", "");
  assert.ok(anonymous1 != null);
  assert.deepStrictEqual(anonymous1.nextCursor, "2025-01-01T00:00:00Z");
  assert.deepStrictEqual(anonymous1.items.length, 1);
  assert.ok(anonymous1.items[0] instanceof Create);
  assert.deepStrictEqual(
    anonymous1.items[0].id,
    new URL(
      "https://example.com/ap/actor/bot/create/46442170-836d-4a0d-9142-f31242abe2f9",
    ),
  );

  const anonymous2 = await bot.dispatchOutbox(
    ctx,
    "bot",
    "2025-01-01T00:00:00Z",
  );
  assert.ok(anonymous2 != null);
  assert.deepStrictEqual(anonymous2.nextCursor, null);
  assert.deepStrictEqual(anonymous2.items.length, 1);
  assert.ok(anonymous2.items[0] instanceof Create);
  assert.deepStrictEqual(
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
  assert.ok(mentioned != null);
  assert.deepStrictEqual(mentioned.nextCursor, null);
  assert.deepStrictEqual(mentioned.items.length, 3);
  assert.ok(mentioned.items[0] instanceof Create);
  assert.deepStrictEqual(
    mentioned.items[0].id,
    new URL(
      "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
    ),
  );
  assert.ok(mentioned.items[1] instanceof Create);
  assert.deepStrictEqual(
    mentioned.items[1].id,
    new URL(
      "https://example.com/ap/actor/bot/create/46442170-836d-4a0d-9142-f31242abe2f9",
    ),
  );
  assert.ok(mentioned.items[2] instanceof Create);
  assert.deepStrictEqual(
    mentioned.items[2].id,
    new URL(
      "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    ),
  );
});

test("BotImpl.getOutboxFirstCursor()", () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const ctx = bot.federation.createContext(
    new URL("https://example.com/"),
    undefined,
  );
  assert.deepStrictEqual(bot.getOutboxFirstCursor(ctx, "non-existent"), null);
  assert.deepStrictEqual(bot.getOutboxFirstCursor(ctx, "bot"), "");
});

test("BotImpl.countOutbox()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assert.deepStrictEqual(await bot.countOutbox(ctx, "non-existent"), null);
  assert.deepStrictEqual(await bot.countOutbox(ctx, "bot"), 0);

  await repository.addMessage(
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/1"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, world!",
      }),
    }),
  );
  await repository.addMessage(
    "46442170-836d-4a0d-9142-f31242abe2f9",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/46442170-836d-4a0d-9142-f31242abe2f9",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/2"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, followers!",
      }),
    }),
  );
  await repository.addMessage(
    "8386a4c7-06f8-409f-ad72-2bba43e83363",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/john"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/3"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/john"),
        content: "Hello, followers!",
      }),
    }),
  );
  assert.deepStrictEqual(await bot.countOutbox(ctx, "non-existent"), null);
  assert.deepStrictEqual(await bot.countOutbox(ctx, "bot"), 3);
});

test("BotImpl.dispatchFollow()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assert.deepStrictEqual(
    await bot.dispatchFollow(ctx, { id: crypto.randomUUID() }),
    null,
  );

  await repository.addSentFollow(
    "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
    new Follow({
      id: new URL(
        "https://example.com/ap/follow/b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new URL("https://example.com/ap/actor/john"),
      to: new URL("https://example.com/ap/actor/john"),
    }),
  );
  const follow = await bot.dispatchFollow(ctx, {
    id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
  });
  assert.ok(follow instanceof Follow);
  assert.deepStrictEqual(
    follow.id,
    new URL(
      "https://example.com/ap/follow/b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
    ),
  );
  assert.deepStrictEqual(
    follow.actorId,
    new URL("https://example.com/ap/actor/bot"),
  );
  assert.deepStrictEqual(
    follow.objectId,
    new URL("https://example.com/ap/actor/john"),
  );
  assert.deepStrictEqual(
    follow.toId,
    new URL("https://example.com/ap/actor/john"),
  );
});

test("BotImpl.authorizeFollow()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  await repository.addSentFollow(
    "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
    new Follow({
      id: new URL(
        "https://example.com/ap/follow/b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new URL("https://example.com/ap/actor/john"),
      to: new URL("https://example.com/ap/actor/john"),
    }),
  );
  assert.ok(
    await bot.authorizeFollow(
      ctx,
      { id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
      new CryptographicKey({}),
      new Person({ id: new URL("https://example.com/ap/actor/john") }),
    ),
  );
  assert.ok(
    await bot.authorizeFollow(
      ctx,
      { id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
      new CryptographicKey({}),
      await new SessionImpl(bot, ctx).getActor(),
    ),
  );
  assert.deepStrictEqual(
    await bot.authorizeFollow(
      ctx,
      { id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
      new CryptographicKey({}),
      new Person({ id: new URL("https://example.com/ap/actor/alice") }),
    ),
    false,
  );
  assert.deepStrictEqual(
    await bot.authorizeFollow(
      ctx,
      { id: crypto.randomUUID() },
      new CryptographicKey({}),
      new Person({ id: new URL("https://example.com/ap/actor/john") }),
    ),
    false,
  );
});

test("BotImpl.dispatchCreate()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assert.deepStrictEqual(
    await bot.dispatchCreate(ctx, { id: "non-existent" }),
    null,
  );

  await repository.addMessage(
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/1"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, world!",
      }),
    }),
  );
  const create = await bot.dispatchCreate(ctx, {
    id: "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
  });
  assert.ok(create instanceof Create);
  assert.deepStrictEqual(
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
  assert.deepStrictEqual(
    await bot.dispatchCreate(ctx2, {
      id: "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    }),
    create,
  );

  await repository.addMessage(
    "8386a4c7-06f8-409f-ad72-2bba43e83363",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/john"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/3"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/john"),
        content: "Hello, followers!",
      }),
    }),
  );
  assert.deepStrictEqual(
    await bot.dispatchCreate(ctx, {
      id: "8386a4c7-06f8-409f-ad72-2bba43e83363",
    }),
    null,
  );
  const create2 = await bot.dispatchCreate(ctx2, {
    id: "8386a4c7-06f8-409f-ad72-2bba43e83363",
  });
  assert.ok(create2 instanceof Create);
  assert.deepStrictEqual(
    create2.id,
    new URL(
      "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
    ),
  );

  await repository.addMessage(
    "ce8081ac-f238-484b-9a70-5d8a4b66d829",
    new Announce({
      id: new URL(
        "https://example.com/ap/actor/bot/announce/ce8081ac-f238-484b-9a70-5d8a4b66d829",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new URL("https://example.com/ap/actor/bot/note/2"),
    }),
  );
  assert.deepStrictEqual(
    await bot.dispatchCreate(ctx, {
      id: "ce8081ac-f238-484b-9a70-5d8a4b66d829",
    }),
    null,
  );
});

test("BotImpl.dispatchMessage()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assert.deepStrictEqual(
    await bot.dispatchMessage(Note, ctx, "non-existent"),
    null,
  );

  await repository.addMessage(
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/1"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, world!",
      }),
    }),
  );
  const note = await bot.dispatchMessage(
    Note,
    ctx,
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
  );
  assert.ok(note instanceof Note);
  assert.deepStrictEqual(
    note.id,
    new URL("https://example.com/ap/actor/bot/note/1"),
  );

  const ctx2 = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  const actor = new Person({
    id: new URL("https://example.com/ap/actor/john"),
  });
  ctx2.getSignedKeyOwner = () => Promise.resolve(actor);
  assert.deepStrictEqual(
    await bot.dispatchMessage(
      Note,
      ctx2,
      "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    ),
    note,
  );

  assert.deepStrictEqual(
    await bot.dispatchMessage(
      Article,
      ctx,
      "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    ),
    null,
  );

  await repository.addMessage(
    "8386a4c7-06f8-409f-ad72-2bba43e83363",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/8386a4c7-06f8-409f-ad72-2bba43e83363",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/john"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/3"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/john"),
        content: "Hello, followers!",
      }),
    }),
  );
  assert.deepStrictEqual(
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
  assert.ok(note2 instanceof Note);
  assert.deepStrictEqual(
    note2.id,
    new URL("https://example.com/ap/actor/bot/note/3"),
  );

  await repository.addMessage(
    "ce8081ac-f238-484b-9a70-5d8a4b66d829",
    new Announce({
      id: new URL(
        "https://example.com/ap/actor/bot/announce/ce8081ac-f238-484b-9a70-5d8a4b66d829",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new URL("https://example.com/ap/actor/bot/note/2"),
    }),
  );
  assert.deepStrictEqual(
    await bot.dispatchMessage(
      Note,
      ctx,
      "ce8081ac-f238-484b-9a70-5d8a4b66d829",
    ),
    null,
  );
});

test("BotImpl.dispatchAnnounce()", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );
  assert.deepStrictEqual(
    await bot.dispatchAnnounce(ctx, { id: "non-existent" }),
    null,
  );

  await repository.addMessage(
    "ce8081ac-f238-484b-9a70-5d8a4b66d829",
    new Announce({
      id: new URL(
        "https://example.com/ap/actor/bot/announce/ce8081ac-f238-484b-9a70-5d8a4b66d829",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new URL("https://example.com/ap/actor/bot/note/2"),
    }),
  );
  const announce = await bot.dispatchAnnounce(ctx, {
    id: "ce8081ac-f238-484b-9a70-5d8a4b66d829",
  });
  assert.ok(announce instanceof Announce);
  assert.deepStrictEqual(
    announce.id,
    new URL(
      "https://example.com/ap/actor/bot/announce/ce8081ac-f238-484b-9a70-5d8a4b66d829",
    ),
  );

  await repository.addMessage(
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/1"),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, world!",
      }),
    }),
  );
  assert.deepStrictEqual(
    await bot.dispatchAnnounce(ctx, {
      id: "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    }),
    null,
  );

  await repository.addMessage(
    "d4a7ef9b-682c-4de9-b23c-87747d6725cb",
    new Announce({
      id: new URL(
        "https://example.com/ap/actor/bot/announce/d4a7ef9b-682c-4de9-b23c-87747d6725cb",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: new URL("https://example.com/ap/actor/john"),
      object: new URL("https://example.com/ap/actor/bot/note/2"),
    }),
  );
  assert.deepStrictEqual(
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
  assert.ok(announce2 instanceof Announce);
  assert.deepStrictEqual(
    announce2.id,
    new URL(
      "https://example.com/ap/actor/bot/announce/d4a7ef9b-682c-4de9-b23c-87747d6725cb",
    ),
  );
});

test("BotImpl.dispatchSharedKey()", () => {
  const identifier = crypto.randomUUID();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
    identifier,
  });
  const ctx = bot.federation.createContext(new URL("https://example.com"));
  assert.deepStrictEqual(bot.dispatchSharedKey(ctx), { identifier });
});

for (const policy of ["accept", "reject", "manual"] as const) {
  test(`BotImpl.onFollowed() [followerPolicy: ${policy}]`, async (t) => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
      followerPolicy: policy,
    });
    const followRequests: [Session<void>, FollowRequest][] = [];
    bot.onFollow = (session, fr) => void (followRequests.push([session, fr]));
    const ctx = createMockInboxContext(bot, "https://example.com", "bot");

    await t.test("without actor", async () => {
      const followWithoutActor = new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/bot"),
        object: new URL("https://example.com/ap/actor/bot"),
      });
      await bot.onFollowed(ctx, followWithoutActor);
      assert.deepStrictEqual(await repository.countFollowers(), 0);
    });

    await t.test("with wrong actor", async () => {
      const followWithWrongActor = new Follow({
        id: new URL("https://example.com/ap/actor/bot/follows/bot"),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new URL("https://example.com/ap/actor/bot"),
      });
      await bot.onFollowed(ctx, followWithWrongActor);
      assert.deepStrictEqual(await repository.countFollowers(), 0);
    });

    const actor = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    });

    await t.test("with wrong recipient", async () => {
      const followWithWrongRecipient = new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/bot"),
        actor,
        object: new URL("https://example.com/ap/actor/non-existent"),
      });
      await bot.onFollowed(ctx, followWithWrongRecipient);
      assert.deepStrictEqual(await repository.countFollowers(), 0);
    });

    await t.test("with correct follow", async () => {
      const follow = new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/bot"),
        actor,
        object: new URL("https://example.com/ap/actor/bot"),
      });
      await bot.onFollowed(ctx, follow);
      if (policy === "accept") {
        assert.deepStrictEqual(await repository.countFollowers(), 1);
        assert.ok(
          await repository.hasFollower(
            new URL("https://example.com/ap/actor/john"),
          ),
        );
        const [storedFollower] = await Array.fromAsync(
          repository.getFollowers(),
        );
        assert.ok(storedFollower instanceof Person);
        assert.deepStrictEqual(storedFollower.id, actor.id);
        assert.deepStrictEqual(ctx.sentActivities.length, 1);
        const { activity, recipients } = ctx.sentActivities[0];
        assert.ok(activity instanceof Accept);
        assert.deepStrictEqual(
          activity.actorId,
          new URL("https://example.com/ap/actor/bot"),
        );
        assert.deepStrictEqual(activity.objectId, follow.id);
        assert.deepStrictEqual(recipients.length, 1);
        assert.deepStrictEqual(recipients[0], actor);
        assert.deepStrictEqual(ctx.forwardedRecipients, []);
        assert.deepStrictEqual(followRequests.length, 1);
      } else {
        assert.deepStrictEqual(await repository.countFollowers(), 0);
        if (policy === "reject") {
          assert.deepStrictEqual(ctx.sentActivities.length, 1);
          const { activity, recipients } = ctx.sentActivities[0];
          assert.ok(activity instanceof Reject);
          assert.deepStrictEqual(
            activity.actorId,
            new URL("https://example.com/ap/actor/bot"),
          );
          assert.deepStrictEqual(activity.objectId, follow.id);
          assert.deepStrictEqual(recipients.length, 1);
          assert.deepStrictEqual(recipients[0], actor);
          assert.deepStrictEqual(ctx.forwardedRecipients, []);
        } else {
          assert.deepStrictEqual(ctx.sentActivities, []);
        }
      }
      const [session, followRequest] = followRequests[0];
      assert.deepStrictEqual(session.bot, bot);
      assert.deepStrictEqual(session.context, ctx);
      assert.ok(followRequest.follower instanceof Person);
      assert.deepStrictEqual(followRequest.follower.id, actor.id);
    });
  });
}

test("BotImpl.onUnfollowed()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const unfollowed: [Session<void>, Actor][] = [];
  bot.onUnfollow = (session, actor) => void (unfollowed.push([session, actor]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  await repository.addFollower(
    new URL("https://example.com/ap/actor/john/follows/bot"),
    new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    }),
  );

  async function assertNoEffect() {
    assert.deepStrictEqual(await repository.countFollowers(), 1);
    const [follower] = await Array.fromAsync(repository.getFollowers());
    assert.ok(follower instanceof Person);
    assert.deepStrictEqual(
      follower.id,
      new URL("https://example.com/ap/actor/john"),
    );
    assert.deepStrictEqual(follower.preferredUsername, "john");
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);
    assert.deepStrictEqual(unfollowed, []);
  }

  await t.test("without Follow object", async () => {
    const undo = new Undo({
      actor: new URL("https://example.com/ap/actor/john"),
    });
    await bot.onUnfollowed(ctx, undo);
    await assertNoEffect();
  });

  await t.test("without Follow.id", async () => {
    const undo = new Undo({
      actor: new URL("https://example.com/ap/actor/john"),
      object: new Follow({}),
    });
    await bot.onUnfollowed(ctx, undo);
    await assertNoEffect();
  });

  await t.test("with non-existent Follow.id", async () => {
    const undo = new Undo({
      actor: new URL("https://example.com/ap/actor/john"),
      object: new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/non-existent"),
      }),
    });
    await bot.onUnfollowed(ctx, undo);
    await assertNoEffect();
  });

  await t.test("with incorrect Follow.actorId", async () => {
    const undo = new Undo({
      actor: new URL("https://example.com/ap/actor/wrong-actor"),
      object: new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/bot"),
      }),
    });
    await bot.onUnfollowed(ctx, undo);
    await assertNoEffect();
  });

  await t.test("with correct Follow object", async () => {
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
    assert.deepStrictEqual(await repository.countFollowers(), 0);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);
    assert.deepStrictEqual(unfollowed.length, 1);
    const [session, follower] = unfollowed[0];
    assert.deepStrictEqual(session.bot, bot);
    assert.deepStrictEqual(session.context, ctx);
    assert.ok(follower instanceof Person);
    assert.deepStrictEqual(
      follower.id,
      new URL("https://example.com/ap/actor/john"),
    );
  });
});

test("BotImpl.onFollowAccepted()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const accepted: [Session<void>, Actor][] = [];
  bot.onAcceptFollow = (session, actor) =>
    void (accepted.push([session, actor]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  await t.test("without object", async () => {
    await bot.onFollowAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
      }),
    );
    assert.deepStrictEqual(accepted, []);
  });

  await t.test("with invalid object URI", async () => {
    await bot.onFollowAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL("https://example.com/"),
      }),
    );
    assert.deepStrictEqual(accepted, []);
  });

  await t.test("with non-existent object", async () => {
    await bot.onFollowAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(`https://example.com/ap/follow/${crypto.randomUUID()}`),
      }),
    );
    assert.deepStrictEqual(accepted, []);
  });

  await t.test("with non-actor", async () => {
    await repository.addSentFollow(
      "2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new Note({}),
      }),
    );
    await bot.onFollowAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
        ),
      }),
    );
    assert.deepStrictEqual(accepted, []);
  });

  await t.test("with actor without URI", async () => {
    await repository.addSentFollow(
      "a99ff3bf-72a2-412b-83b9-cba894d38805",
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/a99ff3bf-72a2-412b-83b9-cba894d38805",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new Person({
          preferredUsername: "john",
        }),
      }),
    );
    await bot.onFollowAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/a99ff3bf-72a2-412b-83b9-cba894d38805",
        ),
      }),
    );
    assert.deepStrictEqual(accepted, []);
  });

  await t.test("with actor", async () => {
    await repository.addSentFollow(
      "3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
      }),
    );
    await bot.onFollowAccepted(
      ctx,
      new Accept({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
        ),
      }),
    );
    assert.deepStrictEqual(accepted.length, 1);
    const [session, actor] = accepted[0];
    assert.deepStrictEqual(session.bot, bot);
    assert.deepStrictEqual(session.context, ctx);
    assert.ok(actor instanceof Person);
    assert.deepStrictEqual(
      actor.id,
      new URL("https://example.com/ap/actor/john"),
    );
    const follow = await repository.getFollowee(
      new URL("https://example.com/ap/actor/john"),
    );
    assert.ok(follow != null);
    assert.ok(follow instanceof Follow);
    assert.deepStrictEqual(
      follow.id,
      new URL(
        "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
      ),
    );
    assert.deepStrictEqual(follow.objectId, actor.id);
  });
});

test("BotImpl.onFollowRejected()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const rejected: [Session<void>, Actor][] = [];
  bot.onRejectFollow = (session, actor) =>
    void (rejected.push([session, actor]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  await t.test("without object", async () => {
    await bot.onFollowRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
      }),
    );
    assert.deepStrictEqual(rejected, []);
  });

  await t.test("with invalid object URI", async () => {
    await bot.onFollowRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL("https://example.com/"),
      }),
    );
    assert.deepStrictEqual(rejected, []);
  });

  await t.test("with non-existent object", async () => {
    await bot.onFollowRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(`https://example.com/ap/follow/${crypto.randomUUID()}`),
      }),
    );
    assert.deepStrictEqual(rejected, []);
  });

  await t.test("with non-actor", async () => {
    await repository.addSentFollow(
      "2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new Note({}),
      }),
    );
    await bot.onFollowRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
        ),
      }),
    );
    assert.deepStrictEqual(rejected, []);
  });

  await t.test("with actor without URI", async () => {
    await repository.addSentFollow(
      "a99ff3bf-72a2-412b-83b9-cba894d38805",
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/a99ff3bf-72a2-412b-83b9-cba894d38805",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new Person({
          preferredUsername: "john",
        }),
      }),
    );
    await bot.onFollowRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/a99ff3bf-72a2-412b-83b9-cba894d38805",
        ),
      }),
    );
    assert.deepStrictEqual(rejected, []);
  });

  await t.test("with actor", async () => {
    await repository.addSentFollow(
      "3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
      new Follow({
        id: new URL(
          "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
      }),
    );
    await bot.onFollowRejected(
      ctx,
      new Reject({
        actor: new URL("https://example.com/ap/actor/john"),
        object: new URL(
          "https://example.com/ap/follow/3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
        ),
      }),
    );
    assert.deepStrictEqual(rejected.length, 1);
    const [session, actor] = rejected[0];
    assert.deepStrictEqual(session.bot, bot);
    assert.deepStrictEqual(session.context, ctx);
    assert.ok(actor instanceof Person);
    assert.deepStrictEqual(
      actor.id,
      new URL("https://example.com/ap/actor/john"),
    );
    assert.deepStrictEqual(
      await repository.getSentFollow("3bca0b8e-503a-47ea-ad69-6b7c29369fbd"),
      undefined,
    );
  });
});

test("BotImpl.onCreated()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  let replied: [Session<void>, Message<MessageClass, void>][] = [];
  bot.onReply = (session, msg) => void (replied.push([session, msg]));
  let mentioned: [Session<void>, Message<MessageClass, void>][] = [];
  bot.onMention = (session, msg) => void (mentioned.push([session, msg]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  let messaged: [Session<void>, Message<MessageClass, void>][] = [];
  bot.onMessage = (session, msg) => void (messaged.push([session, msg]));

  await t.test("without object", async () => {
    const createWithoutObject = new Create({
      actor: new URL("https://example.com/ap/actor/john"),
    });
    await bot.onCreated(ctx, createWithoutObject);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, []);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);
  });

  await t.test("with non-message object", async () => {
    const createWithNonMessageObject = new Create({
      actor: new URL("https://example.com/ap/actor/john"),
      object: new Place({}),
    });
    await bot.onCreated(ctx, createWithNonMessageObject);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, []);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);
  });

  await repository.addMessage(
    "a6358f1b-c978-49d3-8065-37a1df6168de",
    new Create({
      id: new URL(
        "https://example.com/ap/create/a6358f1b-c978-49d3-8065-37a1df6168de",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL(
          "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
        ),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, world!",
      }),
    }),
  );

  await t.test("on reply", async () => {
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
    assert.deepStrictEqual(replied.length, 1);
    const [session, msg] = replied[0];
    assert.deepStrictEqual(session.bot, bot);
    assert.deepStrictEqual(session.context, ctx);
    assert.ok(msg.raw instanceof Note);
    assert.deepStrictEqual(msg.raw.id, create.objectId);
    assert.ok(msg.replyTarget != null);
    assert.deepStrictEqual(
      msg.replyTarget.id,
      new URL(
        "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
      ),
    );
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, replied);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, ["followers"]);
  });

  await t.test("on mention", async () => {
    replied = [];
    messaged = [];
    ctx.forwardedRecipients = [];

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
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned.length, 1);
    const [session, msg] = mentioned[0];
    assert.deepStrictEqual(session.bot, bot);
    assert.deepStrictEqual(session.context, ctx);
    assert.ok(msg.raw instanceof Note);
    assert.deepStrictEqual(msg.raw.id, create.objectId);
    assert.deepStrictEqual(msg.mentions.length, 1);
    assert.deepStrictEqual(
      msg.mentions[0].id,
      new URL("https://example.com/ap/actor/bot"),
    );
    assert.deepStrictEqual(messaged, mentioned);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);
  });

  await t.test("on quote", async () => {
    mentioned = [];
    messaged = [];
    ctx.forwardedRecipients = [];

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
        content: "It's a quote!",
        quoteUrl: new URL(
          "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
        ),
      }),
    });
    let quoted: [Session<void>, Message<MessageClass, void>][] = [];
    bot.onQuote = (session, msg) => void (quoted.push([session, msg]));

    await bot.onCreated(ctx, create);

    assert.deepStrictEqual(quoted.length, 1);
    const [session, msg] = quoted[0];
    assert.deepStrictEqual(session.bot, bot);
    assert.deepStrictEqual(session.context, ctx);
    assert.ok(msg.raw instanceof Note);
    assert.deepStrictEqual(msg.raw.id, create.objectId);
    assert.ok(msg.quoteTarget != null);
    assert.deepStrictEqual(
      msg.quoteTarget.id,
      new URL(
        "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
      ),
    );
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, quoted);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, ["followers"]);

    quoted = [];
    messaged = [];
    ctx.forwardedRecipients = [];
  });

  await t.test("on message", async () => {
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
        content: "<p>Hello!</p>",
      }),
    });
    await bot.onCreated(ctx, create);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged.length, 1);
    const [session, msg] = messaged[0];
    assert.deepStrictEqual(session.bot, bot);
    assert.deepStrictEqual(session.context, ctx);
    assert.ok(msg.raw instanceof Note);
    assert.deepStrictEqual(msg.raw.id, create.objectId);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);
  });

  messaged = [];
});

test("BotImpl.onAnnounced()", async () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const shares: [Session<void>, SharedMessage<MessageClass, void>][] = [];
  bot.onSharedMessage = (session, sharedMessage) =>
    void (shares.push([session, sharedMessage]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const announce = new Announce({
    id: new URL("https://example.com/ap/actor/bot/announce/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    to: PUBLIC_COLLECTION,
    cc: new URL("https://example.com/ap/actor/bot/followers"),
    object: new Note({
      id: new URL("https://example.com/ap/actor/bot/note/1"),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      content: "Hello, world!",
    }),
  });
  await bot.onAnnounced(ctx, announce);
  assert.deepStrictEqual(shares.length, 1);
  const [session, sharedMessage] = shares[0];
  assert.deepStrictEqual(session.bot, bot);
  assert.deepStrictEqual(session.context, ctx);
  assert.deepStrictEqual(sharedMessage.raw, announce);
  assert.deepStrictEqual(sharedMessage.id, announce.id);
  assert.deepStrictEqual(sharedMessage.actor.id, announce.actorId);
  assert.deepStrictEqual(sharedMessage.visibility, "public");
  assert.deepStrictEqual(sharedMessage.original.id, announce.objectId);
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(ctx.forwardedRecipients, []);
});

test("BotImpl.onLiked()", async () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const likes: [Session<void>, Like<void>][] = [];
  bot.onLike = (session, like) => void (likes.push([session, like]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const rawLike = new RawLike({
    id: new URL("https://example.com/ap/actor/bot/like/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    object: new Note({
      id: new URL("https://example.com/ap/actor/bot/note/1"),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      content: "Hello, world!",
    }),
  });
  await bot.onLiked(ctx, rawLike);
  assert.deepStrictEqual(likes.length, 1);
  const [session, like] = likes[0];
  assert.deepStrictEqual(session.bot, bot);
  assert.deepStrictEqual(session.context, ctx);
  assert.deepStrictEqual(like.raw, rawLike);
  assert.deepStrictEqual(like.id, rawLike.id);
  assert.deepStrictEqual(like.actor.id, rawLike.actorId);
  assert.deepStrictEqual(like.message.id, rawLike.objectId);
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(ctx.forwardedRecipients, []);
});

test("BotImpl.onUnliked()", async () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const likes: [Session<void>, Like<void>][] = [];
  bot.onUnlike = (session, like) => void (likes.push([session, like]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const rawLike = new RawLike({
    id: new URL("https://example.com/ap/actor/bot/like/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    object: new Note({
      id: new URL("https://example.com/ap/actor/bot/note/1"),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      content: "Hello, world!",
    }),
  });
  const undo = new Undo({
    id: new URL("https://example.com/ap/actor/bot/unlike/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    object: rawLike,
  });
  await bot.onUnliked(ctx, undo);
  assert.deepStrictEqual(likes.length, 1);
  const [session, like] = likes[0];
  assert.deepStrictEqual(session.bot, bot);
  assert.deepStrictEqual(session.context, ctx);
  assert.deepStrictEqual(like.raw, rawLike);
  assert.deepStrictEqual(like.id, rawLike.id);
  assert.deepStrictEqual(like.actor.id, rawLike.actorId);
  assert.deepStrictEqual(like.message.id, rawLike.objectId);
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(ctx.forwardedRecipients, []);

  likes.pop();
  const invalidUndo = undo.clone({
    actor: new URL("https://example.com/ap/actor/another"),
  });
  await bot.onUnliked(ctx, invalidUndo);
  assert.deepStrictEqual(likes, []);
});

test("BotImpl.onReacted()", async () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const reactions: [Session<void>, Reaction<void>][] = [];
  bot.onReact = (session, reaction) =>
    void (reactions.push([session, reaction]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  // Test with Like containing an emoji name
  const rawLike = new RawLike({
    id: new URL("https://example.com/ap/actor/bot/like/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    name: ":heart:",
    object: new Note({
      id: new URL("https://example.com/ap/actor/bot/note/1"),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      content: "Hello, world!",
    }),
    tags: [
      new Emoji({
        id: new URL("https://example.com/ap/emoji/heart"),
        name: ":heart:",
        icon: new Image({
          mediaType: "image/png",
          url: new URL("https://example.com/emoji/heart.png"),
        }),
      }),
    ],
  });

  await bot.onReacted(ctx, rawLike);
  assert.deepStrictEqual(reactions.length, 1);
  const [session, reaction] = reactions[0];
  assert.deepStrictEqual(session.bot, bot);
  assert.deepStrictEqual(session.context, ctx);
  assert.deepStrictEqual(reaction.raw, rawLike);
  assert.deepStrictEqual(reaction.id, rawLike.id);
  assert.deepStrictEqual(reaction.actor.id, rawLike.actorId);
  assert.deepStrictEqual(reaction.message.id, rawLike.objectId);
  assert.ok(reaction.emoji instanceof Emoji);
  assert.deepStrictEqual(reaction.emoji.name, ":heart:");
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(ctx.forwardedRecipients, []);

  // Test with EmojiReact
  reactions.pop();
  const emojiReact = new EmojiReact({
    id: new URL("https://example.com/ap/actor/bot/react/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    name: ":thumbsup:",
    object: new Note({
      id: new URL("https://example.com/ap/actor/bot/note/1"),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      content: "Hello, world!",
    }),
    tags: [
      new Emoji({
        id: new URL("https://example.com/ap/emoji/thumbsup"),
        name: ":thumbsup:",
        icon: new Image({
          mediaType: "image/png",
          url: new URL("https://example.com/emoji/thumbsup.png"),
        }),
      }),
    ],
  });

  await bot.onReacted(ctx, emojiReact);
  assert.deepStrictEqual(reactions.length, 1);
  const [session2, reaction2] = reactions[0];
  assert.deepStrictEqual(session2.bot, bot);
  assert.deepStrictEqual(session2.context, ctx);
  assert.deepStrictEqual(reaction2.raw, emojiReact);
  assert.deepStrictEqual(reaction2.id, emojiReact.id);
  assert.deepStrictEqual(reaction2.actor.id, emojiReact.actorId);
  assert.deepStrictEqual(reaction2.message.id, emojiReact.objectId);
  assert.ok(reaction2.emoji instanceof Emoji);
  assert.deepStrictEqual(reaction2.emoji.name, ":thumbsup:");
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(ctx.forwardedRecipients, []);
});

test("BotImpl.onUnreacted()", async () => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const reactions: [Session<void>, Reaction<void>][] = [];
  bot.onUnreact = (session, reaction) =>
    void (reactions.push([session, reaction]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  // Test with Like containing an emoji name
  const rawLike = new RawLike({
    id: new URL("https://example.com/ap/actor/bot/like/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    name: ":heart:",
    object: new Note({
      id: new URL("https://example.com/ap/actor/bot/note/1"),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      content: "Hello, world!",
    }),
    tags: [
      new Emoji({
        id: new URL("https://example.com/ap/emoji/heart"),
        name: ":heart:",
        icon: new Image({
          mediaType: "image/png",
          url: new URL("https://example.com/emoji/heart.png"),
        }),
      }),
    ],
  });

  const undo = new Undo({
    id: new URL("https://example.com/ap/actor/bot/unreact/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    object: rawLike,
  });

  await bot.onUnreacted(ctx, undo);
  assert.deepStrictEqual(reactions.length, 1);
  const [session, reaction] = reactions[0];
  assert.deepStrictEqual(session.bot, bot);
  assert.deepStrictEqual(session.context, ctx);
  assert.deepStrictEqual(reaction.raw, rawLike);
  assert.deepStrictEqual(reaction.id, rawLike.id);
  assert.deepStrictEqual(reaction.actor.id, rawLike.actorId);
  assert.deepStrictEqual(reaction.message.id, rawLike.objectId);
  assert.ok(reaction.emoji instanceof Emoji);
  assert.deepStrictEqual(reaction.emoji.name, ":heart:");
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(ctx.forwardedRecipients, []);

  // Test with EmojiReact
  reactions.pop();
  const emojiReact = new EmojiReact({
    id: new URL("https://example.com/ap/actor/bot/react/1"),
    actor: new URL("https://example.com/ap/actor/bot"),
    name: ":thumbsup:",
    object: new Note({
      id: new URL("https://example.com/ap/actor/bot/note/1"),
      attribution: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      content: "Hello, world!",
    }),
    tags: [
      new Emoji({
        id: new URL("https://example.com/ap/emoji/thumbsup"),
        name: ":thumbsup:",
        icon: new Image({
          mediaType: "image/png",
          url: new URL("https://example.com/emoji/thumbsup.png"),
        }),
      }),
    ],
  });

  const undoEmojiReact = new Undo({
    id: new URL("https://example.com/ap/actor/bot/unreact/2"),
    actor: new URL("https://example.com/ap/actor/bot"),
    object: emojiReact,
  });

  await bot.onUnreacted(ctx, undoEmojiReact);
  assert.deepStrictEqual(reactions.length, 1);
  const [session2, reaction2] = reactions[0];
  assert.deepStrictEqual(session2.bot, bot);
  assert.deepStrictEqual(session2.context, ctx);
  assert.deepStrictEqual(reaction2.raw, emojiReact);
  assert.deepStrictEqual(reaction2.id, emojiReact.id);
  assert.deepStrictEqual(reaction2.actor.id, emojiReact.actorId);
  assert.deepStrictEqual(reaction2.message.id, emojiReact.objectId);
  assert.ok(reaction2.emoji instanceof Emoji);
  assert.deepStrictEqual(reaction2.emoji.name, ":thumbsup:");
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(ctx.forwardedRecipients, []);

  // Test with mismatched actor
  reactions.pop();
  const invalidUndo = undoEmojiReact.clone({
    actor: new URL("https://example.com/ap/actor/another"),
  });
  await bot.onUnreacted(ctx, invalidUndo);
  assert.deepStrictEqual(reactions, []);

  // Test with non-reaction object
  reactions.pop();
  const nonReactionUndo = new Undo({
    id: new URL("https://example.com/ap/actor/bot/unreact/3"),
    actor: new URL("https://example.com/ap/actor/bot"),
    object: new Note({}),
  });
  await bot.onUnreacted(ctx, nonReactionUndo);
  assert.deepStrictEqual(reactions, []);
});

test("BotImpl.dispatchNodeInfo()", () => {
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
  assert.deepStrictEqual(bot.dispatchNodeInfo(ctx), {
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

test("BotImpl.fetch()", async () => {
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
  assert.deepStrictEqual(response.status, 404);

  const botBehindProxy = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
    behindProxy: true,
  });
  const response2 = await botBehindProxy.fetch(request);
  assert.deepStrictEqual(response2.status, 200);
});

describe("BotImpl.addCustomEmoji(), BotImpl.addCustomEmojis()", () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });

  test("addCustomEmoji()", () => {
    const emojiData: CustomEmoji = {
      type: "image/png",
      url: "https://example.com/emoji.png",
    };
    const deferredEmoji = bot.addCustomEmoji("testEmoji", emojiData);
    assert.deepStrictEqual(typeof deferredEmoji, "function");
    assert.deepStrictEqual(bot.customEmojis["testEmoji"], emojiData);

    // Test invalid name
    assert.throws(
      () => bot.addCustomEmoji("invalid name", emojiData),
      TypeError,
      "Invalid custom emoji name",
    );

    // Test duplicate name
    assert.throws(
      () => bot.addCustomEmoji("testEmoji", emojiData),
      TypeError,
      "Duplicate custom emoji name",
    );

    // Test unsupported media type
    assert.throws(
      () =>
        bot.addCustomEmoji("invalidType", {
          // @ts-expect-error: Intended type error for testing runtime check
          type: "text/plain",
          url: "https://example.com/emoji.txt",
        }),
      TypeError,
      "Unsupported media type",
    );
  });

  test("addCustomEmojis()", () => {
    const emojisData = {
      emoji1: { type: "image/png", url: "https://example.com/emoji1.png" },
      emoji2: { type: "image/gif", file: "/path/to/emoji2.gif" },
    } as const;
    const deferredEmojis = bot.addCustomEmojis(emojisData);

    assert.deepStrictEqual(typeof deferredEmojis["emoji1"], "function");
    assert.deepStrictEqual(typeof deferredEmojis["emoji2"], "function");
    assert.deepStrictEqual(bot.customEmojis["emoji1"], emojisData.emoji1);
    assert.deepStrictEqual(bot.customEmojis["emoji2"], emojisData.emoji2);

    // Test duplicate name within the batch
    assert.throws(
      () =>
        bot.addCustomEmojis({
          emoji1: { type: "image/png", url: "https://example.com/dup1.png" },
        }),
      TypeError,
      "Duplicate custom emoji name: emoji1",
    );
  });
});

test("BotImpl.getEmoji()", async () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );

  // Test with remote URL
  const remoteEmojiData: CustomEmoji = {
    type: "image/png",
    url: "https://remote.com/emoji.png",
  };
  bot.customEmojis["remoteEmoji"] = remoteEmojiData;
  const remoteEmoji = bot.getEmoji(ctx, "remoteEmoji", remoteEmojiData);
  assert.ok(remoteEmoji instanceof Emoji);
  assert.deepStrictEqual(
    remoteEmoji.id,
    new URL("https://example.com/ap/emoji/remoteEmoji"),
  );
  assert.deepStrictEqual(remoteEmoji.name, ":remoteEmoji:");
  const icon = await remoteEmoji.getIcon();
  assert.ok(icon instanceof Image);
  assert.deepStrictEqual(icon.mediaType, "image/png");
  assert.deepStrictEqual(icon.url?.href, "https://remote.com/emoji.png");

  // Test with local file
  const localEmojiData: CustomEmoji = {
    type: "image/gif",
    file: "/path/to/local/emoji.gif",
  };
  bot.customEmojis["localEmoji"] = localEmojiData;
  const localEmoji = bot.getEmoji(ctx, "localEmoji", localEmojiData);
  assert.ok(localEmoji instanceof Emoji);
  assert.deepStrictEqual(
    localEmoji.id,
    new URL("https://example.com/ap/emoji/localEmoji"),
  );
  assert.deepStrictEqual(localEmoji.name, ":localEmoji:");
  const icon2 = await localEmoji.getIcon();
  assert.ok(icon2 instanceof Image);
  assert.deepStrictEqual(icon2.mediaType, "image/gif");
  assert.deepStrictEqual(
    icon2.url?.href,
    "https://example.com/emojis/localEmoji.gif",
  );

  // Test with local file without extension mapping
  const localEmojiDataNoExt: CustomEmoji = {
    type: "image/webp",
    file: "/path/to/local/emoji",
  };
  bot.customEmojis["localEmojiNoExt"] = localEmojiDataNoExt;
  const localEmojiNoExt = bot.getEmoji(
    ctx,
    "localEmojiNoExt",
    localEmojiDataNoExt,
  );
  const icon3 = await localEmojiNoExt.getIcon();
  assert.ok(icon3 instanceof Image);
  assert.deepStrictEqual(icon3.mediaType, "image/webp");
  assert.deepStrictEqual(
    icon3.url?.href,
    "https://example.com/emojis/localEmojiNoExt.webp",
  );
});

// Test BotImpl.dispatchEmoji()
test("BotImpl.dispatchEmoji()", () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  const emojiData: CustomEmoji = {
    type: "image/png",
    url: "https://example.com/emoji.png",
  };
  bot.customEmojis["testEmoji"] = emojiData;

  // Test dispatching an existing emoji
  const emoji = bot.dispatchEmoji(ctx, { name: "testEmoji" });
  assert.ok(emoji instanceof Emoji);
  assert.deepStrictEqual(
    emoji.id,
    new URL("https://example.com/ap/emoji/testEmoji"),
  );
  assert.deepStrictEqual(emoji.name, ":testEmoji:");

  // Test dispatching a non-existent emoji
  const nonExistent = bot.dispatchEmoji(ctx, { name: "nonExistent" });
  assert.deepStrictEqual(nonExistent, null);
});

test("BotImpl.getFollowersFirstCursor()", () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const ctx = bot.federation.createContext(
    new URL("https://example.com"),
    undefined,
  );
  assert.deepStrictEqual(
    bot.getFollowersFirstCursor(ctx, "non-existent"),
    null,
  );
  assert.deepStrictEqual(bot.getFollowersFirstCursor(ctx, "bot"), "0");
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

test("BotImpl.onVote()", async (t) => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");

  // Create a poll first
  const pollId = "01950000-0000-7000-8000-000000000000";
  const poll = new Create({
    id: new URL(`https://example.com/ap/create/${pollId}`),
    actor: ctx.getActorUri(bot.identifier),
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(bot.identifier),
    object: new Question({
      id: new URL(`https://example.com/ap/question/${pollId}`),
      attribution: ctx.getActorUri(bot.identifier),
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(bot.identifier),
      content: "What's your favorite color?",
      inclusiveOptions: [],
      exclusiveOptions: [
        new Note({ name: "Red", replies: new Collection({ totalItems: 0 }) }),
        new Note({ name: "Blue", replies: new Collection({ totalItems: 0 }) }),
        new Note({ name: "Green", replies: new Collection({ totalItems: 0 }) }),
      ],
      endTime: Temporal.Now.instant().add({ hours: 24 }),
      voters: 0,
    }),
    published: Temporal.Now.instant(),
  });
  await repository.addMessage(pollId, poll);

  // Create a voter
  const voter = new Person({
    id: new URL("https://hollo.social/@alice"),
    preferredUsername: "alice",
  });

  let receivedVote: Vote<void> | null = null;
  bot.onVote = (_session, vote) => {
    receivedVote = vote;
  };

  await t.test("vote on single choice poll", async () => {
    ctx.sentActivities = [];
    ctx.forwardedRecipients = [];
    receivedVote = null;

    // Create a vote
    const voteCreate = new Create({
      id: new URL("https://example.com/ap/create/vote1"),
      actor: voter,
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: new URL("https://example.com/ap/note/vote1"),
        attribution: voter,
        to: PUBLIC_COLLECTION,
        name: "Red",
        replyTarget: poll.objectId,
        content: "Red",
      }),
      published: Temporal.Now.instant(),
    });

    // Process the vote
    await bot.onCreated(ctx, voteCreate);

    // Check that onVote was called
    assert.ok(receivedVote != null, "onVote should have been called");
    const vote = receivedVote as Vote<void>;
    assert.deepStrictEqual(vote.actor.id, voter.id);
    assert.deepStrictEqual(vote.option, "Red");
    assert.deepStrictEqual(vote.poll.multiple, false);
    assert.deepStrictEqual(vote.poll.options, ["Red", "Blue", "Green"]);

    // Check that Update activity was sent
    assert.ok(ctx.sentActivities.length > 0, "Update activity should be sent");
    const updateActivity = ctx.sentActivities.find(
      ({ activity }: { activity: Activity }) => activity instanceof Update,
    );
    assert.ok(updateActivity != null, "Update activity should be found");
    assert.ok(updateActivity.activity instanceof Update);
    assert.deepStrictEqual(
      updateActivity.activity.objectId,
      poll.id,
    );

    // Check that vote count was updated in repository
    const updatedPoll = await repository.getMessage(pollId);
    assert.ok(updatedPoll instanceof Create);
    const updatedQuestion = await updatedPoll.getObject(ctx);
    assert.ok(updatedQuestion instanceof Question);
    const updatedOptions = await Array.fromAsync(
      updatedQuestion.getExclusiveOptions(ctx),
    );
    const redOption = updatedOptions.find((opt) =>
      opt.name?.toString() === "Red"
    );
    assert.ok(redOption != null);
    const replies = await redOption.getReplies(ctx);
    assert.deepStrictEqual(replies?.totalItems, 1);
  });

  await t.test("vote on multiple choice poll", async () => {
    // Create a multiple choice poll
    const multiPollId = "01950000-0000-7000-8000-000000000001";
    const multiPoll = new Create({
      id: new URL(`https://example.com/ap/create/${multiPollId}`),
      actor: ctx.getActorUri(bot.identifier),
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(bot.identifier),
      object: new Question({
        id: new URL(`https://example.com/ap/question/${multiPollId}`),
        attribution: ctx.getActorUri(bot.identifier),
        to: PUBLIC_COLLECTION,
        cc: ctx.getFollowersUri(bot.identifier),
        content: "Which languages do you know?",
        inclusiveOptions: [
          new Note({
            name: "JavaScript",
            replies: new Collection({ totalItems: 0 }),
          }),
          new Note({
            name: "TypeScript",
            replies: new Collection({ totalItems: 0 }),
          }),
          new Note({
            name: "Python",
            replies: new Collection({ totalItems: 0 }),
          }),
        ],
        exclusiveOptions: [],
        endTime: Temporal.Now.instant().add({ hours: 24 }),
        voters: 0,
      }),
      published: Temporal.Now.instant(),
    });
    await repository.addMessage(multiPollId, multiPoll);

    ctx.sentActivities = [];
    ctx.forwardedRecipients = [];
    receivedVote = null;

    // Create a vote for JavaScript
    const jsVoteCreate = new Create({
      id: new URL("https://example.com/ap/create/vote2"),
      actor: voter,
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: new URL("https://example.com/ap/note/vote2"),
        attribution: voter,
        to: PUBLIC_COLLECTION,
        name: "JavaScript",
        replyTarget: multiPoll.objectId,
        content: "JavaScript",
      }),
      published: Temporal.Now.instant(),
    });

    // Process the vote
    await bot.onCreated(ctx, jsVoteCreate);

    // Check that onVote was called
    assert.ok(receivedVote != null, "onVote should have been called");
    const vote = receivedVote as Vote<void>;
    assert.deepStrictEqual(vote.actor.id, voter.id);
    assert.deepStrictEqual(vote.option, "JavaScript");
    assert.deepStrictEqual(vote.poll.multiple, true);
    assert.deepStrictEqual(vote.poll.options, [
      "JavaScript",
      "TypeScript",
      "Python",
    ]);
  });

  await t.test("ignore vote from poll author", async () => {
    ctx.sentActivities = [];
    ctx.forwardedRecipients = [];
    receivedVote = null;

    // Create a vote from the bot itself
    const selfVoteCreate = new Create({
      id: new URL("https://example.com/ap/create/vote3"),
      actor: ctx.getActorUri(bot.identifier),
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: new URL("https://example.com/ap/note/vote3"),
        attribution: ctx.getActorUri(bot.identifier),
        to: PUBLIC_COLLECTION,
        name: "Red",
        replyTarget: poll.objectId,
        content: "Red",
      }),
      published: Temporal.Now.instant(),
    });

    // Process the vote
    await bot.onCreated(ctx, selfVoteCreate);

    // Check that onVote was NOT called
    assert.deepStrictEqual(
      receivedVote,
      null,
      "onVote should not be called for poll author",
    );
  });

  await t.test("ignore vote on expired poll", async () => {
    // Create an expired poll
    const expiredPollId = "01950000-0000-7000-8000-000000000002";
    const expiredPoll = new Create({
      id: new URL(`https://example.com/ap/create/${expiredPollId}`),
      actor: ctx.getActorUri(bot.identifier),
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(bot.identifier),
      object: new Question({
        id: new URL(`https://example.com/ap/question/${expiredPollId}`),
        attribution: ctx.getActorUri(bot.identifier),
        to: PUBLIC_COLLECTION,
        cc: ctx.getFollowersUri(bot.identifier),
        content: "Expired poll?",
        inclusiveOptions: [],
        exclusiveOptions: [
          new Note({ name: "Yes", replies: new Collection({ totalItems: 0 }) }),
          new Note({ name: "No", replies: new Collection({ totalItems: 0 }) }),
        ],
        endTime: Temporal.Now.instant().subtract({ hours: 1 }), // Expired
        voters: 0,
      }),
      published: Temporal.Now.instant(),
    });
    await repository.addMessage(expiredPollId, expiredPoll);

    ctx.sentActivities = [];
    ctx.forwardedRecipients = [];
    receivedVote = null;

    // Create a vote on expired poll
    const expiredVoteCreate = new Create({
      id: new URL("https://example.com/ap/create/vote4"),
      actor: voter,
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: new URL("https://example.com/ap/note/vote4"),
        attribution: voter,
        to: PUBLIC_COLLECTION,
        name: "Yes",
        replyTarget: expiredPoll.objectId,
        content: "Yes",
      }),
      published: Temporal.Now.instant(),
    });

    // Process the vote
    await bot.onCreated(ctx, expiredVoteCreate);

    // Check that onVote was NOT called
    assert.deepStrictEqual(
      receivedVote,
      null,
      "onVote should not be called for expired poll",
    );
  });

  await t.test("ignore vote with invalid option", async () => {
    ctx.sentActivities = [];
    ctx.forwardedRecipients = [];
    receivedVote = null;

    // Create a vote with invalid option
    const invalidVoteCreate = new Create({
      id: new URL("https://example.com/ap/create/vote5"),
      actor: voter,
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: new URL("https://example.com/ap/note/vote5"),
        attribution: voter,
        to: PUBLIC_COLLECTION,
        name: "Purple", // Not a valid option
        replyTarget: poll.objectId,
        content: "Purple",
      }),
      published: Temporal.Now.instant(),
    });

    // Process the vote
    await bot.onCreated(ctx, invalidVoteCreate);

    // Check that onVote was NOT called
    assert.deepStrictEqual(
      receivedVote,
      null,
      "onVote should not be called for invalid option",
    );
  });
});

// cSpell: ignore thumbsup
