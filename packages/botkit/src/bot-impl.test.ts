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
import type { UnverifiedActivityReason } from "@fedify/fedify";
import { type InboxContext, MemoryKvStore } from "@fedify/fedify/federation";
import {
  Accept,
  type Activity,
  type Actor,
  Announce,
  Article,
  Collection,
  Create,
  Delete,
  Emoji,
  EmojiReact,
  Follow,
  Image,
  InteractionPolicy,
  InteractionRule,
  Like as RawLike,
  Link,
  Mention,
  Note,
  Person,
  Place,
  PropertyValue,
  PUBLIC_COLLECTION,
  Question,
  QuoteAuthorization,
  QuoteRequest,
  type Recipient,
  Reject,
  Service,
  Undo,
  Update,
} from "@fedify/vocab";
import { configureSync, type LogRecord, resetSync } from "@logtape/logtape";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BotImpl, MigrationGatedRepository } from "./bot-impl.ts";
import type { CustomEmoji } from "./emoji.ts";
import type { FollowRequest } from "./follow.ts";
import { createMessage, isQuoteLink } from "./message-impl.ts";
import type {
  AuthorizedMessage,
  Message,
  MessageClass,
  SharedMessage,
} from "./message.ts";
import type { Vote } from "./poll.ts";
import type { Like, Reaction } from "./reaction.ts";
import { MemoryRepository, type Uuid } from "./repository.ts";
import { SessionImpl } from "./session-impl.ts";
import type { Session } from "./session.ts";
import { hideRepositoryMethods } from "./helpers.ts";
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
  const keys = await repository.getKeyPairs("bot");
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
  const storedKeyPairs = await repository.getKeyPairs("bot");
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
    "bot",
    new URL("https://example.com/actor/1#follow"),
    new Person({
      id: new URL("https://example.com/actor/1"),
      preferredUsername: "john",
      inbox: new URL("https://example.com/actor/1/inbox"),
    }),
  );
  await repository.addFollower(
    "bot",
    new URL("https://example.com/actor/2#follow"),
    new Person({
      id: new URL("https://example.com/actor/2"),
      preferredUsername: "jane",
      inbox: new URL("https://example.com/actor/2/inbox"),
    }),
  );
  await repository.addFollower(
    "bot",
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
    "bot",
    new URL("https://example.com/actor/1#follow"),
    new Person({
      id: new URL("https://example.com/actor/1"),
      preferredUsername: "john",
      inbox: new URL("https://example.com/actor/1/inbox"),
    }),
  );
  await repository.addFollower(
    "bot",
    new URL("https://example.com/actor/2#follow"),
    new Person({
      id: new URL("https://example.com/actor/2"),
      preferredUsername: "jane",
      inbox: new URL("https://example.com/actor/2/inbox"),
    }),
  );
  await repository.addFollower(
    "bot",
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
    "bot",
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
    "bot",
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
    "bot",
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
    "bot",
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
    "bot",
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
    "bot",
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
    "bot",
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
    await bot.dispatchFollow(ctx, {
      identifier: "bot",
      id: crypto.randomUUID(),
    }),
    null,
  );

  await repository.addSentFollow(
    "bot",
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
    identifier: "bot",
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
    "bot",
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
  const setSignedKeyOwner = (owner: Actor | null) => {
    Object.defineProperty(ctx, "getSignedKeyOwner", {
      value: () => Promise.resolve(owner),
      writable: true,
      configurable: true,
    });
  };
  setSignedKeyOwner(
    new Person({ id: new URL("https://example.com/ap/actor/john") }),
  );
  assert.ok(
    await bot.authorizeFollow(
      ctx,
      { identifier: "bot", id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
    ),
  );
  setSignedKeyOwner(await new SessionImpl(bot, ctx).getActor());
  assert.ok(
    await bot.authorizeFollow(
      ctx,
      { identifier: "bot", id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
    ),
  );
  setSignedKeyOwner(
    new Person({ id: new URL("https://example.com/ap/actor/alice") }),
  );
  assert.deepStrictEqual(
    await bot.authorizeFollow(
      ctx,
      { identifier: "bot", id: "b51f6ca8-53e6-4f7d-ac1f-d039e8c6df5a" },
    ),
    false,
  );
  setSignedKeyOwner(
    new Person({ id: new URL("https://example.com/ap/actor/john") }),
  );
  assert.deepStrictEqual(
    await bot.authorizeFollow(
      ctx,
      { identifier: "bot", id: crypto.randomUUID() },
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
    await bot.dispatchCreate(ctx, { identifier: "bot", id: "non-existent" }),
    null,
  );

  await repository.addMessage(
    "bot",
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
    identifier: "bot",
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
      identifier: "bot",
      id: "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    }),
    create,
  );

  await repository.addMessage(
    "bot",
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
      identifier: "bot",
      id: "8386a4c7-06f8-409f-ad72-2bba43e83363",
    }),
    null,
  );
  const create2 = await bot.dispatchCreate(ctx2, {
    identifier: "bot",
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
    "bot",
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
      identifier: "bot",
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
    "bot",
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
    "bot",
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
    "bot",
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
    await bot.dispatchAnnounce(ctx, { identifier: "bot", id: "non-existent" }),
    null,
  );

  await repository.addMessage(
    "bot",
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
    identifier: "bot",
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
    "bot",
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
      identifier: "bot",
      id: "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    }),
    null,
  );

  await repository.addMessage(
    "bot",
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
      identifier: "bot",
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
    identifier: "bot",
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

test("BotImpl.onUnverifiedActivity()", async (t) => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const ctx = bot.federation.createContext(
    new Request("https://example.com/ap/inbox", { method: "POST" }),
    undefined,
  );
  const deleteActivity = new Delete({
    id: new URL("https://remote.example/activities/delete"),
    actor: new URL("https://remote.example/actors/deleted"),
    object: new URL("https://remote.example/actors/deleted"),
  });
  const createActivity = new Create({
    id: new URL("https://remote.example/activities/create"),
    actor: new URL("https://remote.example/actors/deleted"),
    object: new Note({
      id: new URL("https://remote.example/notes/1"),
      attribution: new URL("https://remote.example/actors/deleted"),
      content: "Hello, world!",
    }),
  });
  const keyFetch410: UnverifiedActivityReason = {
    type: "keyFetchError",
    keyId: new URL("https://remote.example/actors/deleted#main-key"),
    result: {
      status: 410,
      response: new Response(null, { status: 410 }),
    },
  };

  await t.test("acknowledges gone actor deletes", () => {
    const response = bot.onUnverifiedActivity(ctx, deleteActivity, keyFetch410);
    assert.ok(response instanceof Response);
    assert.deepStrictEqual(response.status, 202);
  });

  await t.test("ignores non-410 key fetch failures", () => {
    const reason: UnverifiedActivityReason = {
      ...keyFetch410,
      result: {
        status: 404,
        response: new Response(null, { status: 404 }),
      },
    };
    const response = bot.onUnverifiedActivity(ctx, deleteActivity, reason);
    assert.deepStrictEqual(response, undefined);
  });

  await t.test("ignores non-delete activities", () => {
    const response = bot.onUnverifiedActivity(ctx, createActivity, keyFetch410);
    assert.deepStrictEqual(response, undefined);
  });

  await t.test("ignores other verification failures", () => {
    const noSignature: UnverifiedActivityReason = { type: "noSignature" };
    const invalidSignature: UnverifiedActivityReason = {
      type: "invalidSignature",
      keyId: new URL("https://remote.example/actors/deleted#main-key"),
    };
    assert.deepStrictEqual(
      bot.onUnverifiedActivity(ctx, deleteActivity, noSignature),
      undefined,
    );
    assert.deepStrictEqual(
      bot.onUnverifiedActivity(ctx, deleteActivity, invalidSignature),
      undefined,
    );
  });
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
      assert.deepStrictEqual(await repository.countFollowers("bot"), 0);
    });

    await t.test("with wrong actor", async () => {
      const followWithWrongActor = new Follow({
        id: new URL("https://example.com/ap/actor/bot/follows/bot"),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new URL("https://example.com/ap/actor/bot"),
      });
      await bot.onFollowed(ctx, followWithWrongActor);
      assert.deepStrictEqual(await repository.countFollowers("bot"), 0);
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
      assert.deepStrictEqual(await repository.countFollowers("bot"), 0);
    });

    await t.test("with correct follow", async () => {
      const follow = new Follow({
        id: new URL("https://example.com/ap/actor/john/follows/bot"),
        actor,
        object: new URL("https://example.com/ap/actor/bot"),
      });
      await bot.onFollowed(ctx, follow);
      if (policy === "accept") {
        assert.deepStrictEqual(await repository.countFollowers("bot"), 1);
        assert.ok(
          await repository.hasFollower(
            "bot",
            new URL("https://example.com/ap/actor/john"),
          ),
        );
        const [storedFollower] = await Array.fromAsync(
          repository.getFollowers("bot"),
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
        assert.deepStrictEqual(await repository.countFollowers("bot"), 0);
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
    "bot",
    new URL("https://example.com/ap/actor/john/follows/bot"),
    new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    }),
  );

  async function assertNoEffect() {
    assert.deepStrictEqual(await repository.countFollowers("bot"), 1);
    const [follower] = await Array.fromAsync(repository.getFollowers("bot"));
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
    assert.deepStrictEqual(await repository.countFollowers("bot"), 0);
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

test("BotImpl.onUnfollowed() with multiple follow requests", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const unfollowed: [Session<void>, Actor][] = [];
  bot.onUnfollow = (session, actor) => void (unfollowed.push([session, actor]));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/john"),
    preferredUsername: "john",
  });
  const followA = new URL("https://example.com/ap/actor/john/follows/bot");
  const followB = new URL(
    "https://example.com/ap/actor/john/follows/bot-again",
  );

  await repository.addFollower("bot", followA, follower);
  await repository.addFollower("bot", followB, follower);

  await bot.onUnfollowed(
    ctx,
    new Undo({
      actor: follower.id,
      object: new Follow({ id: followA }),
    }),
  );
  assert.deepStrictEqual(await repository.countFollowers("bot"), 1);
  assert.ok(await repository.hasFollower("bot", follower.id!));
  assert.deepStrictEqual(unfollowed, []);

  await bot.onUnfollowed(
    ctx,
    new Undo({
      actor: follower.id,
      object: new Follow({ id: followB }),
    }),
  );
  assert.deepStrictEqual(await repository.countFollowers("bot"), 0);
  assert.deepStrictEqual(unfollowed.length, 1);
  const [session, actor] = unfollowed[0] as [Session<void>, Actor];
  assert.deepStrictEqual(session.bot, bot);
  assert.deepStrictEqual(actor.id, follower.id);
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
      "bot",
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
      "bot",
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
      "bot",
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
      "bot",
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
      "bot",
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
      "bot",
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
      "bot",
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
      await repository.getSentFollow(
        "bot",
        "3bca0b8e-503a-47ea-ad69-6b7c29369fbd",
      ),
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
    "bot",
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

  await t.test("on unauthorized FEP quote", async () => {
    const create = new Create({
      id: new URL(
        "https://example.com/ap/create/9cfd7129-4cf0-4505-90d8-3cac2dc42435",
      ),
      actor: new URL("https://example.com/ap/actor/john"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/john/followers"),
      object: new Note({
        id: new URL(
          "https://example.com/ap/note/9cfd7129-4cf0-4505-90d8-3cac2dc42435",
        ),
        attribution: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/john/followers"),
        content: "It's a FEP quote!",
        quote: new URL(
          "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
        ),
      }),
    });
    let quoted: [Session<void>, Message<MessageClass, void>][] = [];
    bot.onQuote = (session, msg) => void (quoted.push([session, msg]));

    await bot.onCreated(ctx, create);

    assert.deepStrictEqual(quoted, []);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, []);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);

    quoted = [];
    messaged = [];
    ctx.forwardedRecipients = [];
  });

  await t.test("on unauthorized FEP quote with fallback link", async () => {
    const targetId = new URL(
      "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
    );
    const create = new Create({
      id: new URL(
        "https://example.com/ap/create/9cfd7129-4cf0-4505-90d8-3cac2dc42436",
      ),
      actor: new URL("https://example.com/ap/actor/john"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/john/followers"),
      object: new Note({
        id: new URL(
          "https://example.com/ap/note/9cfd7129-4cf0-4505-90d8-3cac2dc42436",
        ),
        attribution: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/john/followers"),
        content: "It's a FEP quote with a fallback link!",
        quote: targetId,
        tags: [
          new Link({
            href: targetId,
            mediaType: "application/activity+json",
          }),
        ],
      }),
    });
    let quoted: [Session<void>, Message<MessageClass, void>][] = [];
    bot.onQuote = (session, msg) => void (quoted.push([session, msg]));

    await bot.onCreated(ctx, create);

    assert.deepStrictEqual(quoted, []);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, []);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);

    quoted = [];
    messaged = [];
    ctx.forwardedRecipients = [];
  });

  await t.test("on authorized FEP quote", async () => {
    const quoteId = new URL(
      "https://example.com/ap/note/9cfd7129-4cf0-4505-90d8-3cac2dc42435",
    );
    const targetId = new URL(
      "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
    );
    const authorizationId = "01950000-0000-7000-8000-000000000201" as Uuid;
    const authorizationUrl = new URL(
      "https://example.com/ap/actor/bot/quote-authorization/" +
        authorizationId,
    );
    await repository.addQuoteAuthorization(
      "bot",
      authorizationId,
      new QuoteAuthorization({
        id: authorizationUrl,
        attribution: new URL("https://example.com/ap/actor/bot"),
        interactingObject: quoteId,
        interactionTarget: targetId,
      }),
    );
    const create = new Create({
      id: new URL(
        "https://example.com/ap/create/9cfd7129-4cf0-4505-90d8-3cac2dc42435",
      ),
      actor: new URL("https://example.com/ap/actor/john"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/john/followers"),
      object: new Note({
        id: quoteId,
        attribution: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/john/followers"),
        content: "It's a FEP quote!",
        quote: targetId,
        quoteAuthorization: authorizationUrl,
      }),
    });
    let quoted: [Session<void>, Message<MessageClass, void>][] = [];
    bot.onQuote = (session, msg) => void (quoted.push([session, msg]));

    await bot.onCreated(ctx, create);

    assert.deepStrictEqual(quoted.length, 1);
    const [, msg] = quoted[0];
    assert.ok(msg.quoteTarget != null);
    assert.deepStrictEqual(
      msg.quoteTarget.id,
      targetId,
    );
    assert.deepStrictEqual(msg.quoteApproved, true);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, quoted);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, ["followers"]);

    quoted = [];
    messaged = [];
    ctx.forwardedRecipients = [];
  });

  await t.test("on authorized FEP quote update", async () => {
    const quoteId = new URL(
      "https://example.com/ap/note/9cfd7129-4cf0-4505-90d8-3cac2dc42439",
    );
    const targetId = new URL(
      "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
    );
    const authorizationId = "01950000-0000-7000-8000-000000000204" as Uuid;
    const authorizationUrl = new URL(
      "https://example.com/ap/actor/bot/quote-authorization/" +
        authorizationId,
    );
    await repository.addQuoteAuthorization(
      "bot",
      authorizationId,
      new QuoteAuthorization({
        id: authorizationUrl,
        attribution: new URL("https://example.com/ap/actor/bot"),
        interactingObject: quoteId,
        interactionTarget: targetId,
      }),
    );
    const update = new Update({
      id: new URL(
        "https://example.com/ap/update/9cfd7129-4cf0-4505-90d8-3cac2dc42439",
      ),
      actor: new URL("https://example.com/ap/actor/john"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/john/followers"),
      object: new Note({
        id: quoteId,
        attribution: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/john/followers"),
        content: "It's an approved FEP quote update!",
        quote: targetId,
        quoteAuthorization: authorizationUrl,
      }),
    });
    let quoted: [Session<void>, Message<MessageClass, void>][] = [];
    bot.onQuote = (session, msg) => void (quoted.push([session, msg]));

    await bot.onUpdated(ctx, update);

    assert.deepStrictEqual(quoted.length, 1);
    const [, msg] = quoted[0];
    assert.ok(msg.quoteTarget != null);
    assert.deepStrictEqual(msg.quoteTarget.id, targetId);
    assert.deepStrictEqual(msg.quoteApproved, true);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, quoted);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, ["followers"]);

    quoted = [];
    messaged = [];
    ctx.forwardedRecipients = [];
  });

  await t.test("on authorized FEP quote with mismatched fallback link", async () => {
    const quoteId = new URL(
      "https://example.com/ap/note/9cfd7129-4cf0-4505-90d8-3cac2dc42437",
    );
    const fallbackTargetId = new URL(
      "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168de",
    );
    const fepTargetId = new URL(
      "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168df",
    );
    await repository.addMessage(
      "bot",
      "a6358f1b-c978-49d3-8065-37a1df6168df",
      new Create({
        id: new URL(
          "https://example.com/ap/create/a6358f1b-c978-49d3-8065-37a1df6168df",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        object: new Note({
          id: fepTargetId,
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: PUBLIC_COLLECTION,
          cc: new URL("https://example.com/ap/actor/bot/followers"),
          content: "Another local post",
        }),
      }),
    );
    const authorizationId = "01950000-0000-7000-8000-000000000202" as Uuid;
    const authorizationUrl = new URL(
      "https://example.com/ap/actor/bot/quote-authorization/" +
        authorizationId,
    );
    await repository.addQuoteAuthorization(
      "bot",
      authorizationId,
      new QuoteAuthorization({
        id: authorizationUrl,
        attribution: new URL("https://example.com/ap/actor/bot"),
        interactingObject: quoteId,
        interactionTarget: fepTargetId,
      }),
    );
    const create = new Create({
      id: new URL(
        "https://example.com/ap/create/9cfd7129-4cf0-4505-90d8-3cac2dc42437",
      ),
      actor: new URL("https://example.com/ap/actor/john"),
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/john/followers"),
      object: new Note({
        id: quoteId,
        attribution: new Person({
          id: new URL("https://example.com/ap/actor/john"),
          preferredUsername: "john",
        }),
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/john/followers"),
        content: "It's a FEP quote with a mismatched fallback link!",
        quote: fepTargetId,
        quoteAuthorization: authorizationUrl,
        tags: [
          new Link({
            href: fallbackTargetId,
            mediaType: "application/activity+json",
          }),
        ],
      }),
    });
    let quoted: [Session<void>, Message<MessageClass, void>][] = [];
    bot.onQuote = (session, msg) => void (quoted.push([session, msg]));

    await bot.onCreated(ctx, create);

    assert.deepStrictEqual(quoted.length, 1);
    const [, msg] = quoted[0];
    assert.ok(msg.quoteTarget != null);
    assert.deepStrictEqual(
      msg.quoteTarget.id,
      fepTargetId,
    );
    assert.deepStrictEqual(msg.quoteApproved, true);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, quoted);
    assert.deepStrictEqual(ctx.sentActivities, []);
    assert.deepStrictEqual(ctx.forwardedRecipients, ["followers"]);

    quoted = [];
    messaged = [];
    ctx.forwardedRecipients = [];
  });

  await t.test("on authorized FEP quote with widened audience", async () => {
    const quoteId = new URL(
      "https://example.com/ap/note/9cfd7129-4cf0-4505-90d8-3cac2dc42438",
    );
    const targetId = new URL(
      "https://example.com/ap/note/a6358f1b-c978-49d3-8065-37a1df6168e0",
    );
    await repository.addMessage(
      "bot",
      "a6358f1b-c978-49d3-8065-37a1df6168e0",
      new Create({
        id: new URL(
          "https://example.com/ap/create/a6358f1b-c978-49d3-8065-37a1df6168e0",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        object: new Note({
          id: targetId,
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          content: "Followers only",
        }),
      }),
    );
    const authorizationId = "01950000-0000-7000-8000-000000000203" as Uuid;
    const authorizationUrl = new URL(
      "https://example.com/ap/actor/bot/quote-authorization/" +
        authorizationId,
    );
    await repository.addQuoteAuthorization(
      "bot",
      authorizationId,
      new QuoteAuthorization({
        id: authorizationUrl,
        attribution: new URL("https://example.com/ap/actor/bot"),
        interactingObject: quoteId,
        interactionTarget: targetId,
      }),
    );
    const actor = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
      followers: new URL("https://example.com/ap/actor/john/followers"),
    });
    const create = new Create({
      id: new URL(
        "https://example.com/ap/create/9cfd7129-4cf0-4505-90d8-3cac2dc42438",
      ),
      actor,
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: quoteId,
        attribution: actor,
        to: PUBLIC_COLLECTION,
        content: "It's a public FEP quote of a followers-only post!",
        quote: targetId,
        quoteAuthorization: authorizationUrl,
      }),
    });
    let quoted: [Session<void>, Message<MessageClass, void>][] = [];
    bot.onQuote = (session, msg) => void (quoted.push([session, msg]));

    await bot.onCreated(ctx, create);

    assert.deepStrictEqual(quoted, []);
    assert.deepStrictEqual(replied, []);
    assert.deepStrictEqual(mentioned, []);
    assert.deepStrictEqual(messaged, []);
    assert.deepStrictEqual(ctx.sentActivities.length, 2);
    const [actorDelete, followersDelete] = ctx.sentActivities;
    assert.deepStrictEqual(
      actorDelete.recipients,
      [actor],
    );
    assert.ok(actorDelete.activity instanceof Delete);
    assert.deepStrictEqual(actorDelete.activity.objectId, authorizationUrl);
    assert.deepStrictEqual(followersDelete.recipients, "followers");
    assert.ok(followersDelete.activity instanceof Delete);
    assert.deepStrictEqual(followersDelete.activity.objectId, authorizationUrl);
    assert.deepStrictEqual(ctx.forwardedRecipients, []);

    quoted = [];
    messaged = [];
    ctx.sentActivities = [];
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
      id: new URL("https://example.com/notes/1"),
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
      id: new URL("https://example.com/notes/1"),
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
      id: new URL("https://example.com/notes/1"),
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
      id: new URL("https://example.com/notes/1"),
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
      id: new URL("https://example.com/notes/1"),
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
      id: new URL("https://example.com/notes/1"),
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
      id: new URL("https://example.com/notes/1"),
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
      version: "1.2.3",
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
      version: "1.2.3",
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

test("MigrationGatedRepository tolerates missing quote reference indexes", async () => {
  const underlying = hideRepositoryMethods(new MemoryRepository(), [
    "findQuoteAuthorizationReferenceIdentifiers",
    "findQuoteAuthorizationReferenceAttribution",
  ]);
  const repository = new MigrationGatedRepository(underlying, "bot");
  const records: LogRecord[] = [];

  configureSync({
    sinks: {
      capture: (record) => records.push(record),
    },
    loggers: [
      {
        category: ["botkit", "bot"],
        sinks: ["capture"],
        lowestLevel: "warning",
      },
      {
        category: ["logtape", "meta"],
        lowestLevel: null,
      },
    ],
    reset: true,
  });

  try {
    assert.deepStrictEqual(
      await Array.fromAsync(
        repository.findQuoteAuthorizationReferenceIdentifiers(
          new URL("https://remote.example/stamps/1"),
        ),
      ),
      [],
    );
    assert.deepStrictEqual(
      await Array.fromAsync(
        repository.findQuoteAuthorizationReferenceIdentifiers(
          new URL("https://remote.example/stamps/1"),
        ),
      ),
      [],
    );
    assert.deepStrictEqual(
      await repository.findQuoteAuthorizationReferenceAttribution(
        "bot",
        new URL("https://remote.example/stamps/1"),
      ),
      undefined,
    );
    assert.deepStrictEqual(
      await repository.findQuoteAuthorizationReferenceAttribution(
        "bot",
        new URL("https://remote.example/stamps/1"),
      ),
      undefined,
    );
  } finally {
    resetSync();
  }

  assert.deepStrictEqual(
    records.map((record) => record.properties.method),
    [
      "findQuoteAuthorizationReferenceIdentifiers",
      "findQuoteAuthorizationReferenceAttribution",
    ],
  );
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

test("BotImpl.fetch() includes FEP-5711 inverse properties", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    collectionWindow: 1,
  });
  const actorId = new URL("https://example.com/ap/actor/bot");

  await repository.addFollower(
    "bot",
    new URL("https://example.com/actor/1#follow"),
    new Person({
      id: new URL("https://example.com/actor/1"),
      preferredUsername: "john",
      inbox: new URL("https://example.com/actor/1/inbox"),
    }),
  );
  await repository.addMessage(
    "bot",
    "78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
    new Create({
      id: new URL(
        "https://example.com/ap/actor/bot/create/78acb1ea-4ac6-46b7-bcd4-3a8965d8126e",
      ),
      actor: actorId,
      to: PUBLIC_COLLECTION,
      cc: new URL("https://example.com/ap/actor/bot/followers"),
      object: new Note({
        id: new URL("https://example.com/ap/actor/bot/note/1"),
        attribution: actorId,
        to: PUBLIC_COLLECTION,
        cc: new URL("https://example.com/ap/actor/bot/followers"),
        content: "Hello, world!",
        published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
      }),
      published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
    }),
  );

  const actorResponse = await bot.fetch(
    new Request("https://example.com/ap/actor/bot", {
      headers: { accept: "application/activity+json" },
    }),
  );
  assert.deepStrictEqual(actorResponse.status, 200);
  const actorJson = await actorResponse.json();
  assert.deepStrictEqual(actorJson.id, actorId.href);
  assert.deepStrictEqual(
    actorJson.followers,
    "https://example.com/ap/actor/bot/followers",
  );
  assert.deepStrictEqual(
    actorJson.outbox,
    "https://example.com/ap/actor/bot/outbox",
  );

  const outboxResponse = await bot.fetch(
    new Request("https://example.com/ap/actor/bot/outbox", {
      headers: { accept: "application/activity+json" },
    }),
  );
  assert.deepStrictEqual(outboxResponse.status, 200);
  const outboxJson = await outboxResponse.json();
  assert.deepStrictEqual(outboxJson.type, "OrderedCollection");
  assert.deepStrictEqual(
    outboxJson.id,
    "https://example.com/ap/actor/bot/outbox",
  );
  assert.deepStrictEqual(outboxJson.totalItems, 1);
  assert.deepStrictEqual(
    outboxJson.first,
    "https://example.com/ap/actor/bot/outbox?cursor=",
  );
  assert.deepStrictEqual(outboxJson.outboxOf, actorId.href);

  const outboxPageResponse = await bot.fetch(
    new Request("https://example.com/ap/actor/bot/outbox?cursor=", {
      headers: { accept: "application/activity+json" },
    }),
  );
  assert.deepStrictEqual(outboxPageResponse.status, 200);
  const outboxPageJson = await outboxPageResponse.json();
  assert.deepStrictEqual(outboxPageJson.type, "OrderedCollectionPage");
  assert.deepStrictEqual(
    outboxPageJson.id,
    "https://example.com/ap/actor/bot/outbox?cursor=",
  );
  assert.deepStrictEqual(
    outboxPageJson.partOf,
    "https://example.com/ap/actor/bot/outbox",
  );
  assert.deepStrictEqual(outboxPageJson.outboxOf, actorId.href);

  const followersResponse = await bot.fetch(
    new Request("https://example.com/ap/actor/bot/followers", {
      headers: { accept: "application/activity+json" },
    }),
  );
  assert.deepStrictEqual(followersResponse.status, 200);
  const followersJson = await followersResponse.json();
  assert.deepStrictEqual(followersJson.type, "OrderedCollection");
  assert.deepStrictEqual(
    followersJson.id,
    "https://example.com/ap/actor/bot/followers",
  );
  assert.deepStrictEqual(followersJson.totalItems, 1);
  assert.deepStrictEqual(
    followersJson.first,
    "https://example.com/ap/actor/bot/followers?cursor=0",
  );
  assert.deepStrictEqual(followersJson.followersOf, actorId.href);

  const followersPageResponse = await bot.fetch(
    new Request("https://example.com/ap/actor/bot/followers?cursor=0", {
      headers: { accept: "application/activity+json" },
    }),
  );
  assert.deepStrictEqual(followersPageResponse.status, 200);
  const followersPageJson = await followersPageResponse.json();
  assert.deepStrictEqual(followersPageJson.type, "OrderedCollectionPage");
  assert.deepStrictEqual(
    followersPageJson.id,
    "https://example.com/ap/actor/bot/followers?cursor=0",
  );
  assert.deepStrictEqual(
    followersPageJson.partOf,
    "https://example.com/ap/actor/bot/followers",
  );
  assert.deepStrictEqual(followersPageJson.followersOf, actorId.href);
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
  forwardedActivities: {
    recipients: "followers" | Recipient[];
    options: unknown;
  }[];
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
  Object.defineProperty(ctx, "recipient", {
    value: recipient ?? null,
    writable: true,
    configurable: true,
  });
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
  ctx.forwardedActivities = [];
  ctx.forwardActivity = (_, recipients, options) => {
    ctx.forwardedActivities.push({
      recipients: recipients === "followers"
        ? "followers"
        : Array.isArray(recipients)
        ? recipients
        : [recipients],
      options,
    });
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
  await repository.addMessage("bot", pollId, poll);

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
    const updatedPoll = await repository.getMessage("bot", pollId);
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
    await repository.addMessage("bot", multiPollId, multiPoll);

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
    await repository.addMessage("bot", expiredPollId, expiredPoll);

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

test("BotImpl.fetch() redirects legacy object URIs", async (t) => {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });

  await t.test("redirects GET requests", async () => {
    const response = await bot.fetch(
      new Request(
        "https://example.com/ap/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
      ),
      undefined,
    );
    assert.deepStrictEqual(response.status, 301);
    assert.deepStrictEqual(
      response.headers.get("Location"),
      "https://example.com/ap/actor/bot/follow/2ca58e2a-a34a-43e6-81af-c4f21ffed0c5",
    );
  });

  await t.test("redirects HEAD requests", async () => {
    const response = await bot.fetch(
      new Request("https://example.com/ap/note/123", { method: "HEAD" }),
      undefined,
    );
    assert.deepStrictEqual(response.status, 301);
    assert.deepStrictEqual(
      response.headers.get("Location"),
      "https://example.com/ap/actor/bot/note/123",
    );
  });

  await t.test("preserves the query string", async () => {
    const response = await bot.fetch(
      new Request("https://example.com/ap/note/123?foo=bar"),
      undefined,
    );
    assert.deepStrictEqual(response.status, 301);
    assert.deepStrictEqual(
      response.headers.get("Location"),
      "https://example.com/ap/actor/bot/note/123?foo=bar",
    );
  });

  await t.test("does not redirect POST requests", async () => {
    const response = await bot.fetch(
      new Request("https://example.com/ap/note/123", { method: "POST" }),
      undefined,
    );
    assert.notDeepStrictEqual(response.status, 301);
  });

  await t.test("does not redirect canonical or unrelated paths", async () => {
    const canonical = await bot.fetch(
      new Request("https://example.com/ap/actor/bot/note/123"),
      undefined,
    );
    assert.notDeepStrictEqual(canonical.status, 301);
    const inbox = await bot.fetch(
      new Request("https://example.com/ap/inbox"),
      undefined,
    );
    assert.notDeepStrictEqual(inbox.status, 301);
  });
});

test("BotImpl.onFollowAccepted() accepts quote approvals", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const targetUrl = new URL("https://remote.example/@alice/notes/original");
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
    url: targetUrl,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  let accepted: AuthorizedMessage<MessageClass, void> | undefined;
  let approver: Actor | undefined;
  bot.onQuoteAccepted = (_session, message, actor) => {
    accepted = message;
    approver = actor;
  };
  ctx.sentActivities = [];

  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteAuthorizationId, authorization.id);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    messageId,
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 2);
  assert.deepStrictEqual(ctx.sentActivities[0].recipients, "followers");
  assert.ok(ctx.sentActivities[0].activity instanceof Update);
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, [author]);
  assert.ok(ctx.sentActivities[1].activity instanceof Update);
  assert.deepStrictEqual(accepted?.id, quote.id);
  assert.deepStrictEqual(accepted?.quoteApprovalState, "accepted");
  assert.deepStrictEqual(approver?.id, author.id);
});

test("BotImpl.onFollowAccepted() validates quote approvals with signed fetch", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/followers-only"),
    attribution: author,
    content: "Followers only.",
    to: author.followersId,
  });
  const defaultDocumentLoader = ctx.documentLoader;
  const signedDocumentLoader: Awaited<
    ReturnType<typeof ctx.getDocumentLoader>
  > = (url, options) => defaultDocumentLoader(url, options);
  Object.defineProperty(ctx, "getDocumentLoader", {
    value: () => Promise.resolve(signedDocumentLoader),
  });
  let usedSignedFetch = false;
  Object.defineProperty(ctx, "lookupObject", {
    value: (
      id: URL,
      options?: Parameters<typeof ctx.lookupObject>[1],
    ) => {
      if (
        id.href === target.id?.href &&
        options?.documentLoader === signedDocumentLoader
      ) {
        usedSignedFetch = true;
        return Promise.resolve(target);
      }
      return Promise.resolve(null);
    },
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });

  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.ok(usedSignedFetch);
  assert.deepStrictEqual(object.quoteAuthorizationId, authorization.id);
});

test("BotImpl.onFollowAccepted() sends quote updates to reply targets", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const replyAuthor = new Person({
    id: new URL("https://reply.example/users/bob"),
    preferredUsername: "bob",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  const replyTarget = new Note({
    id: new URL("https://reply.example/notes/thread"),
    attribution: replyAuthor,
    content: "Thread starter.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(
        id.href === target.id?.href
          ? target
          : id.href === replyTarget.id?.href
          ? replyTarget
          : null,
      ),
  });
  const targetMessage = await createMessage(target, session, {});
  const replyMessage = await createMessage(replyTarget, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
    replyTarget: replyMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  ctx.sentActivities = [];

  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 3);
  assert.deepStrictEqual(ctx.sentActivities[0].recipients, "followers");
  assert.ok(ctx.sentActivities[0].activity instanceof Update);
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, [replyAuthor]);
  assert.ok(ctx.sentActivities[1].activity instanceof Update);
  assert.deepStrictEqual(ctx.sentActivities[2].recipients, [author]);
  assert.ok(ctx.sentActivities[2].activity instanceof Update);
});

test("BotImpl.onFollowAccepted() deduplicates quote update recipients", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  const replyTarget = new Note({
    id: new URL("https://remote.example/notes/thread"),
    attribution: author,
    content: "Thread starter.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(
        id.href === target.id?.href
          ? target
          : id.href === replyTarget.id?.href
          ? replyTarget
          : id.href === author.id?.href
          ? author
          : null,
      ),
  });
  const targetMessage = await createMessage(target, session, {
    [author.id!.href]: author,
  });
  const replyMessage = await createMessage(replyTarget, session, {
    [author.id!.href]: author,
  });
  const quote = await session.publish(text`Please approve this, ${author}.`, {
    quoteTarget: targetMessage,
    replyTarget: replyMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  ctx.sentActivities = [];

  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 2);
  assert.deepStrictEqual(ctx.sentActivities[0].recipients, "followers");
  assert.ok(ctx.sentActivities[0].activity instanceof Update);
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, [author]);
  assert.ok(ctx.sentActivities[1].activity instanceof Update);
});

test("BotImpl.onFollowAccepted() preserves concurrent quote updates", async () => {
  class ConcurrentUpdateRepository extends MemoryRepository {
    override async updateMessage(
      identifier: string,
      id: Uuid,
      updater: (
        existing: Create | Announce,
      ) =>
        | Create
        | Announce
        | undefined
        | Promise<Create | Announce | undefined>,
    ): Promise<boolean> {
      if (identifier === "bot") {
        const existing = await this.getMessage(identifier, id);
        if (existing instanceof Create) {
          const object = await existing.getObject();
          if (object instanceof Note) {
            await super.updateMessage(
              identifier,
              id,
              (current) =>
                current instanceof Create
                  ? current.clone({
                    object: object.clone({
                      content: "Edited while approval was in flight.",
                    }),
                  })
                  : current,
            );
          }
        }
      }
      return await super.updateMessage(identifier, id, updater);
    }
  }
  const repository = new ConcurrentUpdateRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });

  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(
    object.content,
    "Edited while approval was in flight.",
  );
  assert.deepStrictEqual(object.quoteAuthorizationId, authorization.id);
});

test("BotImpl.onFollowAccepted() cleans references after update failures", async () => {
  class FailingUpdateRepository extends MemoryRepository {
    override updateMessage(
      identifier: string,
      id: Uuid,
      updater: (
        existing: Create | Announce,
      ) =>
        | Create
        | Announce
        | undefined
        | Promise<Create | Announce | undefined>,
    ): Promise<boolean> {
      if (identifier === "bot") {
        return Promise.reject(new TypeError("Message update failed."));
      }
      return super.updateMessage(identifier, id, updater);
    }
  }
  const repository = new FailingUpdateRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  ctx.sentActivities = [];

  await assert.rejects(
    () =>
      bot.onFollowAccepted(
        ctx,
        new Accept({
          actor: author,
          object: ctx.getObjectUri(QuoteRequest, {
            identifier: bot.identifier,
            id: messageId,
          }),
          result: authorization,
        }),
      ),
    TypeError,
    "Message update failed.",
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    undefined,
  );
  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteAuthorizationId, null);
  assert.deepStrictEqual(ctx.sentActivities.length, 0);
});

test("BotImpl.onFollowAccepted() cleans references after missing updates", async () => {
  class MissingUpdateRepository extends MemoryRepository {
    override updateMessage(
      identifier: string,
      id: Uuid,
      updater: (
        existing: Create | Announce,
      ) =>
        | Create
        | Announce
        | undefined
        | Promise<Create | Announce | undefined>,
    ): Promise<boolean> {
      if (identifier === "bot") return Promise.resolve(false);
      return super.updateMessage(identifier, id, updater);
    }
  }
  const repository = new MissingUpdateRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  let accepted: AuthorizedMessage<MessageClass, void> | undefined;
  bot.onQuoteAccepted = (_session, message) => {
    accepted = message;
  };
  ctx.sentActivities = [];

  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    undefined,
  );
  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteAuthorizationId, null);
  assert.deepStrictEqual(ctx.sentActivities.length, 0);
  assert.deepStrictEqual(accepted, undefined);
});

test("BotImpl.onFollowRejected() strips rejected quotes", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const targetUrl = new URL("https://remote.example/@alice/notes/original");
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
    url: targetUrl,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  let rejected: AuthorizedMessage<MessageClass, void> | undefined;
  let rejecter: Actor | undefined;
  bot.onQuoteRejected = (_session, message, actor) => {
    rejected = message;
    rejecter = actor;
  };
  ctx.sentActivities = [];

  await bot.onFollowRejected(
    ctx,
    new Reject({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteId, null);
  assert.deepStrictEqual(object.quoteUrl, null);
  assert.deepStrictEqual(object.quoteAuthorizationId, null);
  assert.ok(!object.content?.toString().includes("quote-inline"));
  assert.ok(!object.content?.toString().includes(targetUrl.href));
  const tags = await Array.fromAsync(object.getTags(ctx));
  assert.ok(!tags.some((tag) => tag instanceof Link && isQuoteLink(tag)));
  assert.deepStrictEqual(ctx.sentActivities.length, 2);
  assert.deepStrictEqual(ctx.sentActivities[0].recipients, "followers");
  assert.ok(ctx.sentActivities[0].activity instanceof Update);
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, [author]);
  assert.ok(ctx.sentActivities[1].activity instanceof Update);
  assert.deepStrictEqual(rejected?.id, quote.id);
  assert.deepStrictEqual(rejected?.quoteTarget, undefined);
  assert.deepStrictEqual(rejecter?.id, author.id);
});

test("BotImpl.onFollowRejected() preserves concurrent quote updates", async () => {
  class ConcurrentUpdateRepository extends MemoryRepository {
    override async updateMessage(
      identifier: string,
      id: Uuid,
      updater: (
        existing: Create | Announce,
      ) =>
        | Create
        | Announce
        | undefined
        | Promise<Create | Announce | undefined>,
    ): Promise<boolean> {
      if (identifier === "bot") {
        const existing = await this.getMessage(identifier, id);
        if (existing instanceof Create) {
          const object = await existing.getObject();
          if (object instanceof Note) {
            await super.updateMessage(
              identifier,
              id,
              (current) =>
                current instanceof Create
                  ? current.clone({
                    object: object.clone({
                      content: "Edited while rejection was in flight.",
                    }),
                  })
                  : current,
            );
          }
        }
      }
      return await super.updateMessage(identifier, id, updater);
    }
  }
  const repository = new ConcurrentUpdateRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;

  await bot.onFollowRejected(
    ctx,
    new Reject({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(
    object.content,
    "Edited while rejection was in flight.",
  );
  assert.deepStrictEqual(object.quoteId, null);
  assert.deepStrictEqual(object.quoteUrl, null);
});

test("BotImpl.onDeleted() strips revoked quote authorizations", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const targetUrl = new URL("https://remote.example/@alice/notes/original");
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
    url: targetUrl,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    messageId,
  );
  let rejectedCalled = false;
  let revoked: AuthorizedMessage<MessageClass, void> | undefined;
  let revoker: Actor | undefined;
  bot.onQuoteRejected = () => {
    rejectedCalled = true;
  };
  bot.onQuoteRevoked = (_session, message, actor) => {
    revoked = message;
    revoker = actor;
  };
  ctx.sentActivities = [];
  ctx.forwardedRecipients = [];
  ctx.forwardedActivities = [];

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: author,
      object: authorization.id,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteId, null);
  assert.deepStrictEqual(object.quoteUrl, null);
  assert.deepStrictEqual(object.quoteAuthorizationId, null);
  assert.ok(!object.content?.toString().includes("quote-inline"));
  assert.ok(!object.content?.toString().includes(targetUrl.href));
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    undefined,
  );
  assert.deepStrictEqual(ctx.forwardedRecipients, ["followers", author]);
  assert.deepStrictEqual(ctx.forwardedActivities.length, 2);
  assert.deepStrictEqual(
    ctx.forwardedActivities[0].options,
    {
      skipIfUnsigned: true,
      preferSharedInbox: true,
      excludeBaseUris: [new URL("https://example.com")],
    },
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 2);
  assert.deepStrictEqual(ctx.sentActivities[0].recipients, "followers");
  assert.ok(ctx.sentActivities[0].activity instanceof Update);
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, [author]);
  assert.ok(ctx.sentActivities[1].activity instanceof Update);
  assert.deepStrictEqual(rejectedCalled, false);
  assert.deepStrictEqual(revoked?.id, quote.id);
  assert.deepStrictEqual(revoked?.quoteTarget, undefined);
  assert.deepStrictEqual(revoker?.id, author.id);
});

test("BotImpl.onDeleted() keeps newer quote authorizations", async () => {
  class ConcurrentQuoteAuthorizationRepository extends MemoryRepository {
    replaceOnNextUpdate = false;

    constructor(
      readonly replacementAuthorization: URL,
      readonly attribution: URL,
    ) {
      super();
    }

    override async updateMessage(
      identifier: string,
      id: Uuid,
      updater: (
        existing: Create | Announce,
      ) =>
        | Create
        | Announce
        | undefined
        | Promise<Create | Announce | undefined>,
    ): Promise<boolean> {
      if (identifier === "bot" && this.replaceOnNextUpdate) {
        this.replaceOnNextUpdate = false;
        const existing = await this.getMessage(identifier, id);
        if (existing instanceof Create) {
          const object = await existing.getObject();
          if (object instanceof Note) {
            await super.updateMessage(
              identifier,
              id,
              (current) =>
                current instanceof Create
                  ? current.clone({
                    object: object.clone({
                      quoteAuthorization: this.replacementAuthorization,
                    }),
                  })
                  : current,
            );
            await this.addQuoteAuthorizationReference(
              identifier,
              this.replacementAuthorization,
              id,
              this.attribution,
            );
          }
        }
      }
      return await super.updateMessage(identifier, id, updater);
    }
  }
  const newerAuthorization = new URL("https://remote.example/stamps/2");
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const repository = new ConcurrentQuoteAuthorizationRepository(
    newerAuthorization,
    author.id!,
  );
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const revokedAuthorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: revokedAuthorization,
    }),
  );
  let revoked: AuthorizedMessage<MessageClass, void> | undefined;
  bot.onQuoteRevoked = (_session, message) => {
    revoked = message;
  };
  repository.replaceOnNextUpdate = true;
  ctx.sentActivities = [];
  ctx.forwardedRecipients = [];
  ctx.forwardedActivities = [];

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: author,
      object: revokedAuthorization.id,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteId, target.id);
  assert.deepStrictEqual(object.quoteAuthorizationId, newerAuthorization);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      revokedAuthorization.id!,
    ),
    undefined,
  );
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      newerAuthorization,
    ),
    messageId,
  );
  assert.deepStrictEqual(ctx.forwardedRecipients, ["followers", author]);
  assert.deepStrictEqual(ctx.forwardedActivities.length, 2);
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(revoked, undefined);
});

test("BotImpl.onDeleted() ignores same-origin quote revocations without attribution", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const otherActor = new Person({
    id: new URL("https://remote.example/users/bob"),
    preferredUsername: "bob",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );
  let revoked: AuthorizedMessage<MessageClass, void> | undefined;
  let revoker: Actor | undefined;
  bot.onQuoteRevoked = (_session, message, actor) => {
    revoked = message;
    revoker = actor;
  };
  ctx.sentActivities = [];
  ctx.forwardedRecipients = [];
  ctx.forwardedActivities = [];

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: otherActor,
      object: authorization.id,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteId, target.id);
  assert.deepStrictEqual(object.quoteAuthorizationId, authorization.id);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    messageId,
  );
  assert.deepStrictEqual(ctx.forwardedRecipients, []);
  assert.deepStrictEqual(ctx.forwardedActivities, []);
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(revoked, undefined);
  assert.deepStrictEqual(revoker, undefined);
});

test("BotImpl.onDeleted() forwards quote revocations to mentions", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const messageId = "01950000-0000-7000-8000-000000000209" as Uuid;
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const mentioned = new Person({
    id: new URL("https://mentioned.example/users/bob"),
    preferredUsername: "bob",
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === mentioned.id?.href ? mentioned : null),
  });
  const authorization = new URL("https://remote.example/stamps/1");
  await repository.addMessage(
    "bot",
    messageId,
    new Create({
      id: new URL(`https://example.com/ap/actor/bot/create/${messageId}`),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new Note({
        id: new URL(`https://example.com/ap/actor/bot/note/${messageId}`),
        attribution: new URL("https://example.com/ap/actor/bot"),
        content: "Quote @bob.",
        tos: [ctx.getFollowersUri(bot.identifier), mentioned.id!],
        tags: [new Mention({ href: mentioned.id })],
        quote: new URL("https://remote.example/notes/original"),
        quoteAuthorization: authorization,
      }),
    }),
  );
  await repository.addQuoteAuthorizationReference(
    "bot",
    authorization,
    messageId,
    author.id!,
  );

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: author,
      object: authorization,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteId, null);
  assert.deepStrictEqual(object.quoteAuthorizationId, null);
  assert.deepStrictEqual(ctx.forwardedRecipients, [
    "followers",
    mentioned,
    author,
  ]);
  assert.deepStrictEqual(ctx.forwardedActivities.length, 2);
});

test("BotImpl.onDeleted() forwards quote revocations to reply targets", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const replyAuthor = new Person({
    id: new URL("https://reply.example/users/bob"),
    preferredUsername: "bob",
  });
  const mentioned = new Person({
    id: new URL("https://mentioned.example/users/carol"),
    preferredUsername: "carol",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  const replyTarget = new Note({
    id: new URL("https://reply.example/notes/thread"),
    attribution: replyAuthor,
    content: "Thread starter.",
    to: PUBLIC_COLLECTION,
  });
  let replyTargetLookups = 0;
  let mentionedLookups = 0;
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) => {
      if (id.href === target.id?.href) return Promise.resolve(target);
      if (id.href === replyTarget.id?.href) {
        replyTargetLookups++;
        return Promise.resolve(replyTarget);
      }
      if (id.href === mentioned.id?.href) {
        mentionedLookups++;
        return Promise.resolve(mentioned);
      }
      return Promise.resolve(null);
    },
  });
  const targetMessage = await createMessage(target, session, {});
  const replyMessage = await createMessage(replyTarget, session, {});
  const quote = await session.publish(
    text`Please approve this, ${mentioned}.`,
    {
      quoteTarget: targetMessage,
      replyTarget: replyMessage,
    },
  );
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );
  ctx.sentActivities = [];
  ctx.forwardedRecipients = [];
  ctx.forwardedActivities = [];
  replyTargetLookups = 0;
  mentionedLookups = 0;

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: author,
      object: authorization.id,
    }),
  );

  assert.deepStrictEqual(ctx.forwardedRecipients, [
    "followers",
    mentioned,
    replyAuthor,
    author,
  ]);
  assert.deepStrictEqual(ctx.forwardedActivities.length, 2);
  assert.deepStrictEqual(ctx.sentActivities.length, 4);
  assert.deepStrictEqual(ctx.sentActivities[0].recipients, "followers");
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, [mentioned]);
  assert.deepStrictEqual(ctx.sentActivities[2].recipients, [replyAuthor]);
  assert.deepStrictEqual(ctx.sentActivities[3].recipients, [author]);
  assert.deepStrictEqual(replyTargetLookups, 2);
  assert.deepStrictEqual(mentionedLookups, 2);
});

test("BotImpl.onDeleted() forwards private quote revocations only to the quote audience", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const messageId = "01950000-0000-7000-8000-000000000208" as Uuid;
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const authorization = new URL("https://remote.example/stamps/1");
  await repository.addMessage(
    "bot",
    messageId,
    new Create({
      id: new URL(`https://example.com/ap/actor/bot/create/${messageId}`),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new Note({
        id: new URL(`https://example.com/ap/actor/bot/note/${messageId}`),
        attribution: new URL("https://example.com/ap/actor/bot"),
        content: "Quote.",
        to: author.id,
        quote: new URL("https://remote.example/notes/original"),
        quoteAuthorization: authorization,
      }),
    }),
  );
  await repository.addQuoteAuthorizationReference(
    "bot",
    authorization,
    messageId,
    author.id!,
  );

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: author,
      object: authorization,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteId, null);
  assert.deepStrictEqual(object.quoteAuthorizationId, null);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference("bot", authorization),
    undefined,
  );
  assert.deepStrictEqual(ctx.forwardedRecipients, [author]);
  assert.deepStrictEqual(ctx.forwardedActivities.length, 1);
  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.deepStrictEqual(ctx.sentActivities[0].recipients, [author]);
  assert.ok(ctx.sentActivities[0].activity instanceof Update);
});

test("BotImpl.onDeleted() ignores quote revocations from wrong origins", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const messageId = "01950000-0000-7000-8000-000000000205" as Uuid;
  const authorization = new URL("https://remote.example/stamps/1");
  const revoker = new Person({
    id: new URL("https://evil.example/users/alice"),
    preferredUsername: "alice",
  });
  await repository.addMessage(
    "bot",
    messageId,
    new Create({
      id: new URL(`https://example.com/ap/actor/bot/create/${messageId}`),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: new URL(`https://example.com/ap/actor/bot/note/${messageId}`),
        attribution: new URL("https://example.com/ap/actor/bot"),
        content: "Quote.",
        to: PUBLIC_COLLECTION,
        quote: new URL("https://remote.example/notes/original"),
        quoteAuthorization: authorization,
      }),
    }),
  );
  await repository.addQuoteAuthorizationReference(
    "bot",
    authorization,
    messageId,
    revoker.id!,
  );
  let revoked = false;
  bot.onQuoteRevoked = () => {
    revoked = true;
  };

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: revoker,
      object: authorization,
    }),
  );

  assert.deepStrictEqual(revoked, false);
  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(ctx.forwardedRecipients, []);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference("bot", authorization),
    messageId,
  );
});

test("BotImpl.onDeleted() strips revoked quotes with missing targets", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const targetUrl = new URL("https://remote.example/@alice/notes/original");
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
    url: targetUrl,
  });
  let targetVisible = true;
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(
        targetVisible && id.href === target.id?.href ? target : null,
      ),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );
  targetVisible = false;
  ctx.sentActivities = [];

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: author,
      object: authorization.id,
    }),
  );

  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteId, null);
  assert.deepStrictEqual(object.quoteUrl, null);
  assert.deepStrictEqual(object.quoteAuthorizationId, null);
  assert.ok(!object.content?.toString().includes(targetUrl.href));
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    undefined,
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 2);
  assert.deepStrictEqual(ctx.sentActivities[0].recipients, "followers");
  assert.ok(ctx.sentActivities[0].activity instanceof Update);
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, [author]);
  assert.ok(ctx.sentActivities[1].activity instanceof Update);
});

test("BotImpl.onDeleted() keeps references after update failures", async () => {
  class FailingUpdateRepository extends MemoryRepository {
    #updateCount = 0;

    override updateMessage(
      identifier: string,
      id: Uuid,
      updater: (
        existing: Create | Announce,
      ) =>
        | Create
        | Announce
        | undefined
        | Promise<Create | Announce | undefined>,
    ): Promise<boolean> {
      this.#updateCount++;
      if (identifier === "bot" && this.#updateCount > 1) {
        return Promise.reject(new TypeError("Message update failed."));
      }
      return super.updateMessage(identifier, id, updater);
    }
  }
  const repository = new FailingUpdateRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );
  ctx.sentActivities = [];

  await assert.rejects(
    () =>
      bot.onDeleted(
        ctx,
        new Delete({
          actor: author,
          object: authorization.id,
        }),
      ),
    TypeError,
    "Message update failed.",
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    messageId,
  );
  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteAuthorizationId, authorization.id);
  assert.deepStrictEqual(ctx.sentActivities.length, 0);
});

test("BotImpl.onDeleted() removes references after missing updates", async () => {
  class MissingUpdateRepository extends MemoryRepository {
    #updateCount = 0;

    override updateMessage(
      identifier: string,
      id: Uuid,
      updater: (
        existing: Create | Announce,
      ) =>
        | Create
        | Announce
        | undefined
        | Promise<Create | Announce | undefined>,
    ): Promise<boolean> {
      this.#updateCount++;
      if (identifier === "bot" && this.#updateCount > 1) {
        return Promise.resolve(false);
      }
      return super.updateMessage(identifier, id, updater);
    }
  }
  const repository = new MissingUpdateRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const authorization = new QuoteAuthorization({
    id: new URL("https://remote.example/stamps/1"),
    attribution: author.id,
    interactingObject: quote.id,
    interactionTarget: target.id,
  });
  await bot.onFollowAccepted(
    ctx,
    new Accept({
      actor: author,
      object: ctx.getObjectUri(QuoteRequest, {
        identifier: bot.identifier,
        id: messageId,
      }),
      result: authorization,
    }),
  );
  let rejected: AuthorizedMessage<MessageClass, void> | undefined;
  bot.onQuoteRejected = (_session, message) => {
    rejected = message;
  };
  ctx.sentActivities = [];

  await bot.onDeleted(
    ctx,
    new Delete({
      actor: author,
      object: authorization.id,
    }),
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference(
      "bot",
      authorization.id!,
    ),
    undefined,
  );
  const stored = await repository.getMessage("bot", messageId);
  assert.ok(stored instanceof Create);
  const object = await stored.getObject(ctx);
  assert.ok(object instanceof Note);
  assert.deepStrictEqual(object.quoteAuthorizationId, authorization.id);
  assert.deepStrictEqual(ctx.sentActivities.length, 0);
  assert.deepStrictEqual(rejected, undefined);
});

test("BotImpl ignores malformed quote request IDs", async (t) => {
  class ThrowingMessageRepository extends MemoryRepository {
    override getMessage(
      identifier: string,
      id: Uuid,
    ): Promise<Create | Announce | undefined> {
      if (identifier === "bot" && id === ("not-a-uuid" as Uuid)) {
        return Promise.reject(new TypeError("Malformed UUID reached storage."));
      }
      return super.getMessage(identifier, id);
    }
  }

  await t.test("dispatchQuoteRequest()", async () => {
    const repository = new ThrowingMessageRepository();
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
      await bot.dispatchQuoteRequest(ctx, {
        identifier: "bot",
        id: "not-a-uuid",
      }),
      null,
    );
  });

  await t.test("onFollowAccepted()", async () => {
    const repository = new ThrowingMessageRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockInboxContext(bot, "https://example.com", "bot");
    await bot.onFollowAccepted(
      ctx,
      new Accept({
        actor: new URL("https://remote.example/users/alice"),
        object: ctx.getObjectUri(QuoteRequest, {
          identifier: bot.identifier,
          id: "not-a-uuid",
        }),
      }),
    );
  });

  await t.test("onFollowRejected()", async () => {
    const repository = new ThrowingMessageRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "bot",
    });
    const ctx = createMockInboxContext(bot, "https://example.com", "bot");
    await bot.onFollowRejected(
      ctx,
      new Reject({
        actor: new URL("https://remote.example/users/alice"),
        object: ctx.getObjectUri(QuoteRequest, {
          identifier: bot.identifier,
          id: "not-a-uuid",
        }),
      }),
    );
  });
});

test("BotImpl.dispatchQuoteRequest() checks message visibility", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const sessionCtx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, sessionCtx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  Object.defineProperty(sessionCtx, "lookupObject", {
    value: (id: URL) =>
      Promise.resolve(id.href === target.id?.href ? target : null),
  });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
    visibility: "followers",
  });
  const parsed = sessionCtx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const requestCtx = bot.federation.createContext(
    new Request("https://example.com/"),
    undefined,
  );

  assert.deepStrictEqual(
    await bot.dispatchQuoteRequest(requestCtx, {
      identifier: "bot",
      id: parsed.values.id,
    }),
    null,
  );
});

test("BotImpl.onFollowAccepted() with canonical follow URIs", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const accepted: Actor[] = [];
  bot.onAcceptFollow = (_, actor) => void (accepted.push(actor));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  await repository.addSentFollow(
    "bot",
    "9d952a10-77e6-46bd-a48a-208b47e5e2bb",
    new Follow({
      id: new URL(
        "https://example.com/ap/actor/bot/follow/9d952a10-77e6-46bd-a48a-208b47e5e2bb",
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
        "https://example.com/ap/actor/bot/follow/9d952a10-77e6-46bd-a48a-208b47e5e2bb",
      ),
    }),
  );
  assert.deepStrictEqual(accepted.length, 1);
  assert.deepStrictEqual(
    accepted[0].id,
    new URL("https://example.com/ap/actor/john"),
  );
  assert.ok(
    await repository.getFollowee(
      "bot",
      new URL("https://example.com/ap/actor/john"),
    ) != null,
  );
});

test("BotImpl.onLiked() with legacy message URIs", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const likes: Like<void>[] = [];
  bot.onLike = (_, like) => void (likes.push(like));
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
  // The message is stored with a canonical URI, but a remote server that
  // saw it before the upgrade may still refer to it by its legacy URI:
  await repository.addMessage(
    "bot",
    messageId,
    new Create({
      id: new URL(
        `https://example.com/ap/actor/bot/create/${messageId}`,
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: new URL(`https://example.com/ap/actor/bot/note/${messageId}`),
        attribution: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        content: "Hello, world!",
      }),
    }),
  );
  await bot.onLiked(
    ctx,
    new RawLike({
      id: new URL("https://remote.example/likes/1"),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new URL(`https://example.com/ap/note/${messageId}`),
    }),
  );
  assert.deepStrictEqual(likes.length, 1);
  assert.deepStrictEqual(
    likes[0].message.id,
    new URL(`https://example.com/ap/actor/bot/note/${messageId}`),
  );
});

test("BotImpl.onQuoteRequested() accepts public quote requests", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  let targetMessage: AuthorizedMessage<MessageClass, void> | undefined;
  let quoteMessage: Message<MessageClass, void> | undefined;
  bot.onQuoteRequest = (_session, request) => {
    targetMessage = request.target;
    quoteMessage = request.quote;
  };
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Quote me`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quote = new Note({
    id: new URL("https://remote.example/notes/quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted.",
    to: PUBLIC_COLLECTION,
  });
  const request = new QuoteRequest({
    id: new URL("https://remote.example/quote-requests/1"),
    actor,
    object: target.id,
    instrument: quote,
  });

  await bot.onQuoteRequested(ctx, request);

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [actor]);
  assert.ok(activity instanceof Accept);
  assert.deepStrictEqual(
    activity.resultId?.href.startsWith(
      "https://example.com/ap/actor/bot/quote-authorization/",
    ),
    true,
  );
  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quote.id!,
  );
  assert.deepStrictEqual(authorization?.interactingObjectId, quote.id);
  assert.deepStrictEqual(authorization?.interactionTargetId, target.id);
  assert.ok(authorization?.id != null);

  ctx.sentActivities = [];
  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/1-again"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
  assert.deepStrictEqual(
    ctx.sentActivities[0].activity.resultId?.href,
    authorization.id.href,
  );

  assert.ok(targetMessage != null);
  assert.ok(quoteMessage != null);
  ctx.sentActivities = [];
  await targetMessage.unauthorizeQuote(quoteMessage);

  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 2);
  const { recipients: deleteRecipients, activity: deleteActivity } =
    ctx.sentActivities[0];
  assert.deepStrictEqual(deleteRecipients, [actor]);
  assert.ok(deleteActivity instanceof Delete);
  assert.deepStrictEqual(deleteActivity.objectId, authorization.id);
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, "followers");
});

test("BotImpl.onQuoteRequested() accepts FEP quote IDs", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  let quoteMessage: Message<MessageClass, void> | undefined;
  bot.onQuoteRequest = (_session, request) => {
    quoteMessage = request.quote;
  };
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Quote me`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quote = new Note({
    id: new URL("https://remote.example/notes/fep-quote"),
    attribution: actor.id,
    quote: target.id,
    content: "Quoted with FEP-044f.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/fep"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [actor]);
  assert.ok(activity instanceof Accept);
  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quote.id!,
  );
  assert.deepStrictEqual(authorization?.interactingObjectId, quote.id);
  assert.deepStrictEqual(authorization?.interactionTargetId, target.id);
  assert.deepStrictEqual(quoteMessage?.quoteTarget?.id, target.id);
});

test("BotImpl.onQuoteRequested() replays manual quote approvals", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "manual",
  });
  let handled = 0;
  bot.onQuoteRequest = async (_session, request) => {
    handled++;
    await request.accept();
  };
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Review quotes`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quote = new Note({
    id: new URL("https://remote.example/notes/manual-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted after review.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/manual"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(handled, 1);
  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quote.id!,
  );
  assert.ok(authorization?.id != null);
  ctx.sentActivities = [];

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/manual-again"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(handled, 1);
  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
  assert.deepStrictEqual(
    ctx.sentActivities[0].activity.resultId?.href,
    authorization.id.href,
  );
});

test("BotImpl.onQuoteRequested() rejects disallowed quote requests", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "nobody",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Do not quote`, {
    quotePolicy: "nobody",
  });
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    actor,
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/rejected-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/2"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Reject);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
});

test("BotImpl.onQuoteRequested() rejects hidden target quotes", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  let handled = false;
  bot.onQuoteRequest = () => {
    handled = true;
  };
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers only`, {
    visibility: "followers",
  });
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quote = new Note({
    id: new URL("https://remote.example/notes/hidden-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/5"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.ok(!handled);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
});

test("BotImpl.onQuoteRequested() rejects wider-audience quotes", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers only`, {
    visibility: "followers",
  });
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    actor,
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/public-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted publicly.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/6"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [actor]);
  assert.ok(activity instanceof Reject);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
});

test("BotImpl.onQuoteRequested() rejects unrelated quote instruments", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Quote me`);
  const otherTarget = await session.publish(text`Not this`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quote = new Note({
    id: new URL("https://remote.example/notes/unrelated-quote"),
    attribution: actor.id,
    quoteUrl: otherTarget.id,
    content: "Quoted.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/unrelated"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
});

test("BotImpl.onQuoteRequested() rejects non-subset quote audiences", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers only`, {
    visibility: "followers",
  });
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
    followers: new URL("https://remote.example/users/alice/followers"),
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    actor,
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/own-followers-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted to my followers.",
    to: actor.followersId,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/own-followers"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [actor]);
  assert.ok(activity instanceof Reject);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
});

test("BotImpl.onQuoteRequested() accepts quotes to the target author", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers only`, {
    visibility: "followers",
  });
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    actor,
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/author-only-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted to the original author.",
    to: session.actorId,
    tags: [new Mention({ href: session.actorId })],
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/author-only"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [actor]);
  assert.ok(activity instanceof Accept);
  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quote.id!,
  );
  assert.deepStrictEqual(authorization?.interactionTargetId, target.id);
});

test("BotImpl.onQuoteRequested() accepts quotes to target followers", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers only`, {
    visibility: "followers",
  });
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const otherFollower = new Person({
    id: new URL("https://remote.example/users/bob"),
    preferredUsername: "bob",
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow/alice"),
    actor,
  );
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow/bob"),
    otherFollower,
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/follower-only-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted to another follower.",
    to: otherFollower.id,
    tags: [new Mention({ href: otherFollower.id })],
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/other-follower"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [actor]);
  assert.ok(activity instanceof Accept);
  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quote.id!,
  );
  assert.deepStrictEqual(authorization?.interactionTargetId, target.id);
});

test("BotImpl.onQuoteRequested() revokes widened quote stamps", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers only`, {
    visibility: "followers",
  });
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
    followers: new URL("https://remote.example/users/alice/followers"),
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    actor,
  );
  const quoteId = new URL("https://remote.example/notes/widened-quote");
  const followersQuote = new Note({
    id: quoteId,
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted directly.",
    to: actor.id,
    tags: [new Mention({ href: actor.id })],
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/7"),
      actor,
      object: target.id,
      instrument: followersQuote,
    }),
  );

  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quoteId,
  );
  assert.ok(authorization != null);
  ctx.sentActivities = [];
  const publicQuote = followersQuote.clone({ to: PUBLIC_COLLECTION });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/8"),
      actor,
      object: target.id,
      instrument: publicQuote,
    }),
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quoteId),
    undefined,
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 3);
  assert.ok(ctx.sentActivities[0].activity instanceof Delete);
  assert.deepStrictEqual(
    ctx.sentActivities[0].activity.objectId,
    authorization.id,
  );
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, "followers");
  assert.ok(ctx.sentActivities[2].activity instanceof Reject);
});

test("BotImpl.onQuoteRequested() revokes disallowed quote stamps", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "public",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Quote me`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quoteId = new URL("https://remote.example/notes/stale-quote");
  const quote = new Note({
    id: quoteId,
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted directly.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/old-policy"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quoteId,
  );
  assert.ok(authorization != null);
  await target.update(text`Quote me`, { quotePolicy: "nobody" });
  ctx.sentActivities = [];

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/new-policy"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quoteId),
    undefined,
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 3);
  assert.ok(ctx.sentActivities[0].activity instanceof Delete);
  assert.deepStrictEqual(
    ctx.sentActivities[0].activity.objectId,
    authorization.id,
  );
  assert.deepStrictEqual(ctx.sentActivities[1].recipients, "followers");
  assert.ok(ctx.sentActivities[2].activity instanceof Reject);
});

test("BotImpl.onQuoteRequested() does not accept a raced stamp", async () => {
  class RacedQuoteAuthorizationRepository extends MemoryRepository {
    readonly racedAuthorization: QuoteAuthorization;

    constructor(racedAuthorization: QuoteAuthorization) {
      super();
      this.racedAuthorization = racedAuthorization;
    }

    override async addQuoteAuthorization(
      identifier: string,
      _id: Uuid,
      authorization: QuoteAuthorization,
    ): Promise<void> {
      const interactingObject = authorization.interactingObjectId;
      if (interactingObject == null) {
        throw new TypeError(
          "The quote authorization interacting object is missing.",
        );
      }
      if (
        await this.findQuoteAuthorization(identifier, interactingObject) == null
      ) {
        await super.addQuoteAuthorization(
          identifier,
          "01950000-0000-7000-8000-000000000001" as Uuid,
          this.racedAuthorization,
        );
      }
    }
  }

  const racedAuthorization = new QuoteAuthorization({
    id: new URL("https://example.com/ap/quote-authorization/raced"),
    attribution: new URL("https://example.com/ap/actor/bot"),
    interactingObject: new URL("https://remote.example/notes/raced-quote"),
    interactionTarget: new URL("https://example.com/ap/note/other-target"),
  });
  const repository = new RacedQuoteAuthorizationRepository(
    racedAuthorization,
  );
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "public",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Quote me`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quote = new Note({
    id: racedAuthorization.interactingObjectId,
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted.",
    to: PUBLIC_COLLECTION,
  });

  await assert.rejects(
    bot.onQuoteRequested(
      ctx,
      new QuoteRequest({
        id: new URL("https://remote.example/quote-requests/raced"),
        actor,
        object: target.id,
        instrument: quote,
      }),
    ),
    TypeError,
  );
  assert.deepStrictEqual(ctx.sentActivities, []);
});

test("BotImpl.onQuoteRequested() rejects unknown-audience quotes", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers only`, {
    visibility: "followers",
  });
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    actor,
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/custom-audience-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted to a custom audience.",
    to: new URL("https://remote.example/custom-audience"),
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/7"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [actor]);
  assert.ok(activity instanceof Reject);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
});

test("BotImpl.onQuoteRequested() checks direct quote recipients for unknown targets", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "public",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const unrelatedActor = new Person({
    id: new URL("https://remote.example/users/bob"),
    preferredUsername: "bob",
  });
  const targetId = new URL(
    "https://example.com/ap/note/01950000-0000-7000-8000-000000000101",
  );
  await repository.addMessage(
    "bot",
    "01950000-0000-7000-8000-000000000101" as Uuid,
    new Create({
      id: new URL(
        "https://example.com/ap/create/01950000-0000-7000-8000-000000000101",
      ),
      actor: session.actorId,
      object: new Note({
        id: targetId,
        attribution: session.actorId,
        content: "A target with an unrecognized audience.",
        to: actor.id,
      }),
    }),
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/direct-quote-outside-target"),
    attribution: actor.id,
    quoteUrl: targetId,
    content: "Quoted directly to someone else.",
    to: unrelatedActor.id,
    tags: [new Mention({ href: unrelatedActor.id })],
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/direct-outside"),
      actor,
      object: targetId,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [actor]);
  assert.ok(activity instanceof Reject);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
});

test("AuthorizedMessage.unauthorizeQuote() checks the target message", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  let quoteMessage: Message<MessageClass, void> | undefined;
  bot.onQuoteRequest = (_session, request) => {
    quoteMessage = request.quote;
  };
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const firstTarget = await session.publish(text`Quote this`);
  const secondTarget = await session.publish(text`Not this`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quote = new Note({
    id: new URL("https://remote.example/notes/quote"),
    attribution: actor.id,
    quoteUrl: firstTarget.id,
    content: "Quoted.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/3"),
      actor,
      object: firstTarget.id,
      instrument: quote,
    }),
  );

  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quote.id!,
  );
  assert.ok(quoteMessage != null);
  assert.ok(authorization != null);
  const authorizedQuote = quoteMessage;
  ctx.sentActivities = [];
  await assert.rejects(
    () => secondTarget.unauthorizeQuote(authorizedQuote),
    /does not belong to this message/,
  );

  assert.deepStrictEqual(
    (await repository.findQuoteAuthorization("bot", quote.id!))?.id?.href,
    authorization.id?.href,
  );
  assert.deepStrictEqual(ctx.sentActivities, []);
});

test("AuthorizedMessage.unauthorizeQuote() revokes when quote lookup fails", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const target = await new SessionImpl(bot, ctx).publish(text`Quote this`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quote = new Note({
    id: new URL("https://remote.example/notes/deleted-quote"),
    attribution: actor.id,
    quoteUrl: target.id,
    content: "Quoted.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/4"),
      actor,
      object: target.id,
      instrument: quote,
    }),
  );

  const authorization = await repository.findQuoteAuthorization(
    "bot",
    quote.id!,
  );
  assert.ok(authorization != null);
  Object.defineProperty(ctx, "lookupObject", {
    value: () => Promise.reject(new TypeError("Remote quote is gone.")),
    configurable: true,
  });
  ctx.sentActivities = [];

  await target.unauthorizeQuote(quote.id!);

  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, "followers");
  assert.ok(activity instanceof Delete);
  assert.deepStrictEqual(activity.objectId, authorization.id);
});

test("BotImpl.onQuoteRequested() rejects another actor's quote", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers may quote me`);
  ctx.sentActivities = [];
  const requester = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const quoteAuthor = new Person({
    id: new URL("https://remote.example/users/mallory"),
    preferredUsername: "mallory",
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    requester,
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/borrowed-quote"),
    attribution: quoteAuthor.id,
    quoteUrl: target.id,
    content: "Quoted by somebody else.",
    to: PUBLIC_COLLECTION,
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/3"),
      actor: requester,
      object: target.id,
      instrument: quote,
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  const { recipients, activity } = ctx.sentActivities[0];
  assert.deepStrictEqual(recipients, [requester]);
  assert.ok(activity instanceof Reject);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", quote.id!),
    undefined,
  );
});

async function addQuoteTarget(
  repository: MemoryRepository,
  ctx: MockInboxContext,
  interactionPolicy?: InteractionPolicy,
): Promise<Note> {
  const id = "01941f29-7c00-7fe8-ab0a-7b593990a3c1";
  const actor = ctx.getActorUri("bot");
  const note = new Note({
    id: ctx.getObjectUri(Note, { identifier: "bot", id }),
    attribution: actor,
    to: PUBLIC_COLLECTION,
    content: "Quote me",
    interactionPolicy,
  });
  await repository.addMessage(
    "bot",
    id,
    new Create({
      id: ctx.getObjectUri(Create, { identifier: "bot", id }),
      actor,
      to: PUBLIC_COLLECTION,
      object: note,
    }),
  );
  return note;
}

class FailingFollowerRepository extends MemoryRepository {
  failHasFollower = false;

  override hasFollower(identifier: string, followerId: URL): Promise<boolean> {
    if (this.failHasFollower) {
      return Promise.reject(new TypeError("The follower lookup failed."));
    }
    return super.hasFollower(identifier, followerId);
  }
}

test("BotImpl.onQuoteRequested() falls back to the bot's quote policy", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const target = await addQuoteTarget(repository, ctx);
  const follower = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const stranger = new Person({
    id: new URL("https://remote.example/users/bob"),
    preferredUsername: "bob",
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    follower,
  );

  const cases: readonly [Person, typeof Accept | typeof Reject][] = [
    [follower, Accept],
    [stranger, Reject],
  ];
  for (const [actor, expected] of cases) {
    ctx.sentActivities = [];
    await bot.onQuoteRequested(
      ctx,
      new QuoteRequest({
        id: new URL(`${actor.id!.href}/quote-requests/1`),
        actor,
        object: target.id,
        instrument: new Note({
          id: new URL(`${actor.id!.href}/notes/quote`),
          attribution: actor.id,
          quote: target.id,
          content: "Quoted.",
          to: PUBLIC_COLLECTION,
        }),
      }),
    );
    assert.deepStrictEqual(ctx.sentActivities.length, 1);
    assert.ok(ctx.sentActivities[0].activity instanceof expected);
  }
});

test("BotImpl.onQuoteRequested() falls back to public quote policy", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const target = await addQuoteTarget(repository, ctx);
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/1"),
      actor,
      object: target.id,
      instrument: new Note({
        id: new URL("https://remote.example/notes/quote"),
        attribution: actor.id,
        quote: target.id,
        content: "Quoted.",
        to: PUBLIC_COLLECTION,
      }),
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
});

test("BotImpl.onQuoteRequested() prefers automatic approvals", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const states: string[] = [];
  bot.onQuoteRequest = (_session, request) => void states.push(request.state);
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = await addQuoteTarget(
    repository,
    ctx,
    new InteractionPolicy({
      canQuote: new InteractionRule({
        automaticApprovals: [PUBLIC_COLLECTION],
        manualApprovals: [actor.id!],
      }),
    }),
  );

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/1"),
      actor,
      object: target.id,
      instrument: new Note({
        id: new URL("https://remote.example/notes/quote"),
        attribution: actor.id,
        quote: target.id,
        content: "Quoted.",
        to: PUBLIC_COLLECTION,
      }),
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
  assert.deepStrictEqual(states, ["accepted"]);
});

test("BotImpl.onQuoteRequested() fills in missing quote attribution", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  let quoteMessage: Message<MessageClass, void> | undefined;
  bot.onQuoteRequest = (_session, request) => {
    quoteMessage = request.quote;
  };
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Quote me`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/1"),
      actor,
      object: target.id,
      instrument: new Note({
        id: new URL("https://remote.example/notes/quote"),
        quote: target.id,
        content: "Quoted.",
        to: PUBLIC_COLLECTION,
      }),
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
  assert.deepStrictEqual(quoteMessage?.actor.id, actor.id);
  assert.deepStrictEqual(quoteMessage?.raw.attributionId, actor.id);
});

test("BotImpl.onQuoteRequested() keeps conflicting quote URLs", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  let quoteMessage: Message<MessageClass, void> | undefined;
  bot.onQuoteRequest = (_session, request) => {
    quoteMessage = request.quote;
  };
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Quote me`);
  ctx.sentActivities = [];
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const otherUrl = new URL("https://remote.example/notes/other");

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/1"),
      actor,
      object: target.id,
      instrument: new Note({
        id: new URL("https://remote.example/notes/quote"),
        attribution: actor.id,
        quote: target.id,
        quoteUrl: otherUrl,
        content: "Quoted.",
        to: PUBLIC_COLLECTION,
      }),
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
  assert.deepStrictEqual(quoteMessage?.raw.quoteUrl, otherUrl);
});

test("BotImpl.onQuoteRequested() uses the resolved requester ID", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  let quoteMessage: Message<MessageClass, void> | undefined;
  bot.onQuoteRequest = (_session, request) => {
    quoteMessage = request.quote;
  };
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Quote me`);
  ctx.sentActivities = [];
  const requestedActorId = new URL("https://remote.example/users/alice");
  const resolvedActorId = new URL("https://remote.example/users/alice2");
  const defaultDocumentLoader = ctx.documentLoader;
  Object.defineProperty(ctx, "getDocumentLoader", {
    value: () =>
      Promise.resolve(
        (url: string, options?: Parameters<typeof defaultDocumentLoader>[1]) =>
          url === requestedActorId.href
            ? Promise.resolve({
              contextUrl: null,
              documentUrl: url,
              document: {
                "@context": "https://www.w3.org/ns/activitystreams",
                id: resolvedActorId.href,
                type: "Person",
                preferredUsername: "alice2",
              },
            })
            : defaultDocumentLoader(url, options),
      ),
  });

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/1"),
      actor: requestedActorId,
      object: target.id,
      instrument: new Note({
        id: new URL("https://remote.example/notes/quote"),
        attribution: resolvedActorId,
        quote: target.id,
        content: "Quoted.",
        to: PUBLIC_COLLECTION,
      }),
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
  assert.deepStrictEqual(quoteMessage?.actor.id, resolvedActorId);
});

test("BotImpl.onQuoteRequested() propagates follower lookup failures", async () => {
  const repository = new FailingFollowerRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
    quotePolicy: "followers",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const target = await session.publish(text`Followers may quote me`);
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  await repository.addFollower(
    "bot",
    new URL("https://remote.example/activities/follow"),
    actor,
  );
  const quote = new Note({
    id: new URL("https://remote.example/notes/quote"),
    attribution: actor.id,
    quote: target.id,
    content: "Quoted.",
    to: PUBLIC_COLLECTION,
  });
  const createRequest = (id: string) =>
    new QuoteRequest({
      id: new URL(`https://remote.example/quote-requests/${id}`),
      actor,
      object: target.id,
      instrument: quote,
    });
  await bot.onQuoteRequested(ctx, createRequest("1"));
  assert.ok(await repository.findQuoteAuthorization("bot", quote.id!) != null);
  ctx.sentActivities = [];
  repository.failHasFollower = true;

  await assert.rejects(
    () => bot.onQuoteRequested(ctx, createRequest("2")),
    TypeError,
  );

  assert.deepStrictEqual(ctx.sentActivities, []);
  assert.ok(await repository.findQuoteAuthorization("bot", quote.id!) != null);
});

test("BotImpl.onQuoteRequested() skips follower lookups after public matches", async () => {
  const repository = new FailingFollowerRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const target = await addQuoteTarget(
    repository,
    ctx,
    new InteractionPolicy({
      canQuote: new InteractionRule({
        automaticApprovals: [ctx.getFollowersUri("bot"), PUBLIC_COLLECTION],
      }),
    }),
  );
  const actor = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  repository.failHasFollower = true;

  await bot.onQuoteRequested(
    ctx,
    new QuoteRequest({
      id: new URL("https://remote.example/quote-requests/1"),
      actor,
      object: target.id,
      instrument: new Note({
        id: new URL("https://remote.example/notes/quote"),
        attribution: actor.id,
        quote: target.id,
        content: "Quoted.",
        to: PUBLIC_COLLECTION,
      }),
    }),
  );

  assert.deepStrictEqual(ctx.sentActivities.length, 1);
  assert.ok(ctx.sentActivities[0].activity instanceof Accept);
});

async function prepareQuoteApproval(stampOrigin = "https://remote.example") {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "bot",
  });
  const ctx = createMockInboxContext(bot, "https://example.com", "bot");
  const session = new SessionImpl(bot, ctx);
  const author = new Person({
    id: new URL("https://remote.example/users/alice"),
    preferredUsername: "alice",
  });
  const target = new Note({
    id: new URL("https://remote.example/notes/original"),
    attribution: author,
    content: "Original.",
    to: PUBLIC_COLLECTION,
  });
  const lookups: Record<string, Note | QuoteAuthorization> = {
    [target.id!.href]: target,
  };
  Object.defineProperty(ctx, "lookupObject", {
    value: (id: URL) => Promise.resolve(lookups[id.href] ?? null),
  });
  const documents: Record<string, unknown> = {};
  const defaultDocumentLoader = ctx.documentLoader;
  const documentLoader: typeof defaultDocumentLoader = (url, options) =>
    url in documents
      ? Promise.resolve({
        contextUrl: null,
        documentUrl: url,
        document: documents[url],
      })
      : defaultDocumentLoader(url, options);
  Object.defineProperty(ctx, "documentLoader", { value: documentLoader });
  Object.defineProperty(ctx, "getDocumentLoader", {
    value: () => Promise.resolve(documentLoader),
  });
  documents[author.id!.href] = await author.toJsonLd({ format: "expand" });
  const targetMessage = await createMessage(target, session, {});
  const quote = await session.publish(text`Please approve this.`, {
    quoteTarget: targetMessage,
  });
  const parsed = ctx.parseUri(quote.id);
  assert.ok(parsed?.type === "object");
  const messageId = parsed.values.id as Uuid;
  const requestId = ctx.getObjectUri(QuoteRequest, {
    identifier: bot.identifier,
    id: messageId,
  });
  const createStamp = (id: string, interactingObject = quote.id) =>
    new QuoteAuthorization({
      id: new URL(id, stampOrigin),
      attribution: author.id,
      interactingObject,
      interactionTarget: target.id,
    });
  const getQuoteAuthorizationId = async () => {
    const stored = await repository.getMessage("bot", messageId);
    assert.ok(stored instanceof Create);
    const object = await stored.getObject(ctx);
    assert.ok(object instanceof Note);
    return object.quoteAuthorizationId;
  };
  ctx.sentActivities = [];
  return {
    bot,
    ctx,
    author,
    requestId,
    lookups,
    documents,
    createStamp,
    getQuoteAuthorizationId,
  };
}

test("BotImpl.onFollowAccepted() accepts same-origin embedded stamps", async () => {
  const { bot, ctx, author, requestId, createStamp, getQuoteAuthorizationId } =
    await prepareQuoteApproval();
  const stamp = createStamp("/stamps/1");
  const accept = await Accept.fromJsonLd(
    await new Accept({
      id: new URL("https://remote.example/accepts/1"),
      actor: author.id,
      object: requestId,
      result: stamp,
    }).toJsonLd({ format: "expand" }),
    { documentLoader: ctx.documentLoader, contextLoader: ctx.contextLoader },
  );

  await bot.onFollowAccepted(ctx, accept);

  assert.deepStrictEqual(await getQuoteAuthorizationId(), stamp.id);
});

test("BotImpl.onFollowAccepted() ignores forged cross-origin embedded stamps", async () => {
  const {
    bot,
    ctx,
    author,
    requestId,
    createStamp,
    documents,
    getQuoteAuthorizationId,
  } = await prepareQuoteApproval();
  const forged = createStamp("/stamps/1");
  documents[forged.id!.href] = await createStamp(
    "/stamps/1",
    new URL("https://example.com/notes/other"),
  ).toJsonLd({ format: "expand" });
  const accept = await Accept.fromJsonLd(
    await new Accept({
      id: new URL("https://relay.example/accepts/1"),
      actor: author.id,
      object: requestId,
      result: forged,
    }).toJsonLd({ format: "expand" }),
    { documentLoader: ctx.documentLoader, contextLoader: ctx.contextLoader },
  );

  await bot.onFollowAccepted(ctx, accept);

  assert.deepStrictEqual(await getQuoteAuthorizationId(), null);
});

test("BotImpl.onFollowAccepted() ignores dereferenced stamps with other IDs", async () => {
  const {
    bot,
    ctx,
    author,
    requestId,
    createStamp,
    documents,
    lookups,
    getQuoteAuthorizationId,
  } = await prepareQuoteApproval();
  const requested = new URL("https://remote.example/stamps/a");
  const other = createStamp("/stamps/b");
  documents[requested.href] = await other.toJsonLd({ format: "expand" });
  lookups[requested.href] = other;

  await bot.onFollowAccepted(
    ctx,
    new Accept({
      id: new URL("https://remote.example/accepts/1"),
      actor: author.id,
      object: requestId,
      result: requested,
    }),
  );

  assert.deepStrictEqual(await getQuoteAuthorizationId(), null);
});

test("BotImpl.onFollowAccepted() ignores undereferenceable stamps", async () => {
  const { bot, ctx, author, requestId, getQuoteAuthorizationId } =
    await prepareQuoteApproval();

  await bot.onFollowAccepted(
    ctx,
    new Accept({
      id: new URL("https://remote.example/accepts/1"),
      actor: author.id,
      object: requestId,
      result: new URL("https://remote.example/stamps/missing"),
    }),
  );

  assert.deepStrictEqual(await getQuoteAuthorizationId(), null);
});
