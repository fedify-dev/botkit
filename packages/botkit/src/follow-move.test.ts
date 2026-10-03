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
import { type InboxContext, MemoryKvStore } from "@fedify/fedify/federation";
import {
  Accept,
  type Activity,
  Follow,
  Move,
  Note,
  Person,
  Undo,
} from "@fedify/vocab";
import {
  type DocumentLoader,
  FetchError,
  UrlError,
} from "@fedify/vocab-runtime";
import assert from "node:assert/strict";
import { test } from "node:test";
import { BotImpl } from "./bot-impl.ts";
import { createBot } from "./bot.ts";
import { InstanceImpl } from "./instance-impl.ts";
import { MemoryRepository } from "./repository.ts";

const oldId = new URL("https://old.example/users/alice");
const newId = new URL("https://new.example/users/alice");
const oldActor = new Person({ id: oldId, inbox: new URL("inbox", oldId) });
const newActor = new Person({
  id: newId,
  inbox: new URL("inbox", newId),
  aliases: [oldId],
});
const move = new Move({
  id: new URL("#move", oldId),
  actor: oldActor,
  object: oldId,
  target: newId,
});

async function harness(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const repository = new MemoryRepository();
  const instance = new InstanceImpl<void>({
    kv: new MemoryKvStore(),
    repository,
  });
  const alpha = instance.createBot("alpha", {
    username: "alpha",
    aliases: [oldId],
  });
  const beta = instance.createBot("beta", { username: "beta" });
  const ctx = instance.federation.createContext(
    new URL("https://example.com"),
    undefined,
  ) as InboxContext<void>;
  Object.defineProperty(ctx, "recipient", { value: null, configurable: true });
  const sent: Activity[] = [];
  ctx.sendActivity = (_sender, _recipient, activity) => {
    sent.push(activity);
    return Promise.resolve();
  };
  const loads: string[] = [];
  const documents = new Map<string, unknown>([
    [newId.href, await newActor.toJsonLd()],
    [oldId.href, await oldActor.toJsonLd()],
  ]);
  const loader: DocumentLoader = (url) => {
    loads.push(url);
    return Promise.resolve({
      contextUrl: null,
      documentUrl: url,
      document: documents.get(url),
    });
  };
  Object.defineProperty(ctx, "getDocumentLoader", {
    value: () => Promise.resolve(loader),
    configurable: true,
  });
  for (const bot of [alpha, beta]) {
    await repository.addFollowee(
      bot.identifier,
      oldId,
      new Follow({
        id: ctx.getObjectUri(Follow, {
          identifier: bot.identifier,
          id: "018f6db5-27d2-7000-8000-000000000001",
        }),
        actor: ctx.getActorUri(bot.identifier),
        object: oldId,
        to: oldId,
      }),
    );
  }
  return { instance, repository, alpha, beta, ctx, sent, loads, documents };
}

test("a verified push Move migrates all followed bots and emits events", async (t) => {
  const { instance, repository, alpha, beta, ctx, sent, loads } = await harness(
    t.signal,
  );
  const moved: string[] = [];
  for (const bot of [alpha, beta]) {
    bot.onFolloweeMove = async (session, oldActor, newActor) => {
      assert.deepStrictEqual(oldActor.id, oldId);
      assert.deepStrictEqual(newActor.id, newId);
      assert.ok(!await repository.getFollowee(bot.identifier, oldId));
      assert.ok(!await session.follows(newActor)); // Still awaiting Accept.
      moved.push(session.bot.identifier);
    };
  }
  await instance.onMoved(ctx, move, t.signal);
  assert.deepStrictEqual(moved, ["alpha", "beta"]);
  assert.deepStrictEqual(sent.map((a) => a.constructor), [
    Follow,
    Undo,
    Follow,
    Undo,
  ]);
  assert.deepStrictEqual(sent[0].objectId, newId);
  assert.deepStrictEqual(loads.filter((url) => url === newId.href), [
    newId.href,
  ]);
  await instance.onMoved(ctx, move, t.signal);
  assert.strictEqual(sent.length, 4);
  assert.strictEqual(moved.length, 2);
});

for (const recipient of ["alpha", "unrelated"]) {
  test(`personal inbox ${recipient} migrates every bot following the origin`, async (t) => {
    const h = await harness(t.signal);
    Object.defineProperty(h.ctx, "recipient", { value: recipient });
    await h.instance.onMoved(h.ctx, move, t.signal);
    assert.strictEqual(h.sent.length, 4);
    assert.ok(!await h.repository.getFollowee("alpha", oldId));
    assert.ok(!await h.repository.getFollowee("beta", oldId));
  });
}

test("unrelated bots and missing dynamic bots cause no target fetch", async (t) => {
  const h = await harness(t.signal);
  await h.repository.removeFollowee("alpha", oldId);
  await h.repository.removeFollowee("beta", oldId);
  await h.repository.addFollowee(
    "missing",
    oldId,
    new Follow({ object: oldId }),
  );
  await h.instance.onMoved(h.ctx, move, t.signal);
  assert.deepStrictEqual(h.sent, []);
  assert.deepStrictEqual(h.loads, []);
});

const invalidMoves = [
  ["missing id", new Move({ actor: oldActor, object: oldId, target: newId })],
  ["missing actor", new Move({ id: move.id, object: oldId, target: newId })],
  ["missing object", new Move({ id: move.id, actor: oldActor, target: newId })],
  ["missing target", new Move({ id: move.id, actor: oldActor, object: oldId })],
  ["pull mode", move.clone({ actor: newActor })],
  ["different object", move.clone({ object: newId })],
  ["same target", move.clone({ target: oldId })],
  ["non-HTTP target", move.clone({ target: new URL("urn:alice") })],
  ["multiple actors", move.clone({ actors: [oldActor, newActor] })],
  ["multiple objects", move.clone({ objects: [oldId, newId] })],
  ["multiple targets", move.clone({ targets: [newId, oldId] })],
] as const;
for (const [name, invalid] of invalidMoves) {
  test(`ignores Move with ${name} before lookup`, async (t) => {
    const h = await harness(t.signal);
    await h.instance.onMoved(h.ctx, invalid, t.signal);
    assert.deepStrictEqual(h.sent, []);
    assert.deepStrictEqual(h.loads, []);
    assert.ok(await h.repository.getFollowee("alpha", oldId));
  });
}

const invalidTargets = [
  ["no aliases", newActor.clone({ aliases: [] })],
  [
    "wrong alias",
    newActor.clone({ aliases: [new URL("https://old.example/@alice")] }),
  ],
  [
    "wrong id",
    newActor.clone({ id: new URL("https://new.example/users/bob") }),
  ],
  ["missing id", new Person({ inbox: newActor.inboxId, aliases: [oldId] })],
  ["missing inbox", new Person({ id: newId, aliases: [oldId] })],
  ["non-actor", new Note({ id: newId })],
] as const;
for (const [name, actor] of invalidTargets) {
  test(`ignores target with ${name}, even if embedded target claims valid aliases`, async (t) => {
    const h = await harness(t.signal);
    h.documents.set(newId.href, await actor.toJsonLd());
    await h.instance.onMoved(h.ctx, move.clone({ target: newActor }), t.signal);
    assert.deepStrictEqual(h.sent, []);
    assert.ok(await h.repository.getFollowee("alpha", oldId));
    assert.deepStrictEqual(h.loads, [newId.href]);
  });
}

for (const doc of [null, { "@context": { "@vocab": 42 }, type: "Person" }]) {
  test(`ignores malformed target JSON-LD (${JSON.stringify(doc)})`, async (t) => {
    const h = await harness(t.signal);
    h.documents.set(newId.href, doc);
    await h.instance.onMoved(h.ctx, move, t.signal);
    assert.deepStrictEqual(h.sent, []);
    assert.ok(await h.repository.getFollowee("alpha", oldId));
  });
}

test("ignores target document redirected to a different origin", async (t) => {
  const h = await harness(t.signal);
  Object.defineProperty(h.ctx, "getDocumentLoader", {
    value: () =>
      Promise.resolve(() =>
        Promise.resolve({
          documentUrl: "https://untrusted.example/actor",
          contextUrl: null,
          document: h.documents.get(newId.href),
        })
      ),
  });
  await h.instance.onMoved(h.ctx, move, t.signal);
  assert.deepStrictEqual(h.sent, []);
});

const fetchErrors = [
  ["non-JSON response", new SyntaxError("Invalid JSON."), true],
  ["disallowed URL", new UrlError("Disallowed URL."), true],
  ["DNS", new UrlError("DNS failed.", { reason: "dns" }), false],
  ["network", new TypeError("Network failed."), false],
  ["timeout", new FetchError(newId, "Timeout."), false],
  ...[200, 301, 304, 403, 404, 410, 408, 429, 500].map((status) =>
    [
      `HTTP ${status}`,
      new FetchError(newId, "Fetch failed.", new Response(null, { status })),
      status < 400 || status < 500 && status !== 408 && status !== 429,
    ] as const
  ),
] as const;
for (const [name, error, permanent] of fetchErrors) {
  test(`${permanent ? "ignores" : "retries"} target fetch failure: ${name}`, async (t) => {
    const h = await harness(t.signal);
    Object.defineProperty(h.ctx, "getDocumentLoader", {
      value: () => Promise.resolve(() => Promise.reject(error)),
      configurable: true,
    });
    if (permanent) await h.instance.onMoved(h.ctx, move, t.signal);
    else await assert.rejects(h.instance.onMoved(h.ctx, move, t.signal), error);
    assert.deepStrictEqual(h.sent, []);
    assert.ok(await h.repository.getFollowee("alpha", oldId));
  });
}

test("context loader failure is retried rather than mistaken for malformed JSON-LD", async (t) => {
  const h = await harness(t.signal);
  const error = new TypeError("Context fetch failed.");
  h.documents.set(newId.href, {
    "@context": "https://context.example/context",
    id: newId.href,
  });
  Object.defineProperty(h.ctx, "contextLoader", {
    value: () => Promise.reject(error),
  });
  await assert.rejects(h.instance.onMoved(h.ctx, move, t.signal), error);
  assert.deepStrictEqual(h.sent, []);
});

test("already accepted destination is retained without a second Follow", async (t) => {
  const h = await harness(t.signal);
  for (const bot of [h.alpha, h.beta]) {
    await h.repository.addFollowee(
      bot.identifier,
      newId,
      new Follow({
        actor: h.ctx.getActorUri(bot.identifier),
        object: newId,
      }),
    );
  }
  await h.instance.onMoved(h.ctx, move, t.signal);
  assert.deepStrictEqual(h.sent.map((a) => a.constructor), [Undo, Undo]);
  assert.ok(await h.repository.getFollowee("alpha", newId));
});

test("the destination's later Accept completes the new follow", async (t) => {
  const h = await harness(t.signal);
  await h.instance.onMoved(h.ctx, move, t.signal);
  const follow = h.sent[0];
  assert.ok(follow instanceof Follow);
  assert.ok(!await h.repository.getFollowee("alpha", newId));
  Object.defineProperty(h.ctx, "documentLoader", {
    value: (url: string) =>
      Promise.resolve({
        contextUrl: null,
        documentUrl: url,
        document: h.documents.get(url),
      }),
  });
  await h.instance.onFollowAccepted(
    h.ctx,
    new Accept({
      id: new URL("#accept", newId),
      actor: newActor,
      object: follow,
    }),
  );
  assert.ok(await h.repository.getFollowee("alpha", newId));
});

test("concurrent copies migrate each bot only once", async (t) => {
  const h = await harness(t.signal);
  const events: string[] = [];
  for (const bot of [h.alpha, h.beta]) {
    bot.onFolloweeMove = (s) => {
      events.push(s.bot.identifier);
    };
  }
  await Promise.all([
    h.instance.onMoved(h.ctx, move, t.signal),
    h.instance.onMoved(h.ctx, move, t.signal),
    h.instance.onMoved(
      h.ctx,
      move.clone({ id: new URL("#copy", oldId) }),
      t.signal,
    ),
  ]);
  assert.strictEqual(h.sent.length, 4);
  assert.deepStrictEqual(events, ["alpha", "beta"]);
});

test("a failed Follow preserves that bot's old follow and does not poison retries", async (t) => {
  const h = await harness(t.signal);
  const error = new TypeError("Follow submission failed.");
  const send = h.ctx.sendActivity;
  h.ctx.sendActivity = (sender, recipient, activity, options) => {
    if (
      activity instanceof Follow &&
      activity.actorId?.href === h.ctx.getActorUri("alpha").href
    ) return Promise.reject(error);
    if (recipient === "followers") {
      throw new TypeError("Unexpected collection delivery.");
    }
    return send(sender, recipient, activity, options);
  };
  const events: string[] = [];
  for (const bot of [h.alpha, h.beta]) {
    bot.onFolloweeMove = (s) => {
      events.push(s.bot.identifier);
    };
  }
  await assert.rejects(h.instance.onMoved(h.ctx, move, t.signal), error);
  assert.ok(await h.repository.getFollowee("alpha", oldId));
  assert.ok(!await h.repository.getFollowee("beta", oldId));
  assert.deepStrictEqual(events, ["beta"]);
  h.ctx.sendActivity = send;
  await h.instance.onMoved(h.ctx, move, t.signal);
  assert.deepStrictEqual(events, ["beta", "alpha"]);
  assert.strictEqual(h.sent.length, 4);
});

test("callback failure does not prevent other bots from migrating or firing callbacks", async (t) => {
  const h = await harness(t.signal);
  const error = new TypeError("Callback failed.");
  const events: string[] = [];
  h.alpha.onFolloweeMove = () => {
    throw error;
  };
  h.beta.onFolloweeMove = (s) => {
    events.push(s.bot.identifier);
  };
  await assert.rejects(h.instance.onMoved(h.ctx, move, t.signal), error);
  assert.deepStrictEqual(events, ["beta"]);
  assert.strictEqual(h.sent.length, 4);
  await h.instance.onMoved(h.ctx, move, t.signal);
  assert.deepStrictEqual(events, ["beta"]);
});

test("a slow callback does not hold the migration lock", async (t) => {
  const h = await harness(t.signal);
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  h.alpha.onFolloweeMove = () => {
    started.resolve();
    return finish.promise;
  };
  const first = h.instance.onMoved(h.ctx, move, t.signal);
  await started.promise;
  try {
    await h.instance.onMoved(h.ctx, move, t.signal);
    assert.strictEqual(h.sent.length, 4);
  } finally {
    finish.resolve();
    await first;
  }
});

test("Undo submission failure removes the old follow but does not emit or replay the event", async (t) => {
  const h = await harness(t.signal);
  const error = new TypeError("Undo failed.");
  const send = h.ctx.sendActivity;
  h.ctx.sendActivity = (sender, recipient, activity, options) => {
    if (recipient === "followers") {
      throw new TypeError("Unexpected collection delivery.");
    }
    return activity instanceof Undo
      ? Promise.reject(error)
      : send(sender, recipient, activity, options);
  };
  let events = 0;
  h.alpha.onFolloweeMove = h.beta.onFolloweeMove = () => {
    events++;
  };
  await assert.rejects(h.instance.onMoved(h.ctx, move, t.signal), error);
  assert.ok(!await h.repository.getFollowee("alpha", oldId));
  assert.strictEqual(events, 0);
  await h.instance.onMoved(h.ctx, move, t.signal);
  assert.strictEqual(h.sent.length, 2);
});

test("partial embedded origin is fetched to recover its delivery inbox", async (t) => {
  const h = await harness(t.signal);
  await h.instance.onMoved(
    h.ctx,
    move.clone({ actor: new Person({ id: oldId }) }),
    t.signal,
  );
  assert.strictEqual(h.sent.length, 4);
  assert.ok(h.loads.includes(oldId.href));
});

test("an aborted Move never mutates follow relationships", async (t) => {
  const h = await harness(t.signal);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(h.instance.onMoved(h.ctx, move, controller.signal), {
    name: "AbortError",
  });
  assert.deepStrictEqual(h.sent, []);
  assert.ok(await h.repository.getFollowee("alpha", oldId));
});

test("CreateBotOptions and wrapped setter expose onFolloweeMove", () => {
  const initial = () => {};
  const bot = createBot<void>({
    kv: new MemoryKvStore(),
    username: "bot",
    onFolloweeMove: initial,
  });
  assert.strictEqual(bot.onFolloweeMove, initial);
  const next = () => {};
  bot.onFolloweeMove = next;
  assert.strictEqual(bot.onFolloweeMove, next);
  bot.onFolloweeMove = undefined;
  assert.strictEqual(bot.onFolloweeMove, undefined);
});

test("dynamic groups forward the handler live for every resolved bot", async (t) => {
  const h = await harness(t.signal);
  await h.repository.removeFollowee("alpha", oldId);
  await h.repository.removeFollowee("beta", oldId);
  const group = h.instance.createBot((_ctx, id) =>
    id.startsWith("dynamic") ? { username: id } : null
  );
  await group.getSession(h.ctx.origin, "dynamic-a");
  const moved: string[] = [];
  group.onFolloweeMove = (s) => {
    moved.push(s.bot.identifier);
  };
  for (const id of ["dynamic-a", "dynamic-b"]) {
    await h.repository.addFollowee(
      id,
      oldId,
      new Follow({
        id: h.ctx.getObjectUri(Follow, {
          identifier: id,
          id: "018f6db5-27d2-7000-8000-000000000002",
        }),
        actor: h.ctx.getActorUri(id),
        object: oldId,
      }),
    );
  }
  await h.instance.onMoved(h.ctx, move, t.signal);
  assert.deepStrictEqual(moved, ["dynamic-a", "dynamic-b"]);
});

test("migration to one following bot skips itself and still migrates its siblings", async (t) => {
  const h = await harness(t.signal);
  const alphaId = h.ctx.getActorUri("alpha");
  await h.instance.onMoved(h.ctx, move.clone({ target: alphaId }), t.signal);
  assert.strictEqual(h.sent.length, 2);
  assert.deepStrictEqual(h.sent[0].actorId, h.ctx.getActorUri("beta"));
  assert.deepStrictEqual(h.sent[0].objectId, alphaId);
  assert.ok(await h.repository.getFollowee("alpha", oldId));
  assert.ok(!await h.repository.getFollowee("beta", oldId));
  assert.deepStrictEqual(h.loads, []); // Local target is resolved authoritatively.
});

test("single-bot compatibility path migrates and invokes its configured handler", async (t) => {
  const h = await harness(t.signal);
  let events = 0;
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
    repository: h.repository,
    onFolloweeMove: () => {
      events++;
    },
  });
  const ctx = bot.federation.createContext(
    new URL(h.ctx.origin),
    undefined,
  ) as InboxContext<void>;
  Object.defineProperty(ctx, "recipient", { value: "bot" });
  Object.defineProperty(ctx, "getDocumentLoader", {
    value: () => h.ctx.getDocumentLoader({ identifier: "alpha" }),
  });
  ctx.sendActivity = h.ctx.sendActivity;
  await h.repository.addFollowee(
    "bot",
    oldId,
    new Follow({
      id: ctx.getObjectUri(Follow, {
        identifier: "bot",
        id: "018f6db5-27d2-7000-8000-000000000004",
      }),
      actor: ctx.getActorUri("bot"),
      object: oldId,
    }),
  );
  await bot.instance.onMoved(ctx, move, t.signal);
  assert.strictEqual(events, 1);
  assert.ok(!await h.repository.getFollowee("bot", oldId));
  assert.strictEqual(h.sent.length, 2);
});

test("synchronous context-loader failure remains retriable", async (t) => {
  const h = await harness(t.signal);
  const error = new TypeError("Context fetch failed synchronously.");
  h.documents.set(newId.href, {
    "@context": "https://context.example/context",
    id: newId.href,
  });
  Object.defineProperty(h.ctx, "contextLoader", {
    value: () => {
      throw error;
    },
  });
  await assert.rejects(h.instance.onMoved(h.ctx, move, t.signal), error);
  assert.deepStrictEqual(h.sent, []);
});

test("origin lookup failure preserves all old follows", async (t) => {
  const h = await harness(t.signal);
  const error = new TypeError("Origin fetch failed.");
  Object.defineProperty(h.ctx, "getDocumentLoader", {
    value: () =>
      Promise.resolve((url: string) =>
        url === oldId.href ? Promise.reject(error) : Promise.resolve({
          documentUrl: url,
          contextUrl: null,
          document: h.documents.get(url),
        })
      ),
  });
  await assert.rejects(
    h.instance.onMoved(h.ctx, move.clone({ actor: oldId }), t.signal),
    error,
  );
  assert.deepStrictEqual(h.sent, []);
  assert.ok(await h.repository.getFollowee("alpha", oldId));
});

test("cancellation is forwarded to target and origin context loaders", async (t) => {
  const h = await harness(t.signal);
  const loadContext = h.ctx.contextLoader;
  let loaded = 0;
  Object.defineProperty(h.ctx, "contextLoader", {
    value: (url: string, options?: Parameters<DocumentLoader>[1]) => {
      loaded++;
      assert.strictEqual(options?.signal, t.signal);
      return loadContext(url, options);
    },
  });
  await h.instance.onMoved(h.ctx, move.clone({ actor: oldId }), t.signal);
  assert.ok(loaded > 0);
  assert.strictEqual(h.sent.length, 4);
});

for (const status of [401, 403]) {
  test(`target authorization denial (${status}) for one bot does not block its siblings`, async (t) => {
    const h = await harness(t.signal);
    const identities: string[] = [];
    Object.defineProperty(h.ctx, "getDocumentLoader", {
      value: (identity: { identifier: string }) =>
        Promise.resolve((url: string) => {
          identities.push(identity.identifier);
          if (identity.identifier === "alpha") {
            return Promise.reject(
              new FetchError(newId, "Denied.", new Response(null, { status })),
            );
          }
          return Promise.resolve({
            documentUrl: url,
            contextUrl: null,
            document: h.documents.get(url),
          });
        }),
    });
    await h.instance.onMoved(h.ctx, move, t.signal);
    assert.deepStrictEqual(identities, ["alpha", "beta"]);
    assert.strictEqual(h.sent.length, 4);
    assert.ok(!await h.repository.getFollowee("beta", oldId));
  });
}

for (const status of [401, 403]) {
  for (const embedded of [false, true]) {
    test(`origin authorization denial (${status}, embedded=${embedded}) retries a sibling identity`, async (t) => {
      const h = await harness(t.signal);
      const origins: string[] = [];
      Object.defineProperty(h.ctx, "getDocumentLoader", {
        value: (identity: { identifier: string }) =>
          Promise.resolve((url: string) => {
            if (url === oldId.href) {
              origins.push(identity.identifier);
              if (identity.identifier === "alpha") {
                return Promise.reject(
                  new FetchError(
                    oldId,
                    "Denied.",
                    new Response(null, { status }),
                  ),
                );
              }
            }
            return Promise.resolve({
              documentUrl: url,
              contextUrl: null,
              document: h.documents.get(url),
            });
          }),
      });
      await h.instance.onMoved(
        h.ctx,
        move.clone({ actor: embedded ? new Person({ id: oldId }) : oldId }),
        t.signal,
      );
      assert.deepStrictEqual(origins, ["alpha", "beta"]);
      assert.strictEqual(h.sent.length, 4);
      assert.ok(!await h.repository.getFollowee("beta", oldId));
    });
  }
}

test("local target without the origin alias is ignored", async (t) => {
  const h = await harness(t.signal);
  await h.instance.onMoved(
    h.ctx,
    move.clone({ target: h.ctx.getActorUri("beta") }),
    t.signal,
  );
  assert.deepStrictEqual(h.sent, []);
  assert.deepStrictEqual(h.loads, []);
  assert.ok(await h.repository.getFollowee("alpha", oldId));
  assert.ok(await h.repository.getFollowee("beta", oldId));
});
