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
/** @jsx react-jsx */
/** @jsxImportSource @hono/hono/jsx */
import {
  type Announce,
  type Create,
  Image,
  Link,
  type Object,
  PUBLIC_COLLECTION,
} from "@fedify/fedify/vocab";
import { Hono } from "@hono/hono";
import type { BotImpl } from "./bot-impl.ts";
import { Layout } from "./components/Layout.tsx";
import { Message } from "./components/Message.tsx";
import { getMessageClass, isMessageObject } from "./message-impl.ts";
import type { MessageClass } from "./message.ts";
import type { Uuid } from "./repository.ts";
import staticFiles from "./static/mod.ts";

export interface Bindings {
  readonly bot: BotImpl<unknown>;
  readonly contextData: unknown;
}

export interface Env {
  readonly Bindings: Bindings;
}

export const app = new Hono<Env>();

app.get("/css/:filename", async (c) => {
  const file = await staticFiles.get(c.req.param("filename"));
  if (file == null) return c.notFound();
  const bytes = await file.bytes();
  return c.body(bytes, 200, { "Content-Type": "text/css" });
});

const WINDOW = 15;

app.get("/", async (c) => {
  const { bot } = c.env;
  const ctx = bot.federation.createContext(c.req.raw, c.env.contextData);
  const session = bot.getSession(ctx);
  const url = new URL(c.req.url);
  const handle = `@${bot.username}@${url.host}`;
  const icon = bot.icon instanceof Image
    ? bot.icon.url instanceof Link ? bot.icon.url.href : bot.icon.url
    : bot.icon;
  const iconWidth = bot.icon instanceof Image ? bot.icon.width : null;
  const iconHeight = bot.icon instanceof Image ? bot.icon.height : null;
  const image = bot.image instanceof Image
    ? bot.image.url instanceof Link ? bot.image.url.href : bot.image.url
    : bot.image;
  const imageWidth = bot.image instanceof Image ? bot.image.width : null;
  const imageHeight = bot.image instanceof Image ? bot.image.height : null;
  const followersCount = await bot.repository.countFollowers();
  const summaryChunks = bot.summary?.getHtml(session);
  const postsCount = await bot.repository.countMessages();
  const summary = summaryChunks == null
    ? null
    : (await Array.fromAsync(summaryChunks)).join("");
  const properties: Record<string, string> = {};
  for (const name in bot.properties) {
    const value = bot.properties[name];
    const valueHtml = (await Array.fromAsync(value.getHtml(session))).join("");
    properties[name] = valueHtml;
  }
  const offset = c.req.query("offset");
  let posts = await Array.fromAsync(
    bot.repository.getMessages({
      order: "newest",
      until: offset ? Temporal.Instant.from(offset) : undefined,
      limit: WINDOW * 2,
    }),
  );
  let lastPost: Announce | Create | undefined = posts[posts.length - 1];
  posts = posts.filter(isPublic);
  while (lastPost != null && posts.length < WINDOW + 1) {
    const limit = (WINDOW - posts.length) * 2;
    const nextPosts = bot.repository.getMessages({
      order: "newest",
      until: lastPost.published ?? (await lastPost.getObject(ctx))?.published ??
        undefined,
      limit,
    });
    lastPost = undefined;
    for await (const post of nextPosts) {
      if (isPublic(post) && posts.length < WINDOW + 1) posts.push(post);
      lastPost = post;
    }
  }
  const nextPost: Object | null = await posts[WINDOW]?.getObject(ctx);
  posts = posts.slice(0, WINDOW);
  const messages = (await Promise.all(posts.map((p) => p.getObject(ctx))))
    .filter(isMessageObject);
  return c.html(
    <Layout
      bot={bot}
      host={url.host}
      activityLink={ctx.getActorUri(bot.identifier)}
    >
      <header class="container">
        {image && (
          <img
            src={image.href}
            width={imageWidth ?? undefined}
            height={imageHeight ?? undefined}
            alt={image instanceof Image
              ? image.name?.toString() ?? undefined
              : undefined}
            style="width: 100%; margin-bottom: 1em;"
          />
        )}
        <hgroup>
          {icon && (
            <img
              src={icon.href}
              width={iconWidth ?? undefined}
              height={iconHeight ?? undefined}
              style="float: left; margin-right: 1em; height: 72;"
            />
          )}
          <h1>
            <a href="/">{bot.name ?? bot.username}</a>
          </h1>
          <p>
            <span style="user-select: all;">{handle}</span> &middot;{" "}
            <span>
              {followersCount === 1
                ? `1 follower`
                : `${followersCount.toLocaleString("en")} followers`}
            </span>{" "}
            &middot;{" "}
            <span>
              {postsCount === 1
                ? `1 post`
                : `${postsCount.toLocaleString("en")} posts`}
            </span>
          </p>
        </hgroup>
        {summary &&
          (
            <div
              dangerouslySetInnerHTML={{ __html: summary }}
            />
          )}
        {globalThis.Object.keys(properties).length > 0 && (
          <table>
            <tbody>
              {globalThis.Object.entries(properties).map(([name, value]) => (
                <tr>
                  <th scope="row" style="width: 1%; white-space: nowrap;">
                    <strong>{name}</strong>
                  </th>
                  <td
                    dangerouslySetInnerHTML={{ __html: value }}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </header>
      <main class="container">
        {messages.map((message) => <Message message={message} context={ctx} />)}
      </main>
      <footer class="container">
        <nav style="display: block; text-align: end;">
          {nextPost?.published && (
            <a
              href={`/?offset=${
                encodeURIComponent(nextPost.published.toString())
              }`}
            >
              Older posts
            </a>
          )}
        </nav>
      </footer>
    </Layout>,
    {
      headers: {
        Link: `<${
          ctx.getActorUri(bot.identifier).href
        }>; rel="alternate"; type="application/activity+json"`,
      },
    },
  );
});

app.get("/message/:id", async (c) => {
  const id = c.req.param("id");
  const { bot } = c.env;
  const url = new URL(c.req.url);
  const ctx = bot.federation.createContext(c.req.raw, c.env.contextData);
  const post = await bot.repository.getMessage(id as Uuid);
  if (post == null || !isPublic(post)) return c.notFound();
  const message = await post.getObject(ctx);
  if (message == null || !isMessageObject(message)) return c.notFound();
  const activityLink = ctx.getObjectUri<MessageClass>(
    getMessageClass(message),
    { id },
  );
  return c.html(
    <Layout bot={bot} host={url.host} activityLink={activityLink}>
      <main class="container">
        <Message message={message} context={ctx} />
      </main>
    </Layout>,
    {
      headers: {
        Link:
          `<${activityLink.href}>; rel="alternate"; type="application/activity+json"`,
      },
    },
  );
});

function isPublic(post: Create | Announce): boolean {
  return post.toIds.some((url) => url.href === PUBLIC_COLLECTION.href) ||
    post.ccIds.some((url) => url.href === PUBLIC_COLLECTION.href);
}
