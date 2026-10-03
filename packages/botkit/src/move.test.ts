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
import {
  type Context,
  type InboxContext,
  MemoryKvStore,
  type SendActivityOptions,
} from "@fedify/fedify/federation";
import type { DocumentLoader } from "@fedify/vocab-runtime";
import {
  Accept,
  type Activity,
  Announce,
  Article,
  Create,
  Follow,
  isActor,
  Move,
  Note,
  Person,
  PUBLIC_COLLECTION,
  QuoteRequest,
  Reject,
  Update,
} from "@fedify/vocab";
import assert from "node:assert/strict";
import { test } from "node:test";
import { BotImpl, MigrationGatedRepository } from "./bot-impl.ts";
import { FollowRequestImpl } from "./follow-impl.ts";
import { hideRepositoryMethods } from "./helpers.ts";
import { createInstance } from "./instance.ts";
import { MemoryCachedRepository, MemoryRepository } from "./repository.ts";
import { SessionImpl } from "./session-impl.ts";
import { mention, text } from "./text.ts";
import { createMessage } from "./message-impl.ts";

function mockLoader(
  loader: DocumentLoader,
): Context<void>["getDocumentLoader"] {
  function get(
    identity: { identifier: string } | { username: string },
  ): Promise<DocumentLoader>;
  function get(identity: { keyId: URL; privateKey: CryptoKey }): DocumentLoader;
  function get(
    identity: { identifier: string } | { username: string } | {
      keyId: URL;
      privateKey: CryptoKey;
    },
  ): Promise<DocumentLoader> | DocumentLoader {
    return "keyId" in identity ? loader : Promise.resolve(loader);
  }
  return get;
}

function fixture(repository = new MemoryRepository()) {
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "old",
  });
  const context = bot.federation.createContext(
    new URL("https://old.example"),
    undefined,
  );
  const session = new SessionImpl(bot, context);
  const sent: {
    readonly activity: Activity;
    readonly options?: SendActivityOptions;
  }[] = [];
  context.sendActivity = (_sender, _recipients, activity, options) => {
    sent.push({ activity, options });
    return Promise.resolve();
  };
  const target = new Person({
    id: new URL("https://new.example/actor"),
    inbox: new URL("https://new.example/inbox"),
    aliases: [session.actorId],
  });
  const fetched: string[] = [];
  const loader: DocumentLoader = async (url, options) => {
    options?.signal?.throwIfAborted();
    fetched.push(url);
    return {
      documentUrl: url,
      contextUrl: null,
      document: await target.toJsonLd({ format: "compact" }),
    };
  };
  context.getDocumentLoader = mockLoader(loader);
  return { repository, bot, context, session, target, sent, fetched };
}

async function seedFollower(
  repository: MemoryRepository,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  await repository.addFollower(
    "bot",
    new URL("https://follower.example/follow/1"),
    new Person({
      id: new URL("https://follower.example/actor"),
      inbox: new URL("https://follower.example/inbox"),
    }),
  );
}

test("move persists successor and sends Update then push-mode Move", async (t) => {
  const { repository, session, context, target, sent, fetched } = fixture();
  await seedFollower(repository, t.signal);
  const previous = await session.publish(text`Keep this post.`);
  sent.length = 0;
  await session.move(target, { signal: t.signal });
  assert.deepStrictEqual(fetched, [target.id!.href]);
  assert.deepStrictEqual(await repository.getSuccessor("bot"), target.id);
  assert.deepStrictEqual((await session.getActor()).successorId, target.id);
  assert.strictEqual(sent.length, 2);
  assert.ok(sent[0].activity instanceof Update);
  const updatedActor = await sent[0].activity.getObject(context);
  assert.ok(isActor(updatedActor));
  assert.deepStrictEqual(updatedActor.successorId, target.id);
  const move = sent[1].activity;
  assert.ok(move instanceof Move);
  assert.ok(move.id);
  assert.notStrictEqual(move.id.href, sent[0].activity.id?.href);
  assert.deepStrictEqual(move.actorId, session.actorId);
  assert.deepStrictEqual(move.objectId, session.actorId);
  assert.deepStrictEqual(move.targetId, target.id);
  assert.deepStrictEqual(move.toIds, [PUBLIC_COLLECTION]);
  assert.deepStrictEqual(move.ccIds, [context.getFollowersUri("bot")]);
  for (const entry of sent) {
    assert.deepStrictEqual(entry.options?.excludeBaseUris, []);
    assert.strictEqual(entry.options?.orderingKey, session.actorId.href);
  }
  await assert.rejects(session.move(target), TypeError);
  await assert.rejects(session.publish(text`Inactive.`), TypeError);
  await assert.rejects(
    session.publish(text`Inactive.`, { class: Article }),
    TypeError,
  );
  await assert.rejects(previous.reply(text`Inactive reply.`), TypeError);
  await assert.rejects(previous.share(), TypeError);
  assert.strictEqual(await repository.countMessages("bot"), 1);
  assert.strictEqual(await repository.countFollowers("bot"), 1);
  assert.strictEqual(sent.length, 2);
  const fresh = fixture(repository);
  assert.deepStrictEqual(
    (await fresh.session.getActor()).successorId,
    target.id,
  );
  await assert.rejects(fresh.session.publish(text`Still inactive.`), TypeError);
});

test("move validates authoritative aliases, not the passed actor", async () => {
  const { session, context, target, repository, sent } = fixture();
  const actual = new Person({ id: target.id, inbox: target.inboxId });
  context.getDocumentLoader = mockLoader(async (url) => ({
    documentUrl: url,
    contextUrl: null,
    document: await actual.toJsonLd({ format: "compact" }),
  }));
  await assert.rejects(session.move(target), TypeError);
  assert.strictEqual(await repository.getSuccessor("bot"), undefined);
  assert.strictEqual(sent.length, 0);
});

test("move rejects invalid targets without changing state", async (t) => {
  for (
    const kind of [
      "self",
      "idless",
      "no-inbox",
      "moved",
      "mismatched-id",
      "cross-origin",
      "non-actor",
      "scheme",
    ] as const
  ) {
    await t.test(kind, async () => {
      const { session, context, target, repository } = fixture();
      let object = target;
      if (kind === "no-inbox") {
        object = new Person({ id: target.id, aliases: [session.actorId] });
      }
      if (kind === "moved") {
        object = target.clone({
          successor: new URL("https://next.example/actor"),
        });
      }
      if (kind === "mismatched-id") {
        object = target.clone({ id: new URL("https://new.example/other") });
      }
      context.getDocumentLoader = mockLoader(async (url) => ({
        documentUrl: kind === "cross-origin"
          ? "https://evil.example/actor"
          : url,
        contextUrl: null,
        document:
          await (kind === "non-actor" ? new Note({ id: target.id }) : object)
            .toJsonLd({ format: "compact" }),
      }));
      const input = kind === "self"
        ? session.actorId
        : kind === "idless"
        ? new Person({})
        : kind === "scheme"
        ? new URL("javascript:alert(1)")
        : target;
      await assert.rejects(session.move(input), TypeError);
      assert.strictEqual(await repository.getSuccessor("bot"), undefined);
    });
  }
});

test("move resolves handles and URI strings, preserving fetch failures", async (t) => {
  for (const form of ["uri", "handle"] as const) {
    await t.test(form, async () => {
      const { session, context, target, fetched } = fixture();
      context.lookupObject = () => Promise.resolve(target);
      await session.move(form === "uri" ? target.id!.href : "@new@new.example");
      assert.deepStrictEqual(fetched, [target.id!.href]);
    });
  }
  const { session, context, target, repository } = fixture();
  const failure = new TypeError("Network unavailable.");
  context.getDocumentLoader = mockLoader(() => Promise.reject(failure));
  await assert.rejects(session.move(target.id!), (error) => error === failure);
  assert.strictEqual(await repository.getSuccessor("bot"), undefined);
});

test("concurrent move calls choose one successor and one notification pair", async (t) => {
  const f = fixture();
  await seedFollower(f.repository, t.signal);
  const second = new SessionImpl(f.bot, f.context);
  const results = await Promise.allSettled([
    f.session.move(f.target),
    second.move(f.target),
  ]);
  assert.strictEqual(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.strictEqual(f.sent.length, 2);
});

test("move without followers still persists inactive state", async () => {
  const { session, target, sent } = fixture();
  await session.move(target);
  assert.deepStrictEqual((await session.getActor()).successorId, target.id);
  assert.strictEqual(sent.length, 0);
});

test("move attempts both notifications on failure and republishMove recovers", async (t) => {
  for (const failing of [Update, Move]) {
    await t.test(failing.name, async () => {
      const f = fixture();
      await seedFollower(f.repository, t.signal);
      f.context.sendActivity = (_sender, _recipients, activity) => {
        f.sent.push({ activity });
        return activity instanceof failing
          ? Promise.reject(new TypeError("Delivery failed."))
          : Promise.resolve();
      };
      await assert.rejects(f.session.move(f.target), AggregateError);
      assert.strictEqual(f.sent.length, 2);
      assert.deepStrictEqual(
        (await f.session.getActor()).successorId,
        f.target.id,
      );
      f.context.sendActivity = (_sender, _recipients, activity) => {
        f.sent.push({ activity });
        return Promise.resolve();
      };
      await f.session.republishMove();
      assert.strictEqual(f.sent.length, 4);
      assert.notStrictEqual(
        f.sent[1].activity.id?.href,
        f.sent[3].activity.id?.href,
      );
    });
  }
  const f = fixture();
  await assert.rejects(f.session.republishMove(), TypeError);
});

test("move honours pre-commit abort but completes after committing", async (t) => {
  const f = fixture();
  await assert.rejects(
    f.session.move(f.target, { signal: AbortSignal.abort() }),
    { name: "AbortError" },
  );
  assert.strictEqual(await f.repository.getSuccessor("bot"), undefined);
  const controller = new AbortController();
  const set = f.repository.setSuccessor.bind(f.repository);
  f.repository.setSuccessor = async (id, target, signal) => {
    const result = await set(id, target, signal);
    controller.abort();
    return result;
  };
  await seedFollower(f.repository, t.signal);
  await f.session.move(f.target, { signal: controller.signal });
  assert.strictEqual(f.sent.length, 2);
  await assert.rejects(
    f.session.republishMove({ signal: AbortSignal.abort() }),
    { name: "AbortError" },
  );
  const resend = new AbortController();
  f.context.sendActivity = (_sender, _recipients, activity) => {
    f.sent.push({ activity });
    resend.abort();
    return Promise.resolve();
  };
  await f.session.republishMove({ signal: resend.signal });
  assert.strictEqual(f.sent.length, 4);
});

test("local target URLs, Actors and handles need no self HTTP", async (t) => {
  for (const form of ["url", "actor", "handle"] as const) {
    await t.test(form, async () => {
      const instance = createInstance<void>({
        kv: new MemoryKvStore(),
        repository: new MemoryRepository(),
      });
      const old = instance.createBot("old", { username: "old" });
      const session = old.getSession("https://local.example");
      const target = instance.createBot("target", {
        username: "new",
        aliases: [session.actorId],
      });
      const targetSession = target.getSession("https://local.example");
      session.context.lookupObject = () =>
        Promise.reject(new TypeError("Self HTTP is forbidden."));
      session.context.getDocumentLoader = mockLoader(() =>
        Promise.reject(new TypeError("Self HTTP is forbidden."))
      );
      await session.move(
        form === "url"
          ? targetSession.actorId
          : form === "actor"
          ? await targetSession.getActor()
          : "@new@local.example",
      );
      assert.deepStrictEqual(
        (await session.getActor()).successorId,
        targetSession.actorId,
      );
    });
  }
});

test("moved bots reject follows under every policy, without onFollow", async (t) => {
  for (const policy of ["accept", "manual", "reject"] as const) {
    await t.test(policy, async () => {
      const repository = new MemoryRepository();
      const bot = new BotImpl<void>({
        kv: new MemoryKvStore(),
        repository,
        username: "old",
        followerPolicy: policy,
      });
      const context: InboxContext<void> = Object.assign(
        bot.federation.createContext(new URL("https://old.example"), undefined),
        {
          recipient: "bot",
          forwardActivity: () => Promise.resolve(),
          clone: (_data: void): InboxContext<void> => context,
        },
      );
      const sent: Activity[] = [];
      context.sendActivity = (_sender, _recipients, activity) => {
        sent.push(activity);
        return Promise.resolve();
      };
      bot.onFollow = () => assert.fail("Moved onFollow must not fire.");
      const follower = new Person({
        id: new URL("https://follower.example/actor"),
        inbox: new URL("https://follower.example/inbox"),
      });
      const follow = new Follow({
        id: new URL("https://follower.example/follow/1"),
        actor: follower,
        object: context.getActorUri("bot"),
      });
      const request = new FollowRequestImpl(
        new SessionImpl(bot, context),
        follow,
        follower,
      );
      await repository.setSuccessor(
        "bot",
        new URL("https://new.example/actor"),
      );
      await assert.rejects(request.accept(), TypeError);
      assert.strictEqual(request.state, "pending");
      await bot.onFollowed(context, follow);
      assert.strictEqual(sent.length, 1);
      assert.ok(sent[0] instanceof Reject);
      assert.strictEqual(await repository.countFollowers("bot"), 0);
      await request.reject();
    });
  }
});

test("custom repositories fail before missing successor methods are obscured", () => {
  for (const method of ["getSuccessor", "setSuccessor"]) {
    const repository = hideRepositoryMethods(new MemoryRepository(), [method]);
    assert.throws(
      () => createInstance({ kv: new MemoryKvStore(), repository }),
      TypeError,
    );
    assert.throws(
      () => new MigrationGatedRepository(repository, "bot"),
      TypeError,
    );
    assert.throws(() => new MemoryCachedRepository(repository), TypeError);
  }
});

test("publishing cannot cross a move while rendering content", async () => {
  const f = fixture();
  const original = text`Slow content.`;
  const content = {
    ...original,
    type: "block" as const,
    async *getHtml() {
      await f.session.move(f.target);
      yield "Slow content.";
    },
    getTags: original.getTags.bind(original),
    getCachedObjects: original.getCachedObjects.bind(original),
  };
  await assert.rejects(f.session.publish(content), TypeError);
  assert.strictEqual(await f.repository.countMessages("bot"), 0);
});

test("migration notifications keep their snapshot when followers change", async (t) => {
  const f = fixture();
  await seedFollower(f.repository, t.signal);
  const audiences: string[][] = [];
  f.context.sendActivity = async (_sender, recipients, activity) => {
    assert.ok(Array.isArray(recipients));
    audiences.push(recipients.map((actor) => actor.id!.href));
    if (activity instanceof Update) {
      await f.repository.removeFollower(
        "bot",
        new URL("https://follower.example/follow/1"),
        new URL("https://follower.example/actor"),
      );
    }
  };
  await f.session.move(f.target);
  assert.deepStrictEqual(audiences, [["https://follower.example/actor"], [
    "https://follower.example/actor",
  ]]);
});

test("republishMove revalidates aliases, allows moved successors and aborts preparation", async (t) => {
  const f = fixture();
  await seedFollower(f.repository, t.signal);
  await f.session.move(f.target);
  f.sent.length = 0;
  const movedTarget = f.target.clone({
    successor: new URL("https://next.example/actor"),
  });
  f.context.getDocumentLoader = mockLoader(async (url) => ({
    documentUrl: url,
    contextUrl: null,
    document: await movedTarget.toJsonLd({ format: "compact" }),
  }));
  await f.session.republishMove();
  assert.strictEqual(f.sent.length, 2);
  f.sent.length = 0;
  const controller = new AbortController();
  const getFollowers = f.repository.getFollowers.bind(f.repository);
  f.repository.getFollowers = (identifier, options) => {
    controller.abort();
    return getFollowers(identifier, options);
  };
  await assert.rejects(f.session.republishMove({ signal: controller.signal }), {
    name: "AbortError",
  });
  assert.strictEqual(f.sent.length, 0);
  const unlinked = new Person({ id: f.target.id, inbox: f.target.inboxId });
  f.context.getDocumentLoader = mockLoader(async (url) => ({
    documentUrl: url,
    contextUrl: null,
    document: await unlinked.toJsonLd({ format: "compact" }),
  }));
  await assert.rejects(f.session.republishMove(), TypeError);
  assert.strictEqual(f.sent.length, 0);
});

test("move storage errors leave their actual commit state inspectable", async (t) => {
  const f = fixture();
  await seedFollower(f.repository, t.signal);
  const set = f.repository.setSuccessor.bind(f.repository);
  const failure = new TypeError("Storage response lost.");
  f.repository.setSuccessor = async (identifier, target, signal) => {
    await set(identifier, target, signal);
    throw failure;
  };
  await assert.rejects(f.session.move(f.target), (error) => error === failure);
  assert.deepStrictEqual((await f.session.getActor()).successorId, f.target.id);
  assert.strictEqual(f.sent.length, 0);
  await f.session.republishMove();
  assert.strictEqual(f.sent.length, 2);
});

test("dynamic targets resolve without HTTP and remain separate from the source", async () => {
  const repository = new MemoryRepository();
  const instance = createInstance<void>({
    kv: new MemoryKvStore(),
    repository,
  });
  const old = instance.createBot("old", { username: "old" });
  const session = old.getSession("https://local.example");
  instance.createBot((_context, identifier) =>
    identifier === "new"
      ? { username: "new", aliases: [session.actorId] }
      : null
  );
  session.context.getDocumentLoader = mockLoader(() =>
    Promise.reject(new TypeError("Self fetch is forbidden."))
  );
  const targetId = session.context.getActorUri("new");
  await session.move(targetId);
  assert.deepStrictEqual((await session.getActor()).successorId, targetId);
  assert.strictEqual(await repository.getSuccessor("new"), undefined);
});

test("move waits for sharing storage and both submissions across sessions", async (t) => {
  for (const pause of ["storage", "followers", "author"] as const) {
    await t.test(pause, async () => {
      const f = fixture();
      const message = await f.session.publish(text`Original.`);
      await seedFollower(f.repository, t.signal);
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const fetched = Promise.withResolvers<void>();
      const getLoader = f.context.getDocumentLoader;
      const loader = await getLoader(f.bot);
      f.context.getDocumentLoader = mockLoader(async (url, options) => {
        const result = await loader(url, options);
        fetched.resolve();
        return result;
      });
      const add = f.repository.addMessage.bind(f.repository);
      f.repository.addMessage = async (identifier, id, activity) => {
        if (pause === "storage" && activity instanceof Announce) {
          started.resolve();
          await release.promise;
        }
        return await add(identifier, id, activity);
      };
      let submissions = 0;
      f.context.sendActivity = async (_sender, _recipients, activity) => {
        if (!(activity instanceof Announce)) return;
        submissions++;
        if (
          (pause === "followers" && submissions === 1) ||
          (pause === "author" && submissions === 2)
        ) {
          started.resolve();
          await release.promise;
        }
        assert.strictEqual(await f.repository.getSuccessor("bot"), undefined);
      };
      const sharing = message.share();
      await started.promise;
      const moving = new SessionImpl(f.bot, f.context).move(f.target);
      await fetched.promise;
      // Let the authoritative actor parse finish while the share is suspended.
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      try {
        assert.strictEqual(await f.repository.getSuccessor("bot"), undefined);
      } finally {
        release.resolve();
        await Promise.allSettled([sharing, moving]);
      }
      await sharing;
      await moving;
      assert.strictEqual(submissions, 2);
      assert.deepStrictEqual(
        await f.repository.getSuccessor("bot"),
        f.target.id,
      );
      await assert.rejects(message.share(), TypeError);
      assert.strictEqual(await f.repository.countMessages("bot"), 2);
    });
  }
});

test("failed sharing releases the move serialization boundary", async () => {
  const f = fixture();
  const message = await f.session.publish(text`Original.`);
  f.context.sendActivity = async (_sender, _recipients, activity) => {
    await Promise.resolve();
    if (activity instanceof Announce) throw new TypeError("Submission failed.");
  };
  await assert.rejects(message.share(), TypeError);
  await f.session.move(f.target);
  assert.deepStrictEqual(await f.repository.getSuccessor("bot"), f.target.id);
});

test("move waits for publishing storage and every activity submission", async (t) => {
  for (const pause of [0, 1, 2, 3, 4, 5]) {
    await t.test(pause === 0 ? "storage" : `submission ${pause}`, async () => {
      const f = fixture();
      const remote = new Person({
        id: new URL("https://remote.example/actor"),
        inbox: new URL("https://remote.example/inbox"),
      });
      const original = await createMessage(
        new Note({
          id: new URL("https://remote.example/note/1"),
          attribution: remote.id,
          content: "Original.",
          to: PUBLIC_COLLECTION,
        }),
        f.session,
        { [remote.id!.href]: remote },
      );
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const fetched = Promise.withResolvers<void>();
      const loader = await f.context.getDocumentLoader(f.bot);
      f.context.getDocumentLoader = mockLoader(async (url, options) => {
        const result = await loader(url, options);
        fetched.resolve();
        return result;
      });
      const add = f.repository.addMessage.bind(f.repository);
      f.repository.addMessage = async (identifier, id, activity) => {
        if (pause === 0) {
          started.resolve();
          await release.promise;
        }
        return await add(identifier, id, activity);
      };
      let submissions = 0;
      f.context.sendActivity = async (_sender, _recipients, activity) => {
        if (!(activity instanceof Create || activity instanceof QuoteRequest)) {
          return;
        }
        submissions++;
        if (pause === submissions) {
          started.resolve();
          await release.promise;
        }
        assert.strictEqual(await f.repository.getSuccessor("bot"), undefined);
      };
      const publishing = f.session.publish(
        text`Hello ${mention("remote", remote)}.`,
        {
          replyTarget: original,
          quoteTarget: original,
        },
      );
      await started.promise;
      const moving = new SessionImpl(f.bot, f.context).move(f.target);
      await fetched.promise;
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      try {
        assert.strictEqual(await f.repository.getSuccessor("bot"), undefined);
      } finally {
        release.resolve();
        await Promise.allSettled([publishing, moving]);
      }
      await publishing;
      await moving;
      assert.strictEqual(submissions, 5);
      assert.strictEqual(await f.repository.countMessages("bot"), 1);
    });
  }
});

test("move snapshots followers after pending acceptance finishes", async (t) => {
  for (const pause of ["delivery", "storage"] as const) {
    await t.test(pause, async () => {
      const f = fixture();
      const follower = new Person({
        id: new URL("https://follower.example/actor"),
        inbox: new URL("https://follower.example/inbox"),
      });
      const request = new FollowRequestImpl(
        f.session,
        new Follow({
          id: new URL("https://follower.example/follow/1"),
          actor: follower,
          object: f.session.actorId,
        }),
        follower,
      );
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const fetched = Promise.withResolvers<void>();
      const loader = await f.context.getDocumentLoader(f.bot);
      f.context.getDocumentLoader = mockLoader(async (url, options) => {
        const result = await loader(url, options);
        fetched.resolve();
        return result;
      });
      const audiences: string[][] = [];
      f.context.sendActivity = async (_sender, recipients, activity) => {
        if (activity instanceof Accept && pause === "delivery") {
          started.resolve();
          await release.promise;
        }
        if (activity instanceof Update || activity instanceof Move) {
          assert.ok(Array.isArray(recipients));
          audiences.push(recipients.map((actor) => actor.id!.href));
        }
      };
      const add = f.repository.addFollower.bind(f.repository);
      f.repository.addFollower = async (identifier, id, actor) => {
        if (pause === "storage") {
          started.resolve();
          await release.promise;
        }
        return await add(identifier, id, actor);
      };
      const accepting = request.accept();
      await started.promise;
      const moving = new SessionImpl(f.bot, f.context).move(f.target);
      await fetched.promise;
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      try {
        assert.strictEqual(await f.repository.getSuccessor("bot"), undefined);
      } finally {
        release.resolve();
        await Promise.allSettled([accepting, moving]);
      }
      await accepting;
      await moving;
      assert.strictEqual(request.state, "accepted");
      assert.deepStrictEqual(audiences, [[follower.id!.href], [
        follower.id!.href,
      ]]);
    });
  }
});

test("queued follow acceptance rechecks moved state inside the lock", async () => {
  const f = fixture();
  const follower = new Person({
    id: new URL("https://follower.example/actor"),
    inbox: new URL("https://follower.example/inbox"),
  });
  const request = new FollowRequestImpl(
    f.session,
    new Follow({
      id: new URL("https://follower.example/follow/1"),
      actor: follower,
      object: f.session.actorId,
    }),
    follower,
  );
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const set = f.repository.setSuccessor.bind(f.repository);
  f.repository.setSuccessor = async (identifier, successor, signal) => {
    started.resolve();
    await release.promise;
    return await set(identifier, successor, signal);
  };
  const moving = f.session.move(f.target);
  await started.promise;
  const accepting = request.accept();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  release.resolve();
  const results = await Promise.allSettled([moving, accepting]);
  assert.strictEqual(results[0].status, "fulfilled");
  assert.strictEqual(results[1].status, "rejected");
  if (results[1].status === "rejected") {
    assert.ok(results[1].reason instanceof TypeError);
  }
  assert.strictEqual(request.state, "pending");
  assert.strictEqual(await f.repository.countFollowers("bot"), 0);
  assert.ok(!f.sent.some(({ activity }) => activity instanceof Accept));
});

test("concurrent acceptance checks pending state after preceding acceptance", async () => {
  const f = fixture();
  const follower = new Person({
    id: new URL("https://follower.example/actor"),
    inbox: new URL("https://follower.example/inbox"),
  });
  const request = new FollowRequestImpl(
    f.session,
    new Follow({
      id: new URL("https://follower.example/follow/1"),
      actor: follower,
      object: f.session.actorId,
    }),
    follower,
  );
  const results = await Promise.allSettled([
    request.accept(),
    request.accept(),
  ]);
  assert.strictEqual(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.strictEqual(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.strictEqual(request.state, "accepted");
  assert.strictEqual(
    f.sent.filter(({ activity }) => activity instanceof Accept).length,
    1,
  );
  assert.strictEqual(await f.repository.countFollowers("bot"), 1);
});
