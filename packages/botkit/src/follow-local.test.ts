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
import { Follow, Move, Person } from "@fedify/vocab";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { test } from "node:test";
import { createInstance, type Instance } from "./instance.ts";
import { MemoryRepository } from "./repository.ts";

async function respond(
  request: IncomingMessage,
  response: ServerResponse,
  instance: Instance<void>,
  origin: URL,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value != null) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("Expected request bytes.");
    }
    chunks.push(chunk);
  }
  const body = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  const result = await instance.fetch(
    new Request(new URL(request.url ?? "/", origin), {
      method: request.method,
      headers,
      body: body.length > 0 ? body : undefined,
      signal,
    }),
  );
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(new Uint8Array(await result.arrayBuffer()));
}

async function createTestServer(signal?: AbortSignal) {
  const repository = new MemoryRepository();
  const instance = createInstance<void>({
    kv: new MemoryKvStore(),
    repository,
    federationOptions: { allowPrivateAddress: true },
  });
  let origin = new URL("http://127.0.0.1");
  const errors: unknown[] = [];
  const server = createServer((request, response) => {
    void respond(request, response, instance, origin, signal).catch(
      (error: unknown) => {
        errors.push(error);
        response.writeHead(500);
        response.end();
      },
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address != null && typeof address !== "string");
  origin = new URL(`http://127.0.0.1:${address.port}`);
  return {
    instance,
    repository,
    origin,
    errors,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => error == null ? resolve() : reject(error));
        server.closeAllConnections();
      }),
  };
}

test("signed Move migrates a follow to a sibling bot through real HTTP inboxes", async (t) => {
  const remote = await createTestServer(t.signal);
  const local = await createTestServer(t.signal);
  try {
    const oldBot = remote.instance.createBot("old", { username: "old" });
    const oldSession = oldBot.getSession(remote.origin);
    const oldActor = await oldSession.getActor();
    const target = local.instance.createBot("target", {
      username: "target",
      aliases: [oldSession.actorId],
    });
    const follower = local.instance.createBot("follower", {
      username: "follower",
    });
    const followerSession = follower.getSession(local.origin);
    const followerActor = await followerSession.getActor();
    const followId = followerSession.context.getObjectUri(Follow, {
      identifier: follower.identifier,
      id: "018f6db5-27d2-7000-8000-000000000003",
    });
    await local.repository.addFollowee(
      follower.identifier,
      oldSession.actorId,
      new Follow({
        id: followId,
        actor: followerSession.actorId,
        object: oldSession.actorId,
      }),
    );
    await remote.repository.addFollower(
      oldBot.identifier,
      followId,
      followerActor,
    );
    const moved: string[] = [];
    follower.onFolloweeMove = (session, oldActor, newActor) => {
      assert.deepStrictEqual(oldActor.id, oldSession.actorId);
      assert.deepStrictEqual(
        newActor.id,
        target.getSession(local.origin).actorId,
      );
      moved.push(session.bot.identifier);
    };
    await oldSession.context.sendActivity(
      { identifier: oldBot.identifier },
      followerActor,
      new Move({
        id: new URL("#move", oldSession.actorId),
        actor: new Person({ id: oldActor.id }),
        object: oldSession.actorId,
        target: target.getSession(local.origin).actorId,
        to: followerSession.actorId,
      }),
    );
    const targetId = target.getSession(local.origin).actorId;
    assert.ok(
      await local.repository.getFollowee(follower.identifier, targetId),
    );
    assert.ok(
      await local.repository.hasFollower(
        target.identifier,
        followerSession.actorId,
      ),
    );
    assert.ok(
      !await local.repository.getFollowee(
        follower.identifier,
        oldSession.actorId,
      ),
    );
    assert.ok(
      !await remote.repository.hasFollower(
        oldBot.identifier,
        followerSession.actorId,
      ),
    );
    assert.deepStrictEqual(moved, ["follower"]);
    assert.deepStrictEqual(local.errors, []);
    assert.deepStrictEqual(remote.errors, []);

    // Undo to a sibling must also reach its actual inbox.
    await followerSession.unfollow(
      await target.getSession(local.origin).getActor(),
    );
    assert.ok(
      !await local.repository.hasFollower(
        target.identifier,
        followerSession.actorId,
      ),
    );
  } finally {
    await Promise.all([remote.close(), local.close()]);
  }
});

test("a sibling's rejection reaches the sender through real HTTP inboxes", async (t) => {
  const local = await createTestServer(t.signal);
  try {
    const target = local.instance.createBot("target", {
      username: "target",
      followerPolicy: "reject",
    });
    const follower = local.instance.createBot("follower", {
      username: "follower",
    });
    let rejected = 0;
    follower.onRejectFollow = () => {
      rejected++;
    };
    await follower.getSession(local.origin).follow(
      await target.getSession(local.origin).getActor(),
    );
    assert.strictEqual(rejected, 1);
    assert.ok(
      !await local.repository.hasFollower(
        target.identifier,
        follower.getSession(local.origin).actorId,
      ),
    );
    assert.ok(
      !await local.repository.getFollowee(
        follower.identifier,
        target.getSession(local.origin).actorId,
      ),
    );
    assert.deepStrictEqual(local.errors, []);
  } finally {
    await local.close();
  }
});

test("Session.move migrates local and remote followers through real HTTP", async (t) => {
  const local = await createTestServer(t.signal);
  const remote = await createTestServer(t.signal);
  try {
    const old = local.instance.createBot("old", { username: "old" });
    const session = old.getSession(local.origin);
    const target = local.instance.createBot("target", {
      username: "target",
      aliases: [session.actorId],
    });
    const targetId = target.getSession(local.origin).actorId;
    const localFollower = local.instance.createBot("local", {
      username: "local",
    });
    const remoteFollower = remote.instance.createBot("remote", {
      username: "remote",
    });
    const oldActor = await session.getActor();
    const migrations: string[] = [];
    for (
      const [follower, server] of [[localFollower, local], [
        remoteFollower,
        remote,
      ]] as const
    ) {
      follower.onFolloweeMove = (_session, origin, destination) => {
        assert.deepStrictEqual(origin.id, session.actorId);
        assert.deepStrictEqual(destination.id, targetId);
        migrations.push(follower.identifier);
      };
      await follower.getSession(server.origin).follow(oldActor);
      assert.ok(
        await server.repository.getFollowee(
          follower.identifier,
          session.actorId,
        ),
      );
    }
    assert.strictEqual(await local.repository.countFollowers("old"), 2);
    await session.move(targetId, { signal: t.signal });
    for (
      const [follower, server] of [[localFollower, local], [
        remoteFollower,
        remote,
      ]] as const
    ) {
      assert.ok(
        await server.repository.getFollowee(follower.identifier, targetId),
      );
      assert.strictEqual(
        await server.repository.getFollowee(
          follower.identifier,
          session.actorId,
        ),
        undefined,
      );
      assert.ok(
        await local.repository.hasFollower(
          "target",
          follower.getSession(server.origin).actorId,
        ),
      );
    }
    assert.deepStrictEqual(migrations.sort(), ["local", "remote"]);
    assert.deepStrictEqual((await session.getActor()).successorId, targetId);
    assert.strictEqual(await local.repository.countFollowers("old"), 0);
    assert.deepStrictEqual(local.errors, []);
    assert.deepStrictEqual(remote.errors, []);
  } finally {
    await local.close();
    await remote.close();
  }
});
