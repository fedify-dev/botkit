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
/** @jsxImportSource hono/jsx */
import "./temporal.ts";
import type { Context } from "@fedify/fedify/federation";
import {
  type Announce,
  type Create,
  getActorHandle,
  Hashtag,
  Image,
  Link,
  type Object,
  PUBLIC_COLLECTION,
} from "@fedify/vocab";
import { Hono } from "hono";
import { STYLESHEET_PATH } from "./assets.ts";
import { decode } from "html-entities";
import { parseTemplate } from "url-template";
import type { Context as HonoContext } from "hono";
import type { BotImpl } from "./bot-impl.ts";
import { FollowButton } from "./components/FollowButton.tsx";
import { Follower } from "./components/Follower.tsx";
import {
  BotKitCredit,
  CopyIcon,
  FeedIcon,
  Layout,
} from "./components/Layout.tsx";
import { Message } from "./components/Message.tsx";
import type { InstanceImpl } from "./instance-impl.ts";
import { getMessageClass, isMessageObject, textXss } from "./message-impl.ts";
import type { MessageClass } from "./message.ts";
import type { Uuid } from "./repository.ts";

export interface Bindings {
  readonly bot: BotImpl<unknown>;
  readonly contextData: unknown;
}

export interface Env {
  readonly Bindings: Bindings;
}

export interface InstanceBindings {
  readonly instance: InstanceImpl<unknown>;
  readonly contextData: unknown;
}

export interface InstanceEnv {
  readonly Bindings: InstanceBindings;
}

// deno-lint-ignore no-explicit-any
type PageContext = HonoContext<any>;

interface PageHeadingProps {
  readonly title: string;
  readonly count?: string;
  readonly back?: string;
}

/** A secondary-page heading with an optional back link and count caption. */
function PageHeading({ title, count, back }: PageHeadingProps) {
  return (
    <header class="bk-page-head">
      {back && <a class="bk-back" href={back} aria-label="Back">&larr;</a>}
      <div>
        <h1 class="bk-page-title">{title}</h1>
        {count && <div class="bk-page-count">{count}</div>}
      </div>
    </header>
  );
}

export const app = new Hono<Env>();

app.get("/", (c) => profilePage(c, c.env.bot, c.env.contextData, ""));

async function profilePage(
  c: PageContext,
  bot: BotImpl<unknown>,
  contextData: unknown,
  base: string,
): Promise<Response> {
  const home = base === "" ? "/" : base;
  const ctx = bot.federation.createContext(c.req.raw, contextData);
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
  const { posts: messages, nextPost } = await getPosts(
    bot,
    ctx,
    offset ? { offset: Temporal.Instant.from(offset) } : {},
  );
  const activityLink = ctx.getActorUri(bot.identifier);
  const feedLink = new URL(`${base}/feed.xml`, url);
  let nextLink: URL | undefined;
  if (nextPost?.published != null) {
    nextLink = new URL(home, url);
    nextLink.searchParams.set("offset", nextPost.published.toString());
  }
  return c.html(
    <Layout
      bot={bot}
      host={url.host}
      activityLink={activityLink}
      feedLink={feedLink}
    >
      <main>
        <header class="bk-profile">
          <div class="bk-banner">
            {image && (
              <img
                src={image.href}
                width={imageWidth ?? undefined}
                height={imageHeight ?? undefined}
                alt={bot.image instanceof Image
                  ? bot.image.name?.toString() ?? undefined
                  : undefined}
              />
            )}
          </div>
          <div class="bk-profile__body">
            {icon
              ? (
                <img
                  class="bk-avatar"
                  src={icon.href}
                  width={iconWidth ?? undefined}
                  height={iconHeight ?? undefined}
                  alt={bot.name ?? bot.username}
                />
              )
              : (
                <span
                  class="bk-avatar bk-avatar--placeholder"
                  aria-hidden="true"
                >
                  {[...(bot.name ?? bot.username)][0]?.toUpperCase() ?? ""}
                </span>
              )}
            <h1 class="bk-name">
              <a href={home}>{bot.name ?? bot.username}</a>
            </h1>
            <span class="bk-handle">
              <span class="bk-handle__text">{handle}</span>
              <button
                type="button"
                class="bk-copy"
                data-copy={handle}
                onclick="botkitCopy(this)"
                aria-label="Copy handle"
                title="Copy handle"
              >
                <CopyIcon />
              </button>
            </span>
            {summary &&
              (
                <div
                  class="bk-bio bk-prose"
                  dangerouslySetInnerHTML={{ __html: summary }}
                />
              )}
            {globalThis.Object.keys(properties).length > 0 && (
              <dl class="bk-fields">
                {globalThis.Object.entries(properties).flatMap((
                  [name, value],
                ) => [
                  <dt key={`${name}-term`}>{name}</dt>,
                  <dd
                    key={`${name}-desc`}
                    class="bk-prose"
                    dangerouslySetInnerHTML={{ __html: value }}
                  />,
                ])}
              </dl>
            )}
            <div class="bk-meta">
              <div class="bk-counts">
                <a href={`${base}/followers`}>
                  <b>{followersCount.toLocaleString("en")}</b>{" "}
                  {followersCount === 1 ? "follower" : "followers"}
                </a>
                <span>
                  <b>{postsCount.toLocaleString("en")}</b>{" "}
                  {postsCount === 1 ? "post" : "posts"}
                </span>
                <a
                  class="bk-feed-link"
                  href={`${base}/feed.xml`}
                  rel="alternate"
                  type="application/atom+xml"
                  title="Atom feed"
                  aria-label="Atom feed"
                >
                  <FeedIcon size={17} />
                </a>
              </div>
              <span class="bk-meta__spacer" />
              <FollowButton bot={bot} action={`${base}/follow`} />
            </div>
          </div>
        </header>
        {messages.length > 0
          ? (
            <div class="bk-feed">
              {messages.map((message, index) => (
                <Message
                  key={message.id?.href ?? index}
                  message={message}
                  session={session}
                />
              ))}
            </div>
          )
          : (
            <div class="bk-feed">
              <div class="bk-empty">No posts yet.</div>
            </div>
          )}
        {nextLink && (
          <nav class="bk-pagination">
            <a rel="next" href={nextLink.href}>Older posts &rarr;</a>
          </nav>
        )}
      </main>
      <script
        dangerouslySetInnerHTML={{
          __html:
            `globalThis.botkitCopy=function(b){var t=b.getAttribute('data-copy');function ok(){b.classList.add('is-copied');setTimeout(function(){b.classList.remove('is-copied')},1200)}function fallback(){var a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();try{if(document.execCommand('copy'))ok()}catch(e){}document.body.removeChild(a)}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,fallback)}else{fallback()}}`,
        }}
      />
    </Layout>,
    {
      headers: {
        Link:
          `<${activityLink.href}>; rel="alternate"; type="application/activity+json", ` +
          `<${feedLink.href}>; rel="alternate"; type="application/atom+xml"` +
          (nextLink
            ? `, <${nextLink.href}>; rel="next"; type="text/html"`
            : ""),
      },
    },
  );
}

app.get(
  "/followers",
  (c) => followersPage(c, c.env.bot, c.env.contextData, ""),
);

async function followersPage(
  c: PageContext,
  bot: BotImpl<unknown>,
  contextData: unknown,
  base: string,
): Promise<Response> {
  const home = base === "" ? "/" : base;
  const ctx = bot.federation.createContext(c.req.raw, contextData);
  const session = bot.getSession(ctx);
  const followersCount = await bot.repository.countFollowers();
  const followers = await Array.fromAsync(bot.repository.getFollowers());

  const url = new URL(c.req.url);
  const activityLink = ctx.getActorUri(bot.identifier);
  const feedLink = new URL(`${base}/feed.xml`, url);

  return c.html(
    <Layout
      bot={bot}
      host={url.host}
      activityLink={activityLink}
      feedLink={feedLink}
    >
      <main>
        <PageHeading
          back={home}
          title={followersCount === 1
            ? "1 follower"
            : `${followersCount.toLocaleString("en")} followers`}
        />
        {followers.length > 0
          ? (
            <div class="bk-roster">
              {followers.map((follower, index) => (
                <Follower
                  key={follower.id?.href ?? index}
                  actor={follower}
                  session={session}
                />
              ))}
            </div>
          )
          : <div class="bk-empty">No followers yet.</div>}
      </main>
    </Layout>,
  );
}

app.get(
  "/tags/:hashtag",
  (c) => hashtagPage(c, c.env.bot, c.env.contextData, ""),
);

async function hashtagPage(
  c: PageContext,
  bot: BotImpl<unknown>,
  contextData: unknown,
  base: string,
): Promise<Response> {
  const hashtag = c.req.param("hashtag");
  if (hashtag == null) return c.notFound();
  const home = base === "" ? "/" : base;
  const url = new URL(c.req.url);
  const ctx = bot.federation.createContext(c.req.raw, contextData);
  const session = bot.getSession(ctx);
  const offset = c.req.query("offset");
  const { posts, nextPost } = await getPosts(bot, ctx, {
    hashtag,
    offset: offset == null ? undefined : Temporal.Instant.from(offset),
  });
  let nextLink: URL | undefined;
  if (nextPost?.published != null) {
    nextLink = new URL(`${base}/tags/${encodeURIComponent(hashtag)}`, url);
    nextLink.searchParams.set("offset", nextPost.published.toString());
  }
  return c.html(
    <Layout bot={bot} host={url.host} title={`#${hashtag}`}>
      <main>
        <PageHeading back={home} title={`#${hashtag}`} />
        {posts.length > 0
          ? (
            <div class="bk-feed">
              {posts.map((message, index) => (
                <Message
                  key={message.id?.href ?? index}
                  message={message}
                  session={session}
                />
              ))}
            </div>
          )
          : <div class="bk-empty">No posts tagged #{hashtag}.</div>}
        {nextLink && (
          <nav class="bk-pagination">
            <a rel="next" href={nextLink.href}>Older posts &rarr;</a>
          </nav>
        )}
      </main>
    </Layout>,
    {
      headers: nextLink == null ? {} : {
        Link: `<${nextLink.href}>; rel="next"; type="text/html"`,
      },
    },
  );
}

app.get(
  "/message/:id",
  (c) => messagePage(c, c.env.bot, c.env.contextData, ""),
);

async function messagePage(
  c: PageContext,
  bot: BotImpl<unknown>,
  contextData: unknown,
  base: string,
): Promise<Response> {
  const id = c.req.param("id");
  if (id == null) return c.notFound();
  const home = base === "" ? "/" : base;
  const url = new URL(c.req.url);
  const ctx = bot.federation.createContext(c.req.raw, contextData);
  const session = bot.getSession(ctx);
  const post = await bot.repository.getMessage(id as Uuid);
  if (post == null || !isPublic(post)) return c.notFound();
  const message = await post.getObject(ctx);
  if (message == null || !isMessageObject(message)) return c.notFound();
  const activityLink = ctx.getObjectUri<MessageClass>(
    getMessageClass(message),
    { identifier: bot.identifier, id },
  );
  const feedLink = new URL(`${base}/feed.xml`, url);
  let title = message.name;
  if (title == null) {
    title = message.summary ?? message.content;
    if (title != null) {
      title = decode(textXss.process(title.toString()));
    }
  }
  return c.html(
    <Layout
      bot={bot}
      host={url.host}
      activityLink={activityLink}
      feedLink={feedLink}
      title={title?.toString() ?? undefined}
    >
      <main>
        <PageHeading back={home} title={bot.name ?? bot.username} />
        <div class="bk-feed">
          <Message key={message.id?.href} message={message} session={session} />
        </div>
      </main>
    </Layout>,
    {
      headers: {
        Link:
          `<${activityLink.href}>; rel="alternate"; type="application/activity+json", ` +
          `<${feedLink.href}>; rel="alternate"; type="application/atom+xml"`,
      },
    },
  );
}

app.get("/feed.xml", (c) => feedPage(c, c.env.bot, c.env.contextData, ""));

async function feedPage(
  c: PageContext,
  bot: BotImpl<unknown>,
  contextData: unknown,
  base: string,
): Promise<Response> {
  const home = base === "" ? "/" : base;
  const url = new URL(c.req.url);
  const ctx = bot.federation.createContext(c.req.raw, contextData);
  const session = bot.getSession(ctx);
  const { posts } = await getPosts(bot, ctx, { window: 30 });
  const botName = bot.name ?? bot.username;
  const canonicalUrl = new URL(`${base}/feed.xml`, url);
  const profileUrl = new URL(home, url);
  const actorUrl = ctx.getActorUri(bot.identifier);
  c.header(
    "Link",
    `<${actorUrl.href}>; rel="alternate"; type="application/activity+json", ` +
      `<${profileUrl.href}>; rel="alternate"; type="text/html"`,
  );
  const response = await c.render(
    <feed xmlns="http://www.w3.org/2005/Atom">
      <id>{canonicalUrl.href}</id>
      <link rel="self" type="application/atom+xml" href={canonicalUrl.href} />
      <link rel="alternate" type="text/html" href={profileUrl.href} />
      <link
        rel="alternate"
        type="application/activity+json"
        href={actorUrl.href}
      />
      <title>{botName} (@{bot.username}@{url.host})</title>
      <author>
        <name>{botName}</name>
        <uri>{profileUrl.href}</uri>
      </author>
      {posts.length > 0 && (
        <updated>
          {(posts[0].updated ?? posts[0].published)?.toString()}
        </updated>
      )}
      {posts.map(async (post) => {
        const activityUrl = post.id;
        if (activityUrl == null) return undefined;
        const permalink =
          (post.url instanceof Link ? post.url.href : post.url) ?? activityUrl;
        const author = post.attributionId?.href === session.actorId?.href
          ? await session.getActor()
          : await post.getAttribution({
            documentLoader: ctx.documentLoader,
            contextLoader: ctx.contextLoader,
            suppressError: true,
          });
        const authorName = author?.name ?? author?.preferredUsername ??
          (author == null ? undefined : await getActorHandle(author));
        const authorUrl =
          (author?.url instanceof Link ? author.url.href : author?.url) ??
            author?.id;
        const updated = post.updated ?? post.published;
        let title = post.name;
        if (title == null) {
          title = post.summary ?? post.content;
          if (title != null) {
            title = decode(textXss.process(title.toString()));
          }
        }
        return (
          <entry>
            <id>{permalink.href}</id>
            <link rel="alternate" type="text/html" href={permalink.href} />
            <link
              rel="alternate"
              type="application/activity+json"
              href={activityUrl.href}
            />
            {authorName &&
              (
                <author>
                  <name>{authorName}</name>
                  {authorUrl &&
                    <uri>{authorUrl.href}</uri>}
                </author>
              )}
            {post.published && (
              <published>{post.published.toString()}</published>
            )}
            {updated && <updated>{updated.toString()}</updated>}
            {title && <title>{title}</title>}
            {post.summary && (
              <summary type="html">{post.summary.toString()}</summary>
            )}
            {post.content && (
              <content type="html">{post.content.toString()}</content>
            )}
          </entry>
        );
      })}
    </feed>,
  );
  response.headers.set("Content-Type", "application/atom+xml; charset=utf-8");
  return response;
}

app.post("/follow", (c) => followPage(c, c.env.bot, c.env.contextData, ""));

async function followPage(
  c: PageContext,
  bot: BotImpl<unknown>,
  contextData: unknown,
  base: string,
): Promise<Response> {
  const home = base === "" ? "/" : base;
  const ctx = bot.federation.createContext(c.req.raw, contextData);
  const url = new URL(c.req.url);

  const formData = await c.req.formData();
  let followerHandle = formData.get("handle")?.toString();

  try {
    if (!followerHandle) {
      return c.html(
        <Layout bot={bot} host={url.host} title="Error">
          <main class="container">
            <h1>Error</h1>
            <p>Follower handle is required.</p>
            <p>
              <a href={home}>Go back</a>
            </p>
          </main>
        </Layout>,
        400,
      );
    }

    if (followerHandle.startsWith("@")) {
      followerHandle = followerHandle.slice(1);
    }

    const webfingerData = await ctx
      .lookupWebFinger(`acct:${followerHandle}`);

    if (!webfingerData?.links) {
      return c.html(
        <Layout bot={bot} host={url.host} title="Error">
          <main class="container">
            <h1>Error</h1>
            <p>
              No links found in webfinger data for{" "}
              <code>@{followerHandle}</code>.
            </p>
            <p>
              <a href={home}>Go back</a>
            </p>
          </main>
        </Layout>,
        400,
      );
    }

    const subscribeLink = webfingerData.links.find(
      (link) => link.rel === "http://ostatus.org/schema/1.0/subscribe",
    );

    if (subscribeLink?.template) {
      const botActorUri = ctx.getActorUri(bot.identifier);
      const followUrlTemplate = parseTemplate(subscribeLink.template);
      const followUrl = followUrlTemplate.expand({
        uri: botActorUri.href,
      });
      return c.redirect(followUrl);
    }

    return c.html(
      <Layout bot={bot} host={url.host} title="Error">
        <main class="container">
          <h1>Error</h1>
          <p>
            No follow link found in WebFinger data for{" "}
            <code>@{followerHandle}</code>.
          </p>
          <p>
            <a href={home}>Go back</a>
          </p>
        </main>
      </Layout>,
      400,
    );
  } catch (_error) {
    return c.html(
      <Layout bot={bot} host={url.host} title="Error">
        <main class="container">
          <h1>Internal Server Error</h1>
          <p>
            An internal server error occurred while processing your request.
          </p>
          <p>
            <a href={home}>Go back</a>
          </p>
        </main>
      </Layout>,
      500,
    );
  }
}

export const multiApp = new Hono<InstanceEnv>();

multiApp.get("/", (c) => {
  const { instance } = c.env;
  const url = new URL(c.req.url);
  const bots = [...instance.bots];
  return c.html(
    <html
      lang="en"
      data-botkit-color={instance.pages.color}
      data-theme={instance.pages.theme === "auto"
        ? undefined
        : instance.pages.theme}
    >
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="generator" content="BotKit" />
        <title>{url.host}</title>
        <link rel="stylesheet" href={STYLESHEET_PATH} />
        <style dangerouslySetInnerHTML={{ __html: instance.pages.css }} />
      </head>
      <body class="bk-page">
        <div class="bk-container">
          <main>
            <PageHeading
              title={url.host}
              count={bots.length === 1 ? "1 bot" : `${bots.length} bots`}
            />
            {bots.length > 0
              ? (
                <div class="bk-roster">
                  {bots.map((bot) => (
                    <a
                      key={bot.identifier}
                      class="bk-actor"
                      href={`/@${encodeURIComponent(bot.username)}`}
                    >
                      <span class="bk-actor__ph" aria-hidden="true">
                        {[...(bot.name || bot.username)][0]?.toUpperCase() ??
                          ""}
                      </span>
                      <span class="bk-actor__info">
                        <span class="bk-actor__name">
                          {bot.name ?? bot.username}
                        </span>
                        <span class="bk-actor__handle">
                          @{bot.username}@{url.host}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              )
              : <div class="bk-empty">No bots hosted here yet.</div>}
          </main>
          <BotKitCredit />
        </div>
      </body>
    </html>,
  );
});

/**
 * Resolves the bot a multi-bot page belongs to, and delegates to the given
 * page handler with the bot's base path.
 */
function withBot(
  page: (
    c: PageContext,
    bot: BotImpl<unknown>,
    contextData: unknown,
    base: string,
  ) => Promise<Response>,
): (c: HonoContext<InstanceEnv>) => Promise<Response> {
  return async (c) => {
    const { instance, contextData } = c.env;
    const username = c.req.param("handle")?.slice(1);
    if (username == null) return c.notFound();
    const ctx = instance.federation.createContext(c.req.raw, contextData);
    const bot = await instance.resolveBotByUsername(ctx, username);
    if (bot == null) return c.notFound();
    return await page(
      c,
      bot,
      contextData,
      `/@${encodeURIComponent(username)}`,
    );
  };
}

const handlePattern = ":handle{@[^/]+}";

multiApp.get(`/${handlePattern}`, withBot(profilePage));
multiApp.get(`/${handlePattern}/followers`, withBot(followersPage));
multiApp.get(`/${handlePattern}/tags/:hashtag`, withBot(hashtagPage));
multiApp.get(`/${handlePattern}/feed.xml`, withBot(feedPage));
multiApp.post(`/${handlePattern}/follow`, withBot(followPage));
multiApp.get(`/${handlePattern}/:id`, withBot(messagePage));

interface GetPostsOptions {
  readonly hashtag?: string;
  readonly offset?: Temporal.Instant;
  readonly window?: number;
}

async function getPosts(
  bot: BotImpl<unknown>,
  ctx: Context<unknown>,
  options: GetPostsOptions = {},
): Promise<{ posts: MessageClass[]; nextPost?: Object }> {
  const { offset, window = 15 } = options;
  let posts = await Array.fromAsync(
    bot.repository.getMessages({
      order: "newest",
      until: offset,
      limit: window * 2,
    }),
  );
  let lastPost: Announce | Create | undefined = posts[posts.length - 1];
  posts = posts.slice(0, posts.length - 1);
  posts = posts.filter(isPublic);
  if (options.hashtag != null) {
    const taggedPosts = [];
    for (const post of posts) {
      if (await hasHashtag(ctx, post, options.hashtag)) {
        taggedPosts.push(post);
      }
    }
    posts = taggedPosts;
  }
  while (lastPost != null && posts.length < window) {
    const limit = (window - posts.length) * 2;
    const until = lastPost.published ??
      (await lastPost.getObject(ctx))?.published ??
      undefined;
    if (until == null) break;
    const nextPosts = bot.repository.getMessages({
      order: "newest",
      until,
      limit,
    });
    let i = 0;
    lastPost = undefined;
    for await (const post of nextPosts) {
      if (
        isPublic(post) && await hasHashtag(ctx, post, options.hashtag) &&
        posts.length < window + 1
      ) posts.push(post);
      lastPost = post;
      i++;
    }
    if (i < limit) break;
  }
  const nextPost: Object | undefined = await posts[window]?.getObject(ctx) ??
    undefined;
  posts = posts.slice(0, window);
  const messages = (await Promise.all(posts.map((p) => p.getObject(ctx))))
    .filter(isMessageObject);
  return { posts: messages, nextPost };
}

function isPublic(post: Create | Announce): boolean {
  return post.toIds.some((url) => url.href === PUBLIC_COLLECTION.href) ||
    post.ccIds.some((url) => url.href === PUBLIC_COLLECTION.href);
}

async function hasHashtag(
  context: Context<unknown>,
  post: Create | Announce,
  hashtag?: string,
): Promise<boolean> {
  if (hashtag == null) return true;
  hashtag = normalizeHashtag(hashtag);
  const object = await post.getObject(context);
  if (object == null) return false;
  for await (const tag of object.getTags(context)) {
    if (
      tag instanceof Hashtag && tag.name != null &&
      normalizeHashtag(tag.name.toString()) === hashtag
    ) {
      return true;
    }
  }
  return false;
}

function normalizeHashtag(hashtag: string): string {
  return hashtag
    .toLowerCase()
    .trimStart()
    .replace(/^#/, "")
    .trim()
    .replace(/\s+/g, "");
}
