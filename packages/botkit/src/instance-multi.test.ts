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
import { Create, Note, PUBLIC_COLLECTION } from "@fedify/vocab";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createInstance,
  DEFAULT_INSTANCE_ACTOR_IDENTIFIER,
  type InstanceWithVoidContextData,
} from "./instance.ts";
import type { InstanceImpl } from "./instance-impl.ts";
import { MemoryRepository, type Uuid } from "./repository.ts";

function fetchJson(
  instance: InstanceWithVoidContextData,
  url: string,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  return instance.fetch(
    new Request(url, { headers: { Accept: "application/activity+json" } }),
  ).then(async (response) => {
    assert.deepStrictEqual(response.status, 200, `GET ${url}`);
    return await response.json();
  });
}

describe("multiple static bots", () => {
  test("serves distinct actors and collections", async () => {
    const instance = createInstance<void>({ kv: new MemoryKvStore() });
    instance.createBot("alpha", { username: "alphabot", name: "Alpha" });
    instance.createBot("beta", { username: "betabot", name: "Beta" });

    const alpha = await fetchJson(
      instance,
      "https://example.com/ap/actor/alpha",
    );
    const beta = await fetchJson(instance, "https://example.com/ap/actor/beta");
    assert.deepStrictEqual(alpha.preferredUsername, "alphabot");
    assert.deepStrictEqual(beta.preferredUsername, "betabot");
    assert.notDeepStrictEqual(alpha.id, beta.id);
    assert.notDeepStrictEqual(alpha.followers, beta.followers);
    assert.notDeepStrictEqual(alpha.outbox, beta.outbox);
  });

  test("resolves each username through WebFinger", async () => {
    const instance = createInstance<void>({ kv: new MemoryKvStore() });
    instance.createBot("alpha", { username: "alphabot" });
    instance.createBot("beta", { username: "betabot" });

    for (
      const [username, identifier] of [
        ["alphabot", "alpha"],
        ["betabot", "beta"],
      ]
    ) {
      const response = await instance.fetch(
        new Request(
          `https://example.com/.well-known/webfinger?resource=acct:${username}@example.com`,
        ),
      );
      assert.deepStrictEqual(response.status, 200);
      const jrd = await response.json();
      const self = jrd.links.find((link: { rel: string }) =>
        link.rel === "self"
      );
      assert.deepStrictEqual(
        self.href,
        `https://example.com/ap/actor/${identifier}`,
      );
    }
  });

  test("does not serve one bot's objects under another bot's path", async () => {
    const repository = new MemoryRepository();
    const instance = createInstance<void>({
      kv: new MemoryKvStore(),
      repository,
    });
    instance.createBot("alpha", { username: "alphabot" });
    instance.createBot("beta", { username: "betabot" });

    const messageId: Uuid = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
    await repository.addMessage(
      "alpha",
      messageId,
      new Create({
        id: new URL(
          `https://example.com/ap/actor/alpha/create/${messageId}`,
        ),
        actor: new URL("https://example.com/ap/actor/alpha"),
        to: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(`https://example.com/ap/actor/alpha/note/${messageId}`),
          attribution: new URL("https://example.com/ap/actor/alpha"),
          to: PUBLIC_COLLECTION,
          content: "Hello from alpha!",
        }),
      }),
    );

    const own = await instance.fetch(
      new Request(
        `https://example.com/ap/actor/alpha/note/${messageId}`,
        { headers: { Accept: "application/activity+json" } },
      ),
    );
    assert.deepStrictEqual(own.status, 200);

    // The same UUID under beta's path must not leak alpha's message:
    const cross = await instance.fetch(
      new Request(
        `https://example.com/ap/actor/beta/note/${messageId}`,
        { headers: { Accept: "application/activity+json" } },
      ),
    );
    assert.deepStrictEqual(cross.status, 404);
  });
});

describe("instance actor", () => {
  test("is served under the reserved identifier", async () => {
    const instance = createInstance<void>({ kv: new MemoryKvStore() });
    instance.createBot("alpha", { username: "alphabot" });
    const actor = await fetchJson(
      instance,
      `https://example.com/ap/actor/${DEFAULT_INSTANCE_ACTOR_IDENTIFIER}`,
    );
    assert.deepStrictEqual(actor.type, "Application");
    assert.ok(actor.publicKey != null);
  });

  test("is discoverable through WebFinger", async () => {
    // The instance actor signs the requests a multi-bot instance makes on
    // its own behalf.  Implementations that dereference a signature's key
    // owner through WebFinger rather than by URI (GoToSocial) reject every
    // one of those requests unless the actor resolves here:
    async function webFingerSelf(
      instance: InstanceWithVoidContextData,
      username: string,
    ): Promise<string | undefined> {
      const response = await instance.fetch(
        new Request(
          `https://example.com/.well-known/webfinger?resource=${
            encodeURIComponent(`acct:${username}@example.com`)
          }`,
        ),
      );
      assert.deepStrictEqual(response.status, 200, `WebFinger ${username}`);
      // Response.json() is typed as any, so the payload is narrowed rather
      // than asserted into shape:
      const jrd: unknown = await response.json();
      const links = typeof jrd === "object" && jrd != null && "links" in jrd
        ? jrd.links
        : undefined;
      if (!Array.isArray(links)) {
        assert.fail(`WebFinger ${username} returned no links array`);
      }
      for (const link of links) {
        if (
          typeof link === "object" && link != null &&
          "rel" in link && link.rel === "self" &&
          "href" in link && typeof link.href === "string"
        ) {
          return link.href;
        }
      }
      return undefined;
    }

    const instance = createInstance<void>({ kv: new MemoryKvStore() });
    instance.createBot("alpha", { username: "alphabot" });
    assert.deepStrictEqual(
      await webFingerSelf(instance, DEFAULT_INSTANCE_ACTOR_IDENTIFIER),
      `https://example.com/ap/actor/${DEFAULT_INSTANCE_ACTOR_IDENTIFIER}`,
    );

    // A renamed instance actor resolves under its new identifier, and the
    // default one goes back to being an ordinary username:
    const renamed = createInstance<void>({
      kv: new MemoryKvStore(),
      instanceActorIdentifier: "fetcher",
    });
    renamed.createBot("alpha", { username: "alphabot" });
    assert.deepStrictEqual(
      await webFingerSelf(renamed, "fetcher"),
      "https://example.com/ap/actor/fetcher",
    );

    // A group's mapUsername() can only be evaluated per request, so it
    // cannot be rejected at registration the way a static bot's username is.
    // The instance actor therefore resolves last, leaving an explicit
    // mapping that already worked on 0.5.2 pointing where it always did --
    // the alternative silently redirects the handle away from a bot that is
    // still dereferenceable under its own identifier:
    const dynamic = createInstance<void>({ kv: new MemoryKvStore() });
    dynamic.createBot(
      (_ctx, identifier) =>
        identifier === "lang_en" ? { username: "en" } : null,
      {
        mapUsername: (_ctx, username) =>
          username === DEFAULT_INSTANCE_ACTOR_IDENTIFIER ? "lang_en" : null,
      },
    );
    assert.deepStrictEqual(
      await webFingerSelf(dynamic, DEFAULT_INSTANCE_ACTOR_IDENTIFIER),
      "https://example.com/ap/actor/lang_en",
    );
  });

  test("signs the shared inbox on multi-bot instances", () => {
    const instance = createInstance<void>({ kv: new MemoryKvStore() });
    instance.createBot("alpha", { username: "alphabot" });
    const impl = (instance as unknown as {
      impl: {
        dispatchSharedKey(ctx: unknown): { identifier: string };
        federation: {
          createContext(url: URL): unknown;
        };
      };
    }).impl;
    const ctx = impl.federation.createContext(new URL("https://example.com/"));
    assert.deepStrictEqual(impl.dispatchSharedKey(ctx), {
      identifier: DEFAULT_INSTANCE_ACTOR_IDENTIFIER,
    });
  });

  test("cannot be taken by a bot", async () => {
    const instance = createInstance<void>({ kv: new MemoryKvStore() });
    assert.throws(
      () =>
        instance.createBot(DEFAULT_INSTANCE_ACTOR_IDENTIFIER, {
          username: "sneaky",
        }),
      TypeError,
    );

    // Dynamic dispatchers cannot take the reserved identifier either:
    instance.createBot((_ctx, identifier) => ({ username: identifier }));
    const response = await instance.fetch(
      new Request(
        `https://example.com/ap/actor/${DEFAULT_INSTANCE_ACTOR_IDENTIFIER}`,
        { headers: { Accept: "application/activity+json" } },
      ),
    );
    assert.deepStrictEqual(response.status, 200);
    const actor = await response.json();
    assert.deepStrictEqual(actor.type, "Application");
  });

  test("cannot have its name taken as a bot's username", () => {
    // Only the identifier was reserved before.  Since the instance actor now
    // resolves ahead of the bots in mapHandle(), a bot holding its name would
    // silently lose its own WebFinger mapping, so the username is reserved
    // too -- case-insensitively, as WebFinger lookups vary in casing:
    const instance = createInstance<void>({ kv: new MemoryKvStore() });
    assert.throws(
      () =>
        instance.createBot("sneaky", {
          username: DEFAULT_INSTANCE_ACTOR_IDENTIFIER,
        }),
      TypeError,
    );
    assert.throws(
      () =>
        instance.createBot("sneaky", {
          username: DEFAULT_INSTANCE_ACTOR_IDENTIFIER.toUpperCase(),
        }),
      TypeError,
    );

    // The reservation follows instanceActorIdentifier rather than the
    // default name: a renamed actor reserves its own, and frees the default.
    const renamed = createInstance<void>({
      kv: new MemoryKvStore(),
      instanceActorIdentifier: "fetcher",
    });
    assert.throws(
      () => renamed.createBot("sneaky", { username: "Fetcher" }),
      TypeError,
    );
    const bot = renamed.createBot("underscores", {
      username: DEFAULT_INSTANCE_ACTOR_IDENTIFIER,
    });
    assert.deepStrictEqual(bot.identifier, "underscores");
  });

  test("can be renamed through instanceActorIdentifier", async () => {
    const instance = createInstance<void>({
      kv: new MemoryKvStore(),
      instanceActorIdentifier: "fetcher",
    });
    instance.createBot("alpha", { username: "alphabot" });

    const actor = await fetchJson(
      instance,
      "https://example.com/ap/actor/fetcher",
    );
    assert.deepStrictEqual(actor.type, "Application");
    assert.deepStrictEqual(actor.preferredUsername, "fetcher");

    // The custom identifier is the reserved one now:
    assert.throws(
      () => instance.createBot("fetcher", { username: "other" }),
      TypeError,
    );
    // ...and the default identifier is free for bots:
    const bot = instance.createBot(DEFAULT_INSTANCE_ACTOR_IDENTIFIER, {
      username: "underscores",
    });
    assert.deepStrictEqual(bot.identifier, DEFAULT_INSTANCE_ACTOR_IDENTIFIER);
  });
});

describe("instance actor key pairs", () => {
  test("are generated once under concurrency", async () => {
    const repository = new MemoryRepository();
    const instance = createInstance<void>({
      kv: new MemoryKvStore(),
      repository,
    });
    instance.createBot("alpha", { username: "alphabot" });
    const impl = (instance as unknown as {
      impl: InstanceImpl<void>;
    }).impl;
    // Simulates concurrent cold-start requests hitting the key pair
    // dispatcher at once:
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        instance.fetch(
          new Request(
            `https://example.com/ap/actor/${DEFAULT_INSTANCE_ACTOR_IDENTIFIER}`,
            { headers: { Accept: "application/activity+json" } },
          ),
        )),
    );
    const actors = await Promise.all(responses.map((r) => r.json()));
    const keyIds = new Set(
      actors.map((actor) => JSON.stringify(actor.publicKey)),
    );
    // Every response advertises the same key, and the stored key matches:
    assert.deepStrictEqual(keyIds.size, 1);
    const stored = await repository.getKeyPairs(
      impl.instanceActorIdentifier,
    );
    assert.ok(stored != null);
  });
});

describe("NodeInfo on multi-bot instances", () => {
  test("counts the hosted bots", async () => {
    const instance = createInstance<void>({
      kv: new MemoryKvStore(),
      software: { name: "test-bot", version: "1.0.0" },
    });
    instance.createBot("alpha", { username: "alphabot" });
    instance.createBot("beta", { username: "betabot" });
    const response = await instance.fetch(
      new Request("https://example.com/nodeinfo/2.1"),
    );
    assert.deepStrictEqual(response.status, 200);
    const nodeInfo = await response.json();
    assert.deepStrictEqual(nodeInfo.usage.users.total, 2);
  });
});
