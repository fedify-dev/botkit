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
import { BotImpl } from "./bot-impl.ts";
import { InstanceImpl } from "./instance-impl.ts";
import { MemoryRepository, type Uuid } from "./repository.ts";

const messageId: Uuid = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";

async function seedMessage(
  repository: MemoryRepository,
  identifier: string,
): Promise<void> {
  await repository.addMessage(
    identifier,
    messageId,
    new Create({
      id: new URL(
        `https://example.com/ap/actor/${identifier}/create/${messageId}`,
      ),
      actor: new URL(`https://example.com/ap/actor/${identifier}`),
      to: PUBLIC_COLLECTION,
      object: new Note({
        id: new URL(
          `https://example.com/ap/actor/${identifier}/note/${messageId}`,
        ),
        attribution: new URL(`https://example.com/ap/actor/${identifier}`),
        to: PUBLIC_COLLECTION,
        content: "Hello, world!",
        published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
      }),
      published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
    }),
  );
}

describe("single-bot web pages", () => {
  test("serve the bot at the web root", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "mybot",
      name: "My Bot",
    });
    await seedMessage(repository, "bot");
    const profile = await bot.fetch(
      new Request("https://example.com/"),
      undefined,
    );
    assert.deepStrictEqual(profile.status, 200);
    const html = await profile.text();
    assert.ok(html.includes("@mybot@example.com"));
    assert.ok(html.includes('action="/follow"'));

    const message = await bot.fetch(
      new Request(`https://example.com/message/${messageId}`),
      undefined,
    );
    assert.deepStrictEqual(message.status, 200);

    const feed = await bot.fetch(
      new Request("https://example.com/feed.xml"),
      undefined,
    );
    assert.deepStrictEqual(feed.status, 200);
    assert.ok(
      feed.headers.get("Content-Type")?.startsWith("application/atom+xml"),
    );
  });

  test("use root-relative web URLs", () => {
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      username: "mybot",
    });
    assert.deepStrictEqual(
      bot.instance.getBotWebUrl(bot, "https://example.com").href,
      "https://example.com/",
    );
    assert.deepStrictEqual(
      bot.instance.getMessageWebUrl(bot, messageId, "https://example.com")
        .href,
      `https://example.com/message/${messageId}`,
    );
  });
});

describe("multi-bot web pages", () => {
  function createInstanceWithBots(): {
    instance: InstanceImpl<void>;
    repository: MemoryRepository;
  } {
    const repository = new MemoryRepository();
    const instance = new InstanceImpl<void>({
      kv: new MemoryKvStore(),
      repository,
    });
    instance.createBot("alpha", { username: "alphabot", name: "Alpha" });
    instance.createBot("beta", { username: "betabot", name: "Beta" });
    return { instance, repository };
  }

  test("list the hosted bots at the web root", async () => {
    const { instance } = createInstanceWithBots();
    const response = await instance.fetch(
      new Request("https://example.com/"),
      undefined,
    );
    assert.deepStrictEqual(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("@alphabot@example.com"));
    assert.ok(html.includes("@betabot@example.com"));
    assert.ok(html.includes('href="/@alphabot"'));
  });

  test("serve per-bot profiles under /@{username}", async () => {
    const { instance } = createInstanceWithBots();
    const response = await instance.fetch(
      new Request("https://example.com/@alphabot"),
      undefined,
    );
    assert.deepStrictEqual(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("@alphabot@example.com"));
    assert.ok(html.includes('action="/@alphabot/follow"'));
    assert.ok(!html.includes("@betabot@example.com"));

    const unknown = await instance.fetch(
      new Request("https://example.com/@nobody"),
      undefined,
    );
    assert.deepStrictEqual(unknown.status, 404);
  });

  test("serve per-bot message permalinks and feeds", async () => {
    const { instance, repository } = createInstanceWithBots();
    await seedMessage(repository, "alpha");

    const message = await instance.fetch(
      new Request(`https://example.com/@alphabot/${messageId}`),
      undefined,
    );
    assert.deepStrictEqual(message.status, 200);

    // Another bot's path must not serve the message:
    const cross = await instance.fetch(
      new Request(`https://example.com/@betabot/${messageId}`),
      undefined,
    );
    assert.deepStrictEqual(cross.status, 404);

    const feed = await instance.fetch(
      new Request("https://example.com/@alphabot/feed.xml"),
      undefined,
    );
    assert.deepStrictEqual(feed.status, 200);
    assert.ok(
      feed.headers.get("Content-Type")?.startsWith("application/atom+xml"),
    );
    const followers = await instance.fetch(
      new Request("https://example.com/@alphabot/followers"),
      undefined,
    );
    assert.deepStrictEqual(followers.status, 200);
  });

  test("use username-based web URLs", () => {
    const { instance } = createInstanceWithBots();
    const alpha = instance.getBot("alpha")!;
    assert.deepStrictEqual(
      instance.getBotWebUrl(alpha, "https://example.com").href,
      "https://example.com/@alphabot",
    );
    assert.deepStrictEqual(
      instance.getMessageWebUrl(alpha, messageId, "https://example.com").href,
      `https://example.com/@alphabot/${messageId}`,
    );
  });

  test("advertise the web URL on the actor", async () => {
    const { instance } = createInstanceWithBots();
    const response = await instance.fetch(
      new Request("https://example.com/ap/actor/alpha", {
        headers: { Accept: "application/activity+json" },
      }),
      undefined,
    );
    assert.deepStrictEqual(response.status, 200);
    const actor = await response.json();
    assert.deepStrictEqual(actor.url, "https://example.com/@alphabot");
  });
});

describe("usernames requiring percent-encoding", () => {
  test("keep web paths and routes consistent", async () => {
    const instance = new InstanceImpl<void>({
      kv: new MemoryKvStore(),
      repository: new MemoryRepository(),
    });
    instance.createBot("alpha", { username: "weird+bot" });
    instance.createBot("beta", { username: "betabot" });
    const alpha = instance.getBot("alpha")!;
    const url = instance.getBotWebUrl(alpha, "https://example.com");
    assert.deepStrictEqual(url.href, "https://example.com/@weird%2Bbot");
    const response = await instance.fetch(new Request(url), undefined);
    assert.deepStrictEqual(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("weird+bot"));
  });
});

describe("custom CSS", () => {
  const css = "main > p { color: red; }";

  test("is not HTML-escaped on single-bot pages", async () => {
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      username: "mybot",
      pages: { css },
    });
    const response = await bot.fetch(
      new Request("https://example.com/"),
      undefined,
    );
    const html = await response.text();
    assert.ok(html.includes(css));
  });

  test("is not HTML-escaped on the instance index", async () => {
    const instance = new InstanceImpl<void>({
      kv: new MemoryKvStore(),
      repository: new MemoryRepository(),
      pages: { css },
    });
    instance.createBot("alpha", { username: "alphabot" });
    const response = await instance.fetch(
      new Request("https://example.com/"),
      undefined,
    );
    const html = await response.text();
    assert.ok(html.includes(css));
  });
});

describe("web assets", () => {
  async function profileHtml(
    pages?: { color?: "azure"; theme?: "dark" },
  ): Promise<string> {
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      username: "mybot",
      pages,
    });
    const response = await bot.fetch(
      new Request("https://example.com/"),
      undefined,
    );
    return await response.text();
  }

  test("link the bundled stylesheet instead of a CDN", async () => {
    const html = await profileHtml();
    assert.ok(!html.includes("cdn.jsdelivr"));
    assert.ok(!html.includes("picocss"));
    assert.match(
      html,
      /<link rel="stylesheet" href="\/\.botkit\/[^"]+\/botkit\.css"/,
    );
  });

  test("reflect the theme name and default to green/auto", async () => {
    const def = await profileHtml();
    assert.ok(def.includes('data-botkit-color="green"'));
    assert.ok(!def.includes("data-theme="));

    const themed = await profileHtml({ color: "azure", theme: "dark" });
    assert.ok(themed.includes('data-botkit-color="azure"'));
    assert.ok(themed.includes('data-theme="dark"'));
  });

  test("serve the stylesheet and fonts with immutable caching", async () => {
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      username: "mybot",
    });
    const html = await (await bot.fetch(
      new Request("https://example.com/"),
      undefined,
    )).text();
    const match = html.match(/href="(\/\.botkit\/[^"]+)\/botkit\.css"/);
    assert.ok(match != null);
    const base = match[1];

    const cssResponse = await bot.fetch(
      new Request(`https://example.com${base}/botkit.css`),
      undefined,
    );
    assert.deepStrictEqual(cssResponse.status, 200);
    assert.ok(
      cssResponse.headers.get("Content-Type")?.startsWith("text/css"),
    );
    assert.ok(
      cssResponse.headers.get("Cache-Control")?.includes("immutable"),
    );
    const cssText = await cssResponse.text();
    assert.ok(cssText.includes("--botkit-accent"));
    // Minification must keep the descendant space before a pseudo-class, so
    // that `.bk-prose :is(...)` stays a descendant selector rather than being
    // collapsed into the compound `.bk-prose:is(...)`.
    assert.ok(cssText.includes(".bk-prose :is("));
    assert.ok(!cssText.includes(".bk-prose:is("));

    const fontResponse = await bot.fetch(
      new Request(`https://example.com${base}/fonts/inter.woff2`),
      undefined,
    );
    assert.deepStrictEqual(fontResponse.status, 200);
    assert.deepStrictEqual(
      fontResponse.headers.get("Content-Type"),
      "font/woff2",
    );

    // A stale or mistyped fingerprint must not be served the current bytes
    // under an immutable cache; it is rejected instead.
    const stale = await bot.fetch(
      new Request("https://example.com/.botkit/deadbeef/botkit.css"),
      undefined,
    );
    assert.deepStrictEqual(stale.status, 404);

    const missing = await bot.fetch(
      new Request(`https://example.com${base}/fonts/nope.woff2`),
      undefined,
    );
    assert.deepStrictEqual(missing.status, 404);
  });
});

describe("message rendering", () => {
  test("sanitizes post content against XSS", async () => {
    const repository = new MemoryRepository();
    const bot = new BotImpl<void>({
      kv: new MemoryKvStore(),
      repository,
      username: "mybot",
    });
    const id: Uuid = "01941f29-7c00-7fe8-ab0a-7b593990a3c1";
    await repository.addMessage(
      "bot",
      id,
      new Create({
        id: new URL(`https://example.com/ap/actor/bot/create/${id}`),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(`https://example.com/ap/actor/bot/note/${id}`),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: PUBLIC_COLLECTION,
          content: `<p>hello</p><script>alert('xss')</script>` +
            `<a href="javascript:alert(1)">tap</a>`,
          published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
      }),
    );
    const html = await (await bot.fetch(
      new Request("https://example.com/"),
      undefined,
    )).text();
    // The safe markup survives, but the script and the javascript: URL do not.
    assert.ok(html.includes("<p>hello</p>"));
    assert.ok(!html.includes("<script>alert"));
    assert.ok(!html.includes("javascript:alert"));
  });
});

test("moved profiles show their successor and reject direct follow forms", async () => {
  const repository = new MemoryRepository();
  const instance = new InstanceImpl<void>({
    kv: new MemoryKvStore(),
    repository,
  });
  instance.createBot("old", { username: "old" });
  instance.createBot("active", { username: "active" });
  const successor = new URL("https://new.example/actor?name=Alice&from=old");
  await seedMessage(repository, "old");
  await repository.setSuccessor("old", successor);
  const profile = await instance.fetch(
    new Request("https://example.com/@old"),
    undefined,
  );
  const html = await profile.text();
  assert.ok(html.includes("This bot has moved"));
  assert.ok(html.includes("https://new.example/actor?name=Alice&amp;from=old"));
  assert.ok(!html.includes('action="/@old/follow"'));
  assert.ok(html.includes("Hello, world!"));
  const active = await instance.fetch(
    new Request("https://example.com/@active"),
    undefined,
  );
  assert.ok((await active.text()).includes('action="/@active/follow"'));
  const follow = await instance.fetch(
    new Request("https://example.com/@old/follow", { method: "POST" }),
    undefined,
  );
  assert.strictEqual(follow.status, 409);
  assert.ok((await follow.text()).includes("This bot has moved"));
});

test("single-bot moved profile escapes unsafe successor schemes", async () => {
  const repository = new MemoryRepository();
  const bot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    repository,
    username: "old",
  });
  await repository.setSuccessor("bot", new URL("javascript:alert(1)"));
  const profile = await bot.fetch(
    new Request("https://example.com/"),
    undefined,
  );
  const html = await profile.text();
  assert.ok(html.includes("This bot has moved"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('action="/follow"'));
});

test("moved notices link local successors to their public profile", async () => {
  const repository = new MemoryRepository();
  const instance = new InstanceImpl<void>({
    kv: new MemoryKvStore(),
    repository,
  });
  instance.createBot("old", { username: "old" });
  instance.createBot("target-id", { username: "new-name" });
  const target = new URL("https://example.com/ap/actor/target-id");
  await repository.setSuccessor("old", target);
  for (
    const request of [
      new Request("https://example.com/@old"),
      new Request("https://example.com/@old/follow", { method: "POST" }),
    ]
  ) {
    const response = await instance.fetch(request, undefined);
    const html = await response.text();
    const link =
      /(?:This bot has moved to|Its new actor is)\s*<a href="([^"]+)"/.exec(
        html,
      );
    assert.ok(link);
    assert.strictEqual(link[1], "https://example.com/@new-name");
    const destination = await instance.fetch(
      new Request(link[1], { headers: { Accept: "text/html" } }),
      undefined,
    );
    assert.strictEqual(destination.status, 200);
    assert.ok((await destination.text()).includes("@new-name"));
  }
});

test("moved pages survive a failing dynamic successor dispatcher", async () => {
  const repository = new MemoryRepository();
  const instance = new InstanceImpl<void>({
    kv: new MemoryKvStore(),
    repository,
  });
  instance.createBot("old", { username: "old" });
  instance.createBot(async () => {
    await Promise.resolve();
    throw new TypeError("The target profile is unavailable.");
  });
  const successor = new URL("https://example.com/ap/actor/target");
  await repository.setSuccessor("old", successor);
  for (
    const [path, method, status] of [
      ["/@old", "GET", 200],
      ["/@old/follow", "POST", 409],
    ] as const
  ) {
    const response = await instance.fetch(
      new Request(`https://example.com${path}`, { method }),
      undefined,
    );
    assert.strictEqual(response.status, status);
    const html = await response.text();
    assert.ok(html.includes("This bot has moved"));
    assert.ok(html.includes(`href="${successor.href}"`));
  }
});
