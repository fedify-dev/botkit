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
import { Application, Service } from "@fedify/vocab";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createBot } from "./bot.ts";
import { createInstance } from "./instance.ts";

const aliases: readonly URL[] = Object.freeze([
  new URL("https://old.example/users/mybot"),
  new URL("https://other.example/actors/mybot"),
]);

for (const actorClass of [Service, Application]) {
  test(`createBot() publishes aliases for ${actorClass.name}`, async () => {
    const bot = createBot<void>({
      kv: new MemoryKvStore(),
      username: "mybot",
      class: actorClass,
      aliases,
    });
    assert.deepStrictEqual(bot.aliases, aliases);
    const session = bot.getSession("https://example.com");
    assert.deepStrictEqual(session.bot.aliases, aliases);
    const actor = await session.getActor();
    assert.deepStrictEqual(actor.aliasIds, aliases);
    const response = await bot.fetch(
      new Request(
        "https://example.com/ap/actor/bot",
        { headers: { Accept: "application/activity+json" } },
      ),
    );
    assert.strictEqual(response.status, 200);
    const json = await response.json();
    assert.deepStrictEqual(json.alsoKnownAs, aliases.map((uri) => uri.href));
  });
}

for (const configured of [undefined, []] as const) {
  test(`createBot() defaults aliases to [] (${configured == null ? "omitted" : "explicit"})`, async () => {
    const bot = createBot<void>({
      kv: new MemoryKvStore(),
      username: "mybot",
      aliases: configured,
    });
    assert.deepStrictEqual(bot.aliases, []);
    assert.deepStrictEqual(
      bot.getSession("https://example.com").bot.aliases,
      [],
    );
    const response = await bot.fetch(
      new Request(
        "https://example.com/ap/actor/bot",
        { headers: { Accept: "application/activity+json" } },
      ),
    );
    assert.strictEqual(response.status, 200);
    const json = await response.json();
    assert.ok(!("alsoKnownAs" in json));
  });
}

test("static instance bots keep aliases per bot", async () => {
  const instance = createInstance<void>({ kv: new MemoryKvStore() });
  const first = instance.createBot("first", { username: "first", aliases });
  const second = instance.createBot("second", { username: "second" });
  const empty = instance.createBot("empty", { username: "empty", aliases: [] });
  assert.deepStrictEqual(first.aliases, aliases);
  assert.deepStrictEqual(second.aliases, []);
  assert.deepStrictEqual(empty.aliases, []);
  for (const bot of [first, second, empty]) {
    const session = bot.getSession("https://example.com");
    assert.deepStrictEqual(session.bot.aliases, bot.aliases);
    assert.deepStrictEqual((await session.getActor()).aliasIds, bot.aliases);
    const response = await instance.fetch(
      new Request(
        `https://example.com/ap/actor/${bot.identifier}`,
        { headers: { Accept: "application/activity+json" } },
      ),
    );
    assert.strictEqual(response.status, 200);
    const json = await response.json();
    if (bot === first) {
      assert.deepStrictEqual(json.alsoKnownAs, aliases.map((uri) => uri.href));
    } else {
      assert.ok(!("alsoKnownAs" in json));
    }
  }
});

test("dynamic group bots publish and refresh per-bot aliases", async () => {
  const instance = createInstance<void>({ kv: new MemoryKvStore() });
  let currentAliases = aliases;
  const group = instance.createBot((_ctx, identifier) => {
    if (identifier === "first") {
      return { username: identifier, aliases: currentAliases };
    }
    if (identifier === "second") return { username: identifier };
    if (identifier === "empty") return { username: identifier, aliases: [] };
    return null;
  });
  for (const identifier of ["first", "second", "empty"]) {
    const session = await group.getSession("https://example.com", identifier);
    const expected = identifier === "first" ? aliases : [];
    assert.deepStrictEqual(session.bot.aliases, expected);
    assert.deepStrictEqual((await session.getActor()).aliasIds, expected);
    const response = await instance.fetch(
      new Request(
        `https://example.com/ap/actor/${identifier}`,
        { headers: { Accept: "application/activity+json" } },
      ),
    );
    assert.strictEqual(response.status, 200);
    const json = await response.json();
    if (identifier === "first") {
      assert.deepStrictEqual(json.alsoKnownAs, aliases.map((uri) => uri.href));
    } else {
      assert.ok(!("alsoKnownAs" in json));
    }
  }
  currentAliases = [new URL("https://new.example/users/mybot")];
  const response = await instance.fetch(
    new Request(
      "https://example.com/ap/actor/first",
      { headers: { Accept: "application/activity+json" } },
    ),
  );
  assert.strictEqual(response.status, 200);
  // Fedify compacts a single alias to a string.
  assert.deepStrictEqual(
    (await response.json()).alsoKnownAs,
    currentAliases[0].href,
  );
  const session = await group.getSession("https://example.com", "first");
  assert.deepStrictEqual(session.bot.aliases, currentAliases);
  assert.deepStrictEqual((await session.getActor()).aliasIds, currentAliases);
});
