// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
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
import { RedisRepository } from "@fedify/botkit-redis";
import { exportJwk } from "@fedify/fedify/sig";
import { configureSync, type LogRecord, resetSync } from "@logtape/logtape";
import {
  Create,
  Follow,
  Note,
  Person,
  PUBLIC_COLLECTION,
  QuoteAuthorization,
} from "@fedify/vocab";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createClient } from "redis";

if (!("Temporal" in globalThis)) {
  globalThis.Temporal = (await import("@js-temporal" + "/polyfill")).Temporal;
}

function getRedisUrl(): string | undefined {
  if ("process" in globalThis) return globalThis.process.env.REDIS_URL;
  if ("Deno" in globalThis) return globalThis.Deno.env.get("REDIS_URL");
  return undefined;
}

const redisUrl = getRedisUrl();

interface TestRedisClient {
  readonly isOpen: boolean;
  sendCommand(args: readonly string[]): Promise<unknown>;
}

interface DelayedGetState {
  count: number;
  readonly waiters: (() => void)[];
}

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

async function createKeyPairs(): Promise<CryptoKeyPair[]> {
  return [
    await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    ),
  ];
}

function createMessage(id: string, content: string, published: string): Create {
  return new Create({
    id: new URL(`https://example.com/ap/actor/bot/create/${id}`),
    actor: new URL("https://example.com/ap/actor/bot"),
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
    object: new Note({
      id: new URL(`https://example.com/ap/actor/bot/note/${id}`),
      attribution: new URL("https://example.com/ap/actor/bot"),
      content,
      published: Temporal.Instant.from(published),
    }),
    published: Temporal.Instant.from(published),
  });
}

async function getMessageContent(message: Create): Promise<string> {
  const json = await message.toJsonLd({ format: "compact" });
  if (typeof json !== "object" || json == null) {
    throw new TypeError("Expected a JSON-LD object.");
  }
  if (!("object" in json)) {
    throw new TypeError("Expected a Create object.");
  }
  const object = json.object;
  if (typeof object !== "object" || object == null) {
    throw new TypeError("Expected a nested object.");
  }
  if (!("content" in object) || typeof object.content !== "string") {
    throw new TypeError("Expected string content.");
  }
  return object.content;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupPrefix(url: string, prefix: string): Promise<void> {
  const client = createClient({ url });
  await client.connect();
  try {
    let cursor = "0";
    for (;;) {
      const reply = await client.sendCommand([
        "SCAN",
        cursor,
        "MATCH",
        `${prefix}:*`,
        "COUNT",
        "1000",
      ]);
      assert.ok(Array.isArray(reply));
      const keys = reply[1];
      assert.ok(Array.isArray(keys));
      if (keys.length > 0) {
        await client.sendCommand(["DEL", ...keys.map(String)]);
      }
      cursor = String(reply[0]);
      if (cursor === "0") break;
    }
  } finally {
    await client.quit();
  }
}

function createHarness() {
  if (redisUrl == null) throw new Error("REDIS_URL is not set.");
  const prefix = `botkit_test_${crypto.randomUUID()}`;
  const repository = new RedisRepository({ url: redisUrl, prefix });
  return {
    prefix,
    repository,
    async cleanup() {
      await repository.close();
      await cleanupPrefix(redisUrl, prefix);
    },
  };
}

function createDelayedGetClient(
  client: TestRedisClient,
  key: string,
  state: DelayedGetState,
) {
  return {
    get isOpen(): boolean {
      return client.isOpen;
    },

    sendCommand(args: readonly string[]): Promise<unknown> {
      return (async () => {
        if (args[0] === "GET" && args[1] === key) {
          state.count++;
          if (state.count < 2) {
            await new Promise<void>((resolve) => {
              state.waiters.push(resolve);
              setTimeout(resolve, 50);
            });
          } else {
            for (const resolve of state.waiters) resolve();
            state.waiters.length = 0;
          }
        }
        return await client.sendCommand([...args]);
      })();
    },
  };
}

function createDeferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createDelayedDeleteClient(
  client: TestRedisClient,
  key: string,
  observed: Deferred,
  release: Deferred,
) {
  return {
    get isOpen(): boolean {
      return client.isOpen;
    },

    sendCommand(args: readonly string[]): Promise<unknown> {
      return (async () => {
        if (args[0] === "DEL" && args[1] === key) {
          observed.resolve();
          await release.promise;
        }
        return await client.sendCommand([...args]);
      })();
    },
  };
}

function createDelayedCommandClient(
  client: TestRedisClient,
  matches: (args: readonly string[]) => boolean,
  observed: Deferred,
  release: Deferred,
) {
  return {
    get isOpen(): boolean {
      return client.isOpen;
    },

    sendCommand(args: readonly string[]): Promise<unknown> {
      return (async () => {
        if (matches(args)) {
          observed.resolve();
          await release.promise;
        }
        return await client.sendCommand([...args]);
      })();
    },
  };
}

function createRecordingClient(
  client: TestRedisClient,
  commands: string[][],
) {
  return {
    get isOpen(): boolean {
      return client.isOpen;
    },

    async sendCommand(args: readonly string[]): Promise<unknown> {
      commands.push([...args]);
      return await client.sendCommand([...args]);
    },
  };
}

if (redisUrl == null) {
  test("RedisRepository integration tests", { skip: true }, () => {});
} else {
  describe("RedisRepository", () => {
    test("rejects invalid constructor option combinations", () => {
      assert.throws(
        () => Reflect.construct(RedisRepository, [undefined]),
        new TypeError("RedisRepositoryOptions must be provided."),
      );
      assert.throws(
        () => Reflect.construct(RedisRepository, [null]),
        new TypeError("RedisRepositoryOptions must be provided."),
      );
      assert.throws(
        () => Reflect.construct(RedisRepository, [{}]),
        new TypeError(
          "RedisRepositoryOptions must provide exactly one of client or url.",
        ),
      );
      assert.throws(
        () =>
          Reflect.construct(RedisRepository, [{
            client: { sendCommand: () => Promise.resolve(undefined) },
            url: redisUrl,
          }]),
        new TypeError(
          "RedisRepositoryOptions must provide exactly one of client or url.",
        ),
      );
      assert.throws(
        () =>
          new RedisRepository({
            client: { sendCommand: () => Promise.resolve(undefined) },
            lockTimeoutMs: 0,
          }),
        new RangeError("lockTimeoutMs must be a positive number."),
      );
      assert.throws(
        () =>
          new RedisRepository({
            client: { sendCommand: () => Promise.resolve(undefined) },
            lockTimeoutMs: 1_000,
            lockRenewIntervalMs: 1_000,
          }),
        new RangeError(
          "lockRenewIntervalMs must be less than lockTimeoutMs.",
        ),
      );
    });

    test("successor is atomic, scoped and persistent", async (t) => {
      const harness = createHarness();
      const repo = harness.repository;
      const target = new URL("https://new.example/actor");
      try {
        assert.strictEqual(await repo.getSuccessor("old", t.signal), undefined);
        const results = await Promise.all([
          repo.setSuccessor("old", target, t.signal),
          repo.setSuccessor(
            "old",
            new URL("https://other.example/actor"),
            t.signal,
          ),
        ]);
        assert.strictEqual(results.filter(Boolean).length, 1);
        const successor = await repo.getSuccessor("old", t.signal);
        assert.ok(successor);
        assert.ok(!await repo.setSuccessor("old", successor));
        assert.strictEqual(await repo.getSuccessor("sibling"), undefined);
        await assert.rejects(
          repo.setSuccessor("sibling", target, AbortSignal.abort()),
          { name: "AbortError" },
        );
        const second = new RedisRepository({
          url: redisUrl,
          prefix: harness.prefix,
        });
        try {
          assert.deepStrictEqual(await second.getSuccessor("old"), successor);
          assert.ok(!await second.setSuccessor("old", target));
        } finally {
          await second.close();
        }
      } finally {
        await harness.cleanup();
      }
    });

    test("key pairs", async () => {
      const { repository, cleanup } = createHarness();
      try {
        const keyPairs = await createKeyPairs();
        assert.deepStrictEqual(await repository.getKeyPairs("bot"), undefined);
        await repository.setKeyPairs("bot", keyPairs);
        assert.deepStrictEqual(
          await Promise.all(
            (await repository.getKeyPairs("bot"))!.map((pair) =>
              exportJwk(pair.publicKey)
            ),
          ),
          await Promise.all(keyPairs.map((pair) => exportJwk(pair.publicKey))),
        );
      } finally {
        await cleanup();
      }
    });

    test("does not close injected clients", async () => {
      if (redisUrl == null) throw new Error("REDIS_URL is not set.");
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const client = createClient({ url: redisUrl });
      await client.connect();
      const repository = new RedisRepository({ client, prefix });
      const rejectedReady = Promise.reject(new TypeError("Unexpected await."));
      rejectedReady.catch(() => {});
      Reflect.set(repository, "ready", rejectedReady);
      try {
        assert.ok(client.isOpen);
        await repository.close();
        assert.ok(client.isOpen);
        await assert.rejects(
          () => repository.countMessages("bot"),
          new TypeError("RedisRepository is closed."),
        );
      } finally {
        await client.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("closes owned clients after failed initial connection", async () => {
      const repository = new RedisRepository({
        url: new URL("redis://127.0.0.1:1"),
        clientOptions: {
          socket: {
            connectTimeout: 50,
            reconnectStrategy: false,
          },
        },
      });
      await assert.doesNotReject(repository.close());
    });

    test("uses already open owned clients without reconnecting", async () => {
      const { repository, cleanup } = createHarness();
      try {
        assert.deepStrictEqual(await repository.countMessages("bot"), 0);
        Reflect.set(repository, "ready", undefined);
        await assert.doesNotReject(repository.countMessages("bot"));
      } finally {
        await cleanup();
      }
    });

    test("awaits pending readiness before commands", async () => {
      const ready = createDeferred();
      let readyResolved = false;
      let connectCalled = false;
      let commandFinished = false;
      const repository = new RedisRepository({
        client: {
          get isOpen(): boolean {
            return true;
          },

          connect(): Promise<unknown> {
            connectCalled = true;
            return Promise.reject(new TypeError("Unexpected reconnect."));
          },

          sendCommand(args: readonly string[]): Promise<unknown> {
            assert.deepStrictEqual(args[0], "ZCARD");
            assert.ok(readyResolved);
            return Promise.resolve(0);
          },
        },
      });
      Reflect.set(repository, "ownsClient", true);
      Reflect.set(
        repository,
        "ready",
        ready.promise.then(() => {
          readyResolved = true;
        }),
      );
      const countPromise = repository.countMessages("bot").then((count) => {
        commandFinished = true;
        return count;
      });
      await delay(50);
      assert.ok(!commandFinished);
      assert.ok(!connectCalled);
      ready.resolve();
      assert.deepStrictEqual(await countPromise, 0);
      assert.ok(!connectCalled);
    });

    test("messages basic operations and ordering", async () => {
      const { repository, cleanup } = createHarness();
      try {
        const firstId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
        const secondId = "01942976-3400-7f34-872e-2cbf0f9eeac4";
        const first = createMessage(firstId, "first", "2025-01-01T00:00:00Z");
        const second = createMessage(
          secondId,
          "second",
          "2025-01-02T00:00:00Z",
        );

        assert.deepStrictEqual(await repository.countMessages("bot"), 0);
        await repository.addMessage("bot", firstId, first);
        await repository.addMessage("bot", secondId, second);
        assert.deepStrictEqual(await repository.countMessages("bot"), 2);
        assert.deepStrictEqual(
          await repository.getMessage("other", firstId),
          undefined,
        );
        assert.deepStrictEqual(
          await (await repository.getMessage("bot", firstId))?.toJsonLd(),
          await first.toJsonLd(),
        );
        assert.deepStrictEqual(
          (await Array.fromAsync(
            repository.getMessages("bot", { order: "oldest" }),
          )).length,
          2,
        );
        assert.deepStrictEqual(
          (await Array.fromAsync(repository.getMessages("bot", {
            since: Temporal.Instant.from("2025-01-02T00:00:00Z"),
          }))).length,
          1,
        );
        assert.deepStrictEqual(
          await (await repository.removeMessage("bot", firstId))?.toJsonLd(),
          await first.toJsonLd(),
        );
        assert.deepStrictEqual(await repository.countMessages("bot"), 1);
      } finally {
        await cleanup();
      }
    });

    test("fetches listed messages in batched Redis commands", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const client = createClient({ url: redisUrl });
      await client.connect();
      const commands: string[][] = [];
      const repository = new RedisRepository({
        client: createRecordingClient(client, commands),
        prefix,
      });
      try {
        for (let i = 0; i < 101; i++) {
          const sequence = i.toString(16).padStart(4, "0");
          const id: `${string}-${string}-${string}-${string}-${string}` =
            `01941f29-${sequence}-7fe8-ab0a-7b593990a3c0`;
          await repository.addMessage(
            "bot",
            id,
            createMessage(id, `message ${i}`, "2025-01-01T00:00:00Z"),
          );
        }

        commands.length = 0;
        assert.deepStrictEqual(
          (await Array.fromAsync(repository.getMessages("bot"))).length,
          101,
        );
        const mgets = commands.filter(([command]) => command === "MGET");
        assert.deepStrictEqual(mgets.length, 2);
        assert.ok(mgets.every((mget) => mget.length <= 101));
        assert.ok(
          !commands.some(([command, key]) =>
            command === "GET" && key?.includes(":messages:")
          ),
        );
      } finally {
        await repository.close();
        await client.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("removes corrupted messages without throwing", async () => {
      const { repository, cleanup, prefix } = createHarness();
      const client = createClient({ url: redisUrl });
      await client.connect();
      try {
        const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
        const key = `${prefix}:bots:bot:messages:${messageId}`;
        await client.sendCommand(["SET", key, "{"]);
        await client.sendCommand([
          "ZADD",
          `${prefix}:bots:bot:messages`,
          "0",
          messageId,
        ]);
        assert.deepStrictEqual(
          await repository.removeMessage("bot", messageId),
          undefined,
        );
        assert.deepStrictEqual(await client.sendCommand(["GET", key]), null);
        assert.deepStrictEqual(await repository.countMessages("bot"), 0);
      } finally {
        await client.quit();
        await cleanup();
      }
    });

    test("ignores corrupted messages during updates", async () => {
      const { repository, cleanup, prefix } = createHarness();
      const client = createClient({ url: redisUrl });
      await client.connect();
      try {
        const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
        await client.sendCommand([
          "SET",
          `${prefix}:bots:bot:messages:${messageId}`,
          "{",
        ]);
        assert.deepStrictEqual(
          await repository.updateMessage("bot", messageId, () => {
            throw new TypeError("Unexpected updater call.");
          }),
          false,
        );
      } finally {
        await client.quit();
        await cleanup();
      }
    });

    test("serializes concurrent message updates", async () => {
      const { repository, cleanup } = createHarness();
      try {
        const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
        const message = createMessage(
          messageId,
          "base",
          "2025-01-01T00:00:00Z",
        );
        await repository.addMessage("bot", messageId, message);

        let activeUpdaters = 0;
        let maxActiveUpdaters = 0;
        const append = (suffix: string) =>
          repository.updateMessage("bot", messageId, async (existing) => {
            assert.ok(existing instanceof Create);
            activeUpdaters++;
            maxActiveUpdaters = Math.max(maxActiveUpdaters, activeUpdaters);
            const content = await getMessageContent(existing);
            await delay(50);
            activeUpdaters--;
            return existing.clone({
              object: new Note({
                content: `${content}${suffix}`,
              }),
            });
          });

        assert.deepStrictEqual(await Promise.all([append("A"), append("B")]), [
          true,
          true,
        ]);
        assert.deepStrictEqual(maxActiveUpdaters, 1);

        const updated = await repository.getMessage("bot", messageId);
        assert.ok(updated instanceof Create);
        const content = await getMessageContent(updated);
        assert.ok(content === "baseAB" || content === "baseBA");
      } finally {
        await cleanup();
      }
    });

    test("renews Redis locks during long message updates", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const firstClient = createClient({ url: redisUrl });
      const secondClient = createClient({ url: redisUrl });
      await firstClient.connect();
      await secondClient.connect();
      const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
      const firstRepository = new RedisRepository({
        client: firstClient,
        prefix,
        lockTimeoutMs: 1_500,
        lockRenewIntervalMs: 500,
      });
      const secondRepository = new RedisRepository({
        client: secondClient,
        prefix,
        lockTimeoutMs: 1_500,
        lockRenewIntervalMs: 500,
      });
      try {
        const message = createMessage(
          messageId,
          "base",
          "2025-01-01T00:00:00Z",
        );
        await firstRepository.addMessage("bot", messageId, message);

        let activeUpdaters = 0;
        let maxActiveUpdaters = 0;
        const append = (
          repository: RedisRepository,
          suffix: string,
          waitMs: number,
        ) =>
          repository.updateMessage("bot", messageId, async (existing) => {
            assert.ok(existing instanceof Create);
            activeUpdaters++;
            maxActiveUpdaters = Math.max(maxActiveUpdaters, activeUpdaters);
            const content = await getMessageContent(existing);
            await delay(waitMs);
            activeUpdaters--;
            return existing.clone({
              object: new Note({
                content: `${content}${suffix}`,
              }),
            });
          });

        assert.deepStrictEqual(
          await Promise.all([
            append(firstRepository, "A", 2_200),
            append(secondRepository, "B", 50),
          ]),
          [true, true],
        );
        assert.deepStrictEqual(maxActiveUpdaters, 1);

        const updated = await firstRepository.getMessage("bot", messageId);
        assert.ok(updated instanceof Create);
        const content = await getMessageContent(updated);
        assert.ok(content === "baseAB" || content === "baseBA");
      } finally {
        await firstRepository.close();
        await secondRepository.close();
        await firstClient.quit();
        await secondClient.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("stops renewing Redis locks after close", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const client = createClient({ url: redisUrl });
      await client.connect();
      const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
      const repository = new RedisRepository({
        client,
        prefix,
        lockTimeoutMs: 500,
        lockRenewIntervalMs: 50,
      });
      const records: LogRecord[] = [];
      const release = createDeferred();
      let update: Promise<boolean> | undefined;
      try {
        await repository.addMessage(
          "bot",
          messageId,
          createMessage(messageId, "base", "2025-01-01T00:00:00Z"),
        );
        configureSync({
          sinks: {
            capture: (record) => records.push(record),
          },
          loggers: [
            {
              category: ["botkit", "redis"],
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

        let updaterStarted = false;
        update = repository.updateMessage(
          "bot",
          messageId,
          async (existing) => {
            assert.ok(existing instanceof Create);
            updaterStarted = true;
            await release.promise;
            return existing;
          },
        );
        while (!updaterStarted) await delay(1);

        await repository.close();
        await delay(150);

        assert.deepStrictEqual(records, []);
        release.resolve();
        await assert.rejects(
          update,
          new TypeError("RedisRepository is closed."),
        );
      } finally {
        release.resolve();
        await update?.catch(() => undefined);
        resetSync();
        await client.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("serializes message removal with concurrent updates", async () => {
      const { repository, cleanup } = createHarness();
      try {
        const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
        const message = createMessage(
          messageId,
          "base",
          "2025-01-01T00:00:00Z",
        );
        await repository.addMessage("bot", messageId, message);

        let updaterStarted = false;
        const update = repository.updateMessage(
          "bot",
          messageId,
          async (existing) => {
            assert.ok(existing instanceof Create);
            updaterStarted = true;
            await delay(50);
            const content = await getMessageContent(existing);
            return existing.clone({
              object: new Note({
                content: `${content}A`,
              }),
            });
          },
        );
        while (!updaterStarted) await delay(1);
        const removal = repository.removeMessage("bot", messageId);
        const [updated, removed] = await Promise.all([update, removal]);

        assert.ok(updated);
        assert.deepStrictEqual(
          await removed?.toJsonLd(),
          await message.clone({
            object: new Note({
              content: "baseA",
            }),
          }).toJsonLd(),
        );
        assert.deepStrictEqual(
          await repository.getMessage("bot", messageId),
          undefined,
        );
        assert.deepStrictEqual(await repository.countMessages("bot"), 0);
      } finally {
        await cleanup();
      }
    });

    test("serializes message indexing with removal", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const addClient = createClient({ url: redisUrl });
      const removeClient = createClient({ url: redisUrl });
      await addClient.connect();
      await removeClient.connect();
      const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
      const indexKey = [
        prefix,
        "bots",
        "bot",
        "messages",
      ].join(":");
      const observed = createDeferred();
      const release = createDeferred();
      const addRepository = new RedisRepository({
        client: createDelayedCommandClient(
          addClient,
          (args) =>
            args[0] === "ZADD" && args[1] === indexKey &&
            args.at(-1) === messageId,
          observed,
          release,
        ),
        prefix,
      });
      const removeRepository = new RedisRepository({
        client: removeClient,
        prefix,
      });
      try {
        const message = createMessage(
          messageId,
          "base",
          "2025-01-01T00:00:00Z",
        );

        const add = addRepository.addMessage("bot", messageId, message);
        await observed.promise;
        const removal = removeRepository.removeMessage("bot", messageId);
        await delay(50);
        release.resolve();

        await add;
        assert.deepStrictEqual(
          await (await removal)?.toJsonLd(),
          await message.toJsonLd(),
        );
        assert.deepStrictEqual(
          await addRepository.getMessage("bot", messageId),
          undefined,
        );
        assert.deepStrictEqual(await addRepository.countMessages("bot"), 0);
        assert.deepStrictEqual(
          await Array.fromAsync(addRepository.getMessages("bot")),
          [],
        );
      } finally {
        release.resolve();
        await addRepository.close();
        await removeRepository.close();
        await addClient.quit();
        await removeClient.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("persists data across repository instances", async () => {
      if (redisUrl == null) throw new Error("REDIS_URL is not set.");
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const firstRepository = new RedisRepository({ url: redisUrl, prefix });
      const secondRepository = new RedisRepository({ url: redisUrl, prefix });
      try {
        const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
        const message = createMessage(
          messageId,
          "persisted",
          "2025-01-01T00:00:00Z",
        );
        await firstRepository.addMessage("bot", messageId, message);
        assert.deepStrictEqual(
          await (await secondRepository.getMessage("bot", messageId))
            ?.toJsonLd(),
          await message.toJsonLd(),
        );
      } finally {
        await firstRepository.close();
        await secondRepository.close();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("followers with multiple follow requests", async () => {
      const { repository, cleanup, prefix } = createHarness();
      const client = createClient({ url: redisUrl });
      await client.connect();
      try {
        const follower = new Person({
          id: new URL("https://example.com/ap/actor/alice"),
          preferredUsername: "alice",
        });
        const followA = new URL(
          "https://example.com/ap/follow/f2fb7255-d3ad-4fef-8f9a-1d0f2c2ec0b4",
        );
        const followB = new URL(
          "https://example.com/ap/follow/a3d4cc4f-af93-4a9f-a7b3-0b7c0fe4901d",
        );

        await repository.addFollower("bot", followA, follower);
        await repository.addFollower("bot", followB, follower);
        assert.deepStrictEqual(await repository.countFollowers("bot"), 1);
        assert.ok(await repository.hasFollower("bot", follower.id!));
        assert.deepStrictEqual(
          await repository.removeFollower("bot", followA, follower.id!),
          undefined,
        );
        assert.ok(await repository.hasFollower("bot", follower.id!));
        assert.deepStrictEqual(
          await (await repository.removeFollower("bot", followB, follower.id!))
            ?.toJsonLd(),
          await follower.toJsonLd(),
        );
        assert.deepStrictEqual(await repository.countFollowers("bot"), 0);

        await repository.addFollower("bot", followB, follower);
        await client.sendCommand([
          "DEL",
          `${prefix}:bots:bot:followRequests:${
            encodeURIComponent(followB.href)
          }`,
        ]);
        assert.deepStrictEqual(
          await (await repository.removeFollower("bot", followB, follower.id!))
            ?.toJsonLd(),
          await follower.toJsonLd(),
        );
        assert.deepStrictEqual(await repository.countFollowers("bot"), 0);
      } finally {
        await client.quit();
        await cleanup();
      }
    });

    test("fetches listed followers in batched Redis commands", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const client = createClient({ url: redisUrl });
      await client.connect();
      const commands: string[][] = [];
      const repository = new RedisRepository({
        client: createRecordingClient(client, commands),
        prefix,
      });
      try {
        const alice = new Person({
          id: new URL("https://example.com/ap/actor/alice"),
          preferredUsername: "alice",
        });
        const bob = new Person({
          id: new URL("https://example.com/ap/actor/bob"),
          preferredUsername: "bob",
        });
        await repository.addFollower(
          "bot",
          new URL("https://example.com/ap/follow/alice"),
          alice,
        );
        await repository.addFollower(
          "bot",
          new URL("https://example.com/ap/follow/bob"),
          bob,
        );

        commands.length = 0;
        assert.deepStrictEqual(
          (await Array.fromAsync(repository.getFollowers("bot"))).length,
          2,
        );
        const mget = commands.find(([command]) => command === "MGET");
        assert.ok(mget != null);
        assert.deepStrictEqual(mget.length, 3);
        assert.ok(mget.slice(1).every((key) => key.includes(":followers:")));
        assert.ok(
          !commands.some(([command, key]) =>
            command === "GET" && key?.includes(":followers:")
          ),
        );
      } finally {
        await repository.close();
        await client.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("returns no followers for zero limits", async () => {
      const { repository, cleanup } = createHarness();
      try {
        const follower = new Person({
          id: new URL("https://example.com/ap/actor/alice"),
          preferredUsername: "alice",
        });
        const follow = new URL(
          "https://example.com/ap/follow/f2fb7255-d3ad-4fef-8f9a-1d0f2c2ec0b4",
        );

        await repository.addFollower("bot", follow, follower);
        assert.deepStrictEqual(
          await Array.fromAsync(repository.getFollowers("bot", { limit: 0 })),
          [],
        );
      } finally {
        await cleanup();
      }
    });

    test("serializes racing follower replacement and removal", async () => {
      const { repository, cleanup } = createHarness();
      try {
        const follow = new URL(
          "https://example.com/ap/follow/f2fb7255-d3ad-4fef-8f9a-1d0f2c2ec0b4",
        );
        const alice = new Person({
          id: new URL("https://example.com/ap/actor/alice"),
          preferredUsername: "alice",
        });
        const bob = new Person({
          id: new URL("https://example.com/ap/actor/bob"),
          preferredUsername: "bob",
        });

        for (let i = 0; i < 20; i++) {
          await repository.addFollower("bot", follow, alice);
          await Promise.all([
            repository.removeFollower("bot", follow, alice.id!),
            repository.addFollower("bot", follow, bob),
          ]);

          assert.ok(await repository.hasFollower("bot", bob.id!));
          assert.deepStrictEqual(
            await (await repository.removeFollower("bot", follow, bob.id!))
              ?.toJsonLd(),
            await bob.toJsonLd(),
          );
          assert.deepStrictEqual(await repository.countFollowers("bot"), 0);
        }
      } finally {
        await cleanup();
      }
    });

    test("sent follows, followees, and reverse indexes", async () => {
      const { repository, cleanup } = createHarness();
      try {
        const followeeId = new URL("https://example.com/ap/actor/john");
        const follow = new Follow({
          id: new URL(
            "https://example.com/ap/actor/bot/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
          ),
          actor: new URL("https://example.com/ap/actor/bot"),
          object: followeeId,
        });
        const id = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";

        await repository.addSentFollow("bot", id, follow);
        assert.deepStrictEqual(
          await (await repository.getSentFollow("bot", id))?.toJsonLd(),
          await follow.toJsonLd(),
        );
        assert.deepStrictEqual(
          await (await repository.removeSentFollow("bot", id))?.toJsonLd(),
          await follow.toJsonLd(),
        );

        await repository.addFollowee("bot", followeeId, follow);
        await repository.addFollowee("other", followeeId, follow);
        assert.deepStrictEqual(
          await Array.fromAsync(repository.findFollowedBots(followeeId)),
          ["bot", "other"],
        );
        assert.deepStrictEqual(
          await (await repository.removeFollowee("bot", followeeId))
            ?.toJsonLd(),
          await follow.toJsonLd(),
        );
        assert.deepStrictEqual(
          await Array.fromAsync(repository.findFollowedBots(followeeId)),
          ["other"],
        );
      } finally {
        await cleanup();
      }
    });

    test("serializes followee indexes with removals", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const addClient = createClient({ url: redisUrl });
      const removeClient = createClient({ url: redisUrl });
      await addClient.connect();
      await removeClient.connect();
      const followeeId = new URL("https://example.com/ap/actor/john");
      const indexKey = [
        prefix,
        "index",
        "followees",
        encodeURIComponent(followeeId.href),
      ].join(":");
      const observed = createDeferred();
      const release = createDeferred();
      const addRepository = new RedisRepository({
        client: createDelayedCommandClient(
          addClient,
          (args) =>
            args[0] === "ZADD" && args[1] === indexKey &&
            args.at(-1) === "bot",
          observed,
          release,
        ),
        prefix,
      });
      const removeRepository = new RedisRepository({
        client: removeClient,
        prefix,
      });
      try {
        const follow = new Follow({
          id: new URL(
            "https://example.com/ap/actor/bot/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
          ),
          actor: new URL("https://example.com/ap/actor/bot"),
          object: followeeId,
        });

        const add = addRepository.addFollowee("bot", followeeId, follow);
        await observed.promise;
        const removal = removeRepository.removeFollowee("bot", followeeId);
        await delay(50);
        release.resolve();

        await add;
        assert.deepStrictEqual(
          await (await removal)?.toJsonLd(),
          await follow.toJsonLd(),
        );
        assert.deepStrictEqual(
          await addRepository.getFollowee("bot", followeeId),
          undefined,
        );
        assert.deepStrictEqual(
          await Array.fromAsync(addRepository.findFollowedBots(followeeId)),
          [],
        );
      } finally {
        release.resolve();
        await addRepository.close();
        await removeRepository.close();
        await addClient.quit();
        await removeClient.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("poll voting", async () => {
      const { repository, cleanup } = createHarness();
      try {
        const messageId = "01945678-1234-7890-abcd-ef0123456789";
        const voter1 = new URL("https://example.com/ap/actor/alice");
        const voter2 = new URL("https://example.com/ap/actor/bob");
        await repository.vote("bot", messageId, voter1, "option1");
        await repository.vote("bot", messageId, voter1, "option1");
        await repository.vote("bot", messageId, voter2, "option1");
        await repository.vote("bot", messageId, voter1, "option2");
        assert.deepStrictEqual(
          await repository.countVoters("bot", messageId),
          2,
        );
        assert.deepStrictEqual(await repository.countVotes("bot", messageId), {
          option1: 2,
          option2: 1,
        });
      } finally {
        await cleanup();
      }
    });

    test("quote authorizations and references", async () => {
      const { repository, cleanup, prefix } = createHarness();
      const client = createClient({ url: redisUrl });
      await client.connect();
      try {
        const firstId = "01942976-3400-7f34-872e-2cbf0f9eeac4";
        const secondId = "01942976-3400-7f34-872e-2cbf0f9eeac5";
        const quote = new URL("https://remote.example/notes/quote");
        const target = new URL("https://example.com/ap/note/1");
        const first = new QuoteAuthorization({
          id: new URL(
            `https://example.com/ap/actor/bot/quote-authorization/${firstId}`,
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          interactingObject: quote,
          interactionTarget: target,
        });
        const second = new QuoteAuthorization({
          id: new URL(
            `https://example.com/ap/actor/bot/quote-authorization/${secondId}`,
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          interactingObject: quote,
          interactionTarget: target,
        });

        await repository.addQuoteAuthorization("bot", firstId, first);
        await repository.addQuoteAuthorization("bot", secondId, second);
        assert.deepStrictEqual(
          (await repository.findQuoteAuthorization("bot", quote))?.id?.href,
          first.id?.href,
        );
        assert.deepStrictEqual(
          await repository.getQuoteAuthorization("bot", secondId),
          undefined,
        );

        const stamp = new URL("https://remote.example/stamps/1");
        const attribution = new URL("https://remote.example/actor/alice");
        await repository.addQuoteAuthorizationReference(
          "bot",
          stamp,
          firstId,
          attribution,
        );
        await repository.addQuoteAuthorizationReference(
          "other",
          stamp,
          firstId,
        );
        assert.deepStrictEqual(
          await repository.findQuoteAuthorizationReference("bot", stamp),
          firstId,
        );
        assert.deepStrictEqual(
          await repository.findQuoteAuthorizationReferenceAttribution(
            "bot",
            stamp,
          ),
          attribution,
        );
        await client.sendCommand([
          "SET",
          `${prefix}:bots:bot:quoteAuthorizationRefs:${
            encodeURIComponent(stamp.href)
          }`,
          "null",
        ]);
        assert.deepStrictEqual(
          await repository.findQuoteAuthorizationReference("bot", stamp),
          undefined,
        );
        assert.deepStrictEqual(
          await repository.findQuoteAuthorizationReferenceAttribution(
            "bot",
            stamp,
          ),
          undefined,
        );
        assert.deepStrictEqual(
          await Array.fromAsync(
            repository.findQuoteAuthorizationReferenceIdentifiers(stamp),
          ),
          ["bot", "other"],
        );
        await repository.removeQuoteAuthorizationReference("bot", stamp);
        assert.deepStrictEqual(
          await Array.fromAsync(
            repository.findQuoteAuthorizationReferenceIdentifiers(stamp),
          ),
          ["other"],
        );
      } finally {
        await client.quit();
        await cleanup();
      }
    });

    test("serializes quote authorization reference indexes with removals", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const addRepository = new RedisRepository({ url: redisUrl, prefix });
      const removeClient = createClient({ url: redisUrl });
      await removeClient.connect();
      const stamp = new URL("https://remote.example/stamps/serialized");
      const indexKey = `${prefix}:index:quoteAuthorizationRefs:${
        encodeURIComponent(stamp.href)
      }`;
      const removeObserved = createDeferred();
      const releaseRemove = createDeferred();
      const removeRepository = new RedisRepository({
        client: createDelayedCommandClient(
          removeClient,
          (args) =>
            args[0] === "ZREM" && args[1] === indexKey && args[2] === "bot",
          removeObserved,
          releaseRemove,
        ),
        prefix,
      });
      try {
        const oldId = "01942976-3400-7f34-872e-2cbf0f9eeac4";
        const newId = "01942976-3400-7f34-872e-2cbf0f9eeac5";
        await addRepository.addQuoteAuthorizationReference("bot", stamp, oldId);
        const removePromise = removeRepository
          .removeQuoteAuthorizationReference(
            "bot",
            stamp,
          );
        await removeObserved.promise;
        let addFinished = false;
        const addPromise = addRepository
          .addQuoteAuthorizationReference("bot", stamp, newId)
          .then(() => {
            addFinished = true;
          });
        await delay(50);
        assert.ok(!addFinished);
        releaseRemove.resolve();
        await Promise.all([removePromise, addPromise]);
        assert.deepStrictEqual(
          await addRepository.findQuoteAuthorizationReference("bot", stamp),
          newId,
        );
        assert.deepStrictEqual(
          await Array.fromAsync(
            addRepository.findQuoteAuthorizationReferenceIdentifiers(stamp),
          ),
          ["bot"],
        );
      } finally {
        releaseRemove.resolve();
        await addRepository.close();
        await removeRepository.close();
        await removeClient.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("serializes concurrent quote authorization inserts", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const firstClient = createClient({ url: redisUrl });
      const secondClient = createClient({ url: redisUrl });
      await firstClient.connect();
      await secondClient.connect();
      const quote = new URL("https://remote.example/notes/raced-quote");
      const state: DelayedGetState = { count: 0, waiters: [] };
      const indexKey = [
        prefix,
        "bots",
        "bot",
        "quoteAuthorizationsByInteractingObject",
        encodeURIComponent(quote.href),
      ].join(":");
      const firstRepository = new RedisRepository({
        client: createDelayedGetClient(firstClient, indexKey, state),
        prefix,
      });
      const secondRepository = new RedisRepository({
        client: createDelayedGetClient(secondClient, indexKey, state),
        prefix,
      });
      try {
        const firstId = "01942976-3400-7f34-872e-2cbf0f9eeac6";
        const secondId = "01942976-3400-7f34-872e-2cbf0f9eeac7";
        const target = new URL("https://example.com/ap/note/1");
        const first = new QuoteAuthorization({
          id: new URL(
            `https://example.com/ap/actor/bot/quote-authorization/${firstId}`,
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          interactingObject: quote,
          interactionTarget: target,
        });
        const second = new QuoteAuthorization({
          id: new URL(
            `https://example.com/ap/actor/bot/quote-authorization/${secondId}`,
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          interactingObject: quote,
          interactionTarget: target,
        });

        await Promise.all([
          firstRepository.addQuoteAuthorization("bot", firstId, first),
          secondRepository.addQuoteAuthorization("bot", secondId, second),
        ]);

        const found = await firstRepository.findQuoteAuthorization(
          "bot",
          quote,
        );
        const stored = (await Promise.all([
          firstRepository.getQuoteAuthorization("bot", firstId),
          firstRepository.getQuoteAuthorization("bot", secondId),
        ])).filter((authorization) => authorization != null);
        assert.deepStrictEqual(stored.length, 1);
        assert.deepStrictEqual(found?.id?.href, stored[0].id?.href);
      } finally {
        await firstRepository.close();
        await secondRepository.close();
        await firstClient.quit();
        await secondClient.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("serializes quote authorization removal with inserts", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const addRepository = new RedisRepository({ url: redisUrl, prefix });
      const removeClient = createClient({ url: redisUrl });
      await removeClient.connect();
      const quote = new URL("https://remote.example/notes/remove-race");
      const target = new URL("https://example.com/ap/note/remove-race");
      const oldId = "01942976-3400-7f34-872e-2cbf0f9eeac6";
      const newId = "01942976-3400-7f34-872e-2cbf0f9eeac7";
      const oldAuthorization = new QuoteAuthorization({
        id: new URL(
          `https://example.com/ap/actor/bot/quote-authorization/${oldId}`,
        ),
        attribution: new URL("https://example.com/ap/actor/bot"),
        interactingObject: quote,
        interactionTarget: target,
      });
      const newAuthorization = new QuoteAuthorization({
        id: new URL(
          `https://example.com/ap/actor/bot/quote-authorization/${newId}`,
        ),
        attribution: new URL("https://example.com/ap/actor/bot"),
        interactingObject: quote,
        interactionTarget: target,
      });
      const authorizationKey =
        `${prefix}:bots:bot:quoteAuthorizations:${oldId}`;
      const removeObserved = createDeferred();
      const releaseRemove = createDeferred();
      const removeRepository = new RedisRepository({
        client: createDelayedCommandClient(
          removeClient,
          (args) =>
            args[0] === "DEL" &&
            args.includes(authorizationKey),
          removeObserved,
          releaseRemove,
        ),
        prefix,
      });
      try {
        await addRepository.addQuoteAuthorization(
          "bot",
          oldId,
          oldAuthorization,
        );
        const removePromise = removeRepository.removeQuoteAuthorization(
          "bot",
          oldId,
        );
        await removeObserved.promise;
        let addFinished = false;
        const addPromise = addRepository
          .addQuoteAuthorization("bot", newId, newAuthorization)
          .then(() => {
            addFinished = true;
          });
        await delay(50);
        assert.ok(!addFinished);
        releaseRemove.resolve();
        await Promise.all([removePromise, addPromise]);
        assert.deepStrictEqual(
          (await addRepository.findQuoteAuthorization("bot", quote))?.id?.href,
          newAuthorization.id?.href,
        );
      } finally {
        releaseRemove.resolve();
        await addRepository.close();
        await removeRepository.close();
        await removeClient.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });

    test("preserves quote authorization indexes during stale cleanup", async () => {
      const prefix = `botkit_test_${crypto.randomUUID()}`;
      const setupClient = createClient({ url: redisUrl });
      const findClient = createClient({ url: redisUrl });
      await setupClient.connect();
      await findClient.connect();
      const quote = new URL("https://remote.example/notes/cleanup-race");
      const indexKey = [
        prefix,
        "bots",
        "bot",
        "quoteAuthorizationsByInteractingObject",
        encodeURIComponent(quote.href),
      ].join(":");
      const observed = createDeferred();
      const release = createDeferred();
      const findRepository = new RedisRepository({
        client: createDelayedDeleteClient(
          findClient,
          indexKey,
          observed,
          release,
        ),
        prefix,
      });
      const addRepository = new RedisRepository({ url: redisUrl, prefix });
      try {
        const id = "01942976-3400-7f34-872e-2cbf0f9eeac8";
        const staleId = "01942976-3400-7f34-872e-2cbf0f9eeac9";
        const authorization = new QuoteAuthorization({
          id: new URL(
            `https://example.com/ap/actor/bot/quote-authorization/${id}`,
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          interactingObject: quote,
          interactionTarget: new URL("https://example.com/ap/note/1"),
        });
        await setupClient.sendCommand(["SET", indexKey, staleId]);

        const findPromise = findRepository.findQuoteAuthorization("bot", quote);
        await observed.promise;
        const addPromise = addRepository.addQuoteAuthorization(
          "bot",
          id,
          authorization,
        );
        await delay(50);
        release.resolve();

        assert.deepStrictEqual(await findPromise, undefined);
        await addPromise;
        assert.deepStrictEqual(
          (await addRepository.findQuoteAuthorization("bot", quote))?.id?.href,
          authorization.id?.href,
        );
      } finally {
        release.resolve();
        await findRepository.close();
        await addRepository.close();
        await setupClient.quit();
        await findClient.quit();
        await cleanupPrefix(redisUrl, prefix);
      }
    });
  });
}
