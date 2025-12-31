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
import {
  type Context,
  createFederation,
  type Federation,
  type InboxContext,
  type KvStore,
  type MessageQueue,
  type NodeInfo,
  type PageItems,
  type Recipient,
  type RequestContext,
  type Software,
} from "@fedify/fedify";
import {
  Accept,
  type Activity,
  type Actor,
  Announce,
  Article,
  ChatMessage,
  Create,
  type CryptographicKey,
  Emoji as APEmoji,
  Follow,
  Like as RawLike,
  Note,
  Question,
  Reject,
  Undo,
} from "@fedify/fedify/vocab";
import { getLogger } from "@logtape/logtape";
import fs from "node:fs/promises";
import { getXForwardedRequest } from "x-forwarded-fetch";
import metadata from "../deno.json" with { type: "json" };
import type { Bot, BotProfile, PagesOptions } from "./bot.ts";
import { BotImpl } from "./bot-impl.ts";
import type { CustomEmoji } from "./emoji.ts";
import type { MessageClass } from "./message.ts";
import { app } from "./pages.tsx";
import { createScopedPrefixes, KvRepository, type Uuid } from "./repository.ts";
import type {
  BotDispatcher,
  CreateInstanceOptions,
  Instance,
} from "./instance.ts";

const logger = getLogger(["botkit", "instance"]);

interface DynamicDispatcherEntry<TContextData> {
  dispatcher: BotDispatcher<TContextData>;
  template: BotImpl<TContextData>;
}

export interface InstanceImplOptions<TContextData>
  extends CreateInstanceOptions<TContextData> {
  collectionWindow?: number;
}

export class InstanceImpl<TContextData> implements Instance<TContextData> {
  readonly federation: Federation<TContextData>;
  readonly kv: KvStore;
  readonly queue?: MessageQueue;
  readonly software?: Software;
  readonly behindProxy: boolean;
  readonly pages: Required<PagesOptions>;
  readonly collectionWindow: number;

  readonly #staticBots: Map<string, BotImpl<TContextData>>;
  readonly #dynamicDispatchers: DynamicDispatcherEntry<TContextData>[];
  readonly #dynamicBotCache: Map<string, BotImpl<TContextData>>;

  constructor(options: InstanceImplOptions<TContextData>) {
    this.kv = options.kv;
    this.queue = options.queue;
    this.software = options.software;
    this.behindProxy = options.behindProxy ?? false;
    this.pages = {
      color: "green",
      css: "",
      ...(options.pages ?? {}),
    };
    this.collectionWindow = options.collectionWindow ?? 50;

    this.#staticBots = new Map();
    this.#dynamicDispatchers = [];
    this.#dynamicBotCache = new Map();

    this.federation = createFederation<TContextData>({
      kv: options.kv,
      queue: options.queue,
      userAgent: {
        software: `BotKit/${metadata.version}`,
      },
    });

    this.#initialize();
  }

  #initialize(): void {
    this.federation
      .setActorDispatcher(
        "/ap/actor/{identifier}",
        this.#dispatchActor.bind(this),
      )
      .mapHandle(this.#mapHandle.bind(this))
      .setKeyPairsDispatcher(this.#dispatchActorKeyPairs.bind(this));

    this.federation
      .setFollowersDispatcher(
        "/ap/actor/{identifier}/followers",
        this.#dispatchFollowers.bind(this),
      )
      .setFirstCursor(this.#getFollowersFirstCursor.bind(this))
      .setCounter(this.#countFollowers.bind(this));

    this.federation
      .setOutboxDispatcher(
        "/ap/actor/{identifier}/outbox",
        this.#dispatchOutbox.bind(this),
      )
      .setFirstCursor(this.#getOutboxFirstCursor.bind(this))
      .setCounter(this.#countOutbox.bind(this));

    this.federation
      .setObjectDispatcher(
        Follow,
        "/ap/follow/{id}",
        this.#dispatchFollow.bind(this),
      )
      .authorize(this.#authorizeFollow.bind(this));

    this.federation.setObjectDispatcher(
      Article,
      "/ap/article/{id}",
      (ctx, values) => this.#dispatchMessage(Article, ctx, values.id),
    );
    this.federation.setObjectDispatcher(
      ChatMessage,
      "/ap/chat-message/{id}",
      (ctx, values) => this.#dispatchMessage(ChatMessage, ctx, values.id),
    );
    this.federation.setObjectDispatcher(
      Note,
      "/ap/note/{id}",
      (ctx, values) => this.#dispatchMessage(Note, ctx, values.id),
    );
    this.federation.setObjectDispatcher(
      Question,
      "/ap/question/{id}",
      (ctx, values) => this.#dispatchMessage(Question, ctx, values.id),
    );
    this.federation.setObjectDispatcher(
      Announce,
      "/ap/announce/{id}",
      this.#dispatchAnnounce.bind(this),
    );
    this.federation.setObjectDispatcher(
      APEmoji,
      "/ap/emoji/{name}",
      this.#dispatchEmoji.bind(this),
    );

    this.federation
      .setInboxListeners("/ap/actor/{identifier}/inbox", "/ap/inbox")
      .on(Follow, this.#onFollowed.bind(this))
      .on(Undo, this.#onUndo.bind(this))
      .on(Accept, this.#onFollowAccepted.bind(this))
      .on(Reject, this.#onFollowRejected.bind(this))
      .on(Create, this.#onCreated.bind(this))
      .on(Announce, this.#onAnnounced.bind(this))
      .on(RawLike, this.#onLiked.bind(this))
      .setSharedKeyDispatcher(this.#dispatchSharedKey.bind(this));

    if (this.software != null) {
      this.federation.setNodeInfoDispatcher(
        "/nodeinfo/2.1",
        this.#dispatchNodeInfo.bind(this),
      );
    }
  }

  async #resolveBot(
    ctx: Context<TContextData>,
    identifier: string,
  ): Promise<BotImpl<TContextData> | null> {
    // Check static bots first
    const staticBot = this.#staticBots.get(identifier);
    if (staticBot != null) return staticBot;

    // Check dynamic bot cache
    const cachedBot = this.#dynamicBotCache.get(identifier);
    if (cachedBot != null) return cachedBot;

    // Try dynamic dispatchers
    for (const { dispatcher, template } of this.#dynamicDispatchers) {
      const profile = await dispatcher(ctx, identifier);
      if (profile != null) {
        // Create a new bot instance with the resolved profile
        const repository = new KvRepository(
          this.kv,
          createScopedPrefixes(identifier),
        );
        const bot = new BotImpl<TContextData>({
          identifier,
          username: profile.username,
          name: profile.name,
          class: profile.class,
          summary: profile.summary,
          icon: profile.icon,
          image: profile.image,
          properties: profile.properties,
          followerPolicy: profile.followerPolicy,
          kv: this.kv,
          repository,
          queue: this.queue,
          software: this.software,
          behindProxy: this.behindProxy,
          pages: this.pages,
          collectionWindow: this.collectionWindow,
          federation: this.federation,
          skipInitialize: true,
        });
        // Copy event handlers from template
        bot.onFollow = template.onFollow;
        bot.onUnfollow = template.onUnfollow;
        bot.onAcceptFollow = template.onAcceptFollow;
        bot.onRejectFollow = template.onRejectFollow;
        bot.onMention = template.onMention;
        bot.onReply = template.onReply;
        bot.onQuote = template.onQuote;
        bot.onMessage = template.onMessage;
        bot.onSharedMessage = template.onSharedMessage;
        bot.onLike = template.onLike;
        bot.onUnlike = template.onUnlike;
        bot.onReact = template.onReact;
        bot.onUnreact = template.onUnreact;
        bot.onVote = template.onVote;

        // Cache the resolved bot
        this.#dynamicBotCache.set(identifier, bot);
        return bot;
      }
    }

    return null;
  }

  #getAllBots(): BotImpl<TContextData>[] {
    return [
      ...this.#staticBots.values(),
      ...this.#dynamicBotCache.values(),
    ];
  }

  // Actor dispatcher
  async #dispatchActor(
    ctx: Context<TContextData>,
    identifier: string,
  ): Promise<Actor | null> {
    const bot = await this.#resolveBot(ctx, identifier);
    if (bot == null) return null;
    return bot.dispatchActor(ctx, identifier);
  }

  #mapHandle(_ctx: Context<TContextData>, username: string): string | null {
    // Check static bots
    for (const [identifier, bot] of this.#staticBots) {
      if (bot.username === username) return identifier;
    }
    // Dynamic bots cannot be resolved by username without identifier
    return null;
  }

  async #dispatchActorKeyPairs(
    ctx: Context<TContextData>,
    identifier: string,
  ): Promise<CryptoKeyPair[]> {
    const bot = await this.#resolveBot(ctx, identifier);
    if (bot == null) return [];
    return bot.dispatchActorKeyPairs(ctx, identifier);
  }

  // Collection dispatchers
  async #dispatchFollowers(
    ctx: Context<TContextData>,
    identifier: string,
    cursor: string | null,
  ): Promise<PageItems<Recipient> | null> {
    const bot = await this.#resolveBot(ctx, identifier);
    if (bot == null) return null;
    return bot.dispatchFollowers(ctx, identifier, cursor);
  }

  #getFollowersFirstCursor(
    ctx: Context<TContextData>,
    identifier: string,
  ): string | null {
    const bot = this.#staticBots.get(identifier) ??
      this.#dynamicBotCache.get(identifier);
    if (bot == null) return null;
    return bot.getFollowersFirstCursor(ctx, identifier);
  }

  async #countFollowers(
    ctx: Context<TContextData>,
    identifier: string,
  ): Promise<number | null> {
    const bot = await this.#resolveBot(ctx, identifier);
    if (bot == null) return null;
    return bot.countFollowers(ctx, identifier);
  }

  async #dispatchOutbox(
    ctx: RequestContext<TContextData>,
    identifier: string,
    cursor: string | null,
  ): Promise<PageItems<Activity> | null> {
    const bot = await this.#resolveBot(ctx, identifier);
    if (bot == null) return null;
    return bot.dispatchOutbox(ctx, identifier, cursor);
  }

  #getOutboxFirstCursor(
    ctx: Context<TContextData>,
    identifier: string,
  ): string | null {
    const bot = this.#staticBots.get(identifier) ??
      this.#dynamicBotCache.get(identifier);
    if (bot == null) return null;
    return bot.getOutboxFirstCursor(ctx, identifier);
  }

  async #countOutbox(
    ctx: Context<TContextData>,
    identifier: string,
  ): Promise<number | null> {
    const bot = await this.#resolveBot(ctx, identifier);
    if (bot == null) return null;
    return bot.countOutbox(ctx, identifier);
  }

  // Object dispatchers - need to scan all bots' repositories
  async #dispatchFollow(
    ctx: RequestContext<TContextData>,
    values: { id: string },
  ): Promise<Follow | null> {
    for (const bot of this.#getAllBots()) {
      const follow = await bot.dispatchFollow(ctx, values);
      if (follow != null) return follow;
    }
    return null;
  }

  async #authorizeFollow(
    ctx: RequestContext<TContextData>,
    values: { id: string },
    signedKey: CryptographicKey | null,
    signedKeyOwner: Actor | null,
  ): Promise<boolean> {
    for (const bot of this.#getAllBots()) {
      const authorized = await bot.authorizeFollow(
        ctx,
        values,
        signedKey,
        signedKeyOwner,
      );
      if (authorized) return true;
    }
    return false;
  }

  async #dispatchMessage<T extends MessageClass>(
    // deno-lint-ignore no-explicit-any
    cls: new (values: any) => T,
    ctx: Context<TContextData> | RequestContext<TContextData>,
    id: string,
  ): Promise<T | null> {
    for (const bot of this.#getAllBots()) {
      const message = await bot.dispatchMessage(cls, ctx, id);
      if (message != null) return message;
    }
    return null;
  }

  async #dispatchAnnounce(
    ctx: RequestContext<TContextData>,
    values: { id: string },
  ): Promise<Announce | null> {
    for (const bot of this.#getAllBots()) {
      const announce = await bot.dispatchAnnounce(ctx, values);
      if (announce != null) return announce;
    }
    return null;
  }

  #dispatchEmoji(
    ctx: Context<TContextData>,
    values: { name: string },
  ): APEmoji | null {
    for (const bot of this.#getAllBots()) {
      const emoji = bot.dispatchEmoji(ctx, values);
      if (emoji != null) return emoji;
    }
    return null;
  }

  #dispatchSharedKey(_ctx: Context<TContextData>): { identifier: string } {
    // Return the first static bot's identifier, or a default
    const firstBot = this.#staticBots.values().next().value;
    return { identifier: firstBot?.identifier ?? "bot" };
  }

  #dispatchNodeInfo(_ctx: Context<TContextData>): NodeInfo {
    const botCount = this.#staticBots.size + this.#dynamicBotCache.size;
    return {
      software: this.software!,
      protocols: ["activitypub"],
      services: {
        outbound: ["atom1.0"],
      },
      usage: {
        users: {
          total: botCount,
          activeMonth: botCount,
          activeHalfyear: botCount,
        },
        localPosts: 0,
        localComments: 0,
      },
    };
  }

  // Inbox handlers - route to correct bot
  async #onFollowed(
    ctx: InboxContext<TContextData>,
    follow: Follow,
  ): Promise<void> {
    const parsed = ctx.parseUri(follow.objectId);
    if (parsed?.type !== "actor") return;

    const bot = await this.#resolveBot(ctx, parsed.identifier);
    if (bot == null) return;

    await bot.onFollowed(ctx, follow);
  }

  async #onUndo(ctx: InboxContext<TContextData>, undo: Undo): Promise<void> {
    const object = await undo.getObject(ctx);
    if (object instanceof Follow) {
      // Route to the bot that was being followed
      const parsed = ctx.parseUri(object.objectId);
      if (parsed?.type !== "actor") return;

      const bot = await this.#resolveBot(ctx, parsed.identifier);
      if (bot == null) return;

      await bot.onUnfollowed(ctx, undo);
    } else if (object instanceof RawLike) {
      // Route to the bot whose message was liked
      const objectUri = ctx.parseUri(object.objectId);
      if (objectUri?.type !== "object") {
        // External object - try all bots
        for (const bot of this.#getAllBots()) {
          await bot.onUnliked(ctx, undo);
        }
        return;
      }

      // Find which bot owns the message
      for (const bot of this.#getAllBots()) {
        const msg = await bot.repository.getMessage(
          objectUri.values.id as Uuid,
        );
        if (msg != null) {
          await bot.onUnliked(ctx, undo);
          return;
        }
      }
    } else {
      logger.warn(
        "The Undo object {undoId} is not about Follow or Like: {object}.",
        { undoId: undo.id?.href, object },
      );
    }
  }

  async #onFollowAccepted(
    ctx: InboxContext<TContextData>,
    accept: Accept,
  ): Promise<void> {
    const parsedObj = ctx.parseUri(accept.objectId);
    if (parsedObj?.type !== "object" || parsedObj.class !== Follow) return;

    // Find which bot sent this follow request
    for (const bot of this.#getAllBots()) {
      const follow = await bot.repository.getSentFollow(
        parsedObj.values.id as Uuid,
      );
      if (follow != null) {
        await bot.onFollowAccepted(ctx, accept);
        return;
      }
    }
  }

  async #onFollowRejected(
    ctx: InboxContext<TContextData>,
    reject: Reject,
  ): Promise<void> {
    const parsedObj = ctx.parseUri(reject.objectId);
    if (parsedObj?.type !== "object" || parsedObj.class !== Follow) return;

    // Find which bot sent this follow request
    for (const bot of this.#getAllBots()) {
      const follow = await bot.repository.getSentFollow(
        parsedObj.values.id as Uuid,
      );
      if (follow != null) {
        await bot.onFollowRejected(ctx, reject);
        return;
      }
    }
  }

  async #onCreated(
    ctx: InboxContext<TContextData>,
    create: Create,
  ): Promise<void> {
    // Route to all bots - each bot's onCreated will check
    // if the activity is relevant (mentions, replies, quotes, etc.)
    for (const bot of this.#getAllBots()) {
      await bot.onCreated(ctx, create);
    }
  }

  async #onAnnounced(
    ctx: InboxContext<TContextData>,
    announce: Announce,
  ): Promise<void> {
    // Route to all bots that have onSharedMessage handler
    for (const bot of this.#getAllBots()) {
      if (bot.onSharedMessage != null) {
        await bot.onAnnounced(ctx, announce);
      }
    }
  }

  async #onLiked(
    ctx: InboxContext<TContextData>,
    like: RawLike,
  ): Promise<void> {
    const objectUri = ctx.parseUri(like.objectId);
    if (objectUri?.type !== "object") {
      // External object - try all bots
      for (const bot of this.#getAllBots()) {
        await bot.onLiked(ctx, like);
      }
      return;
    }

    // Find which bot owns the message
    for (const bot of this.#getAllBots()) {
      const msg = await bot.repository.getMessage(objectUri.values.id as Uuid);
      if (msg != null) {
        await bot.onLiked(ctx, like);
        return;
      }
    }
  }

  // Public API
  createBot(
    identifierOrDispatcher: string | BotDispatcher<TContextData>,
    profile?: BotProfile<TContextData>,
  ): Bot<TContextData> {
    if (typeof identifierOrDispatcher === "string") {
      // Static bot creation
      const identifier = identifierOrDispatcher;
      if (profile == null) {
        throw new TypeError("Profile is required for static bot creation");
      }
      if (this.#staticBots.has(identifier)) {
        throw new TypeError(
          `Bot with identifier "${identifier}" already exists`,
        );
      }

      const repository = new KvRepository(
        this.kv,
        createScopedPrefixes(identifier),
      );
      const bot = new BotImpl<TContextData>({
        identifier,
        username: profile.username,
        name: profile.name,
        class: profile.class,
        summary: profile.summary,
        icon: profile.icon,
        image: profile.image,
        properties: profile.properties,
        followerPolicy: profile.followerPolicy,
        kv: this.kv,
        repository,
        queue: this.queue,
        software: this.software,
        behindProxy: this.behindProxy,
        pages: this.pages,
        collectionWindow: this.collectionWindow,
        federation: this.federation,
        skipInitialize: true,
      });

      this.#staticBots.set(identifier, bot);
      return this.#wrapBot(bot);
    } else {
      // Dynamic bot creation
      const dispatcher = identifierOrDispatcher;

      // Create a template bot for storing event handlers
      // This bot won't be used directly, just for handler storage
      const template = new BotImpl<TContextData>({
        identifier: "__dynamic_template__",
        username: "__dynamic_template__",
        kv: this.kv,
        repository: new KvRepository(this.kv),
        queue: this.queue,
        software: this.software,
        behindProxy: this.behindProxy,
        pages: this.pages,
        collectionWindow: this.collectionWindow,
        federation: this.federation,
        skipInitialize: true,
      });

      this.#dynamicDispatchers.push({ dispatcher, template });
      return this.#wrapBot(template);
    }
  }

  #wrapBot(bot: BotImpl<TContextData>): Bot<TContextData> {
    // Wrap BotImpl in a plain object for Deno serve compatibility
    return {
      get federation() {
        return bot.federation;
      },
      get identifier() {
        return bot.identifier;
      },
      getSession(a: unknown, b?: unknown) {
        // @ts-ignore: BotImpl.getSession() implements Bot.getSession()
        return bot.getSession(a, b);
      },
      fetch(request: Request, contextData: TContextData) {
        return bot.fetch(request, contextData);
      },
      addCustomEmojis<TEmojiName extends string>(
        emojis: Readonly<Record<TEmojiName, CustomEmoji>>,
      ) {
        return bot.addCustomEmojis(emojis);
      },
      get onFollow() {
        return bot.onFollow;
      },
      set onFollow(value) {
        bot.onFollow = value;
      },
      get onUnfollow() {
        return bot.onUnfollow;
      },
      set onUnfollow(value) {
        bot.onUnfollow = value;
      },
      get onAcceptFollow() {
        return bot.onAcceptFollow;
      },
      set onAcceptFollow(value) {
        bot.onAcceptFollow = value;
      },
      get onRejectFollow() {
        return bot.onRejectFollow;
      },
      set onRejectFollow(value) {
        bot.onRejectFollow = value;
      },
      get onMention() {
        return bot.onMention;
      },
      set onMention(value) {
        bot.onMention = value;
      },
      get onReply() {
        return bot.onReply;
      },
      set onReply(value) {
        bot.onReply = value;
      },
      get onQuote() {
        return bot.onQuote;
      },
      set onQuote(value) {
        bot.onQuote = value;
      },
      get onMessage() {
        return bot.onMessage;
      },
      set onMessage(value) {
        bot.onMessage = value;
      },
      get onSharedMessage() {
        return bot.onSharedMessage;
      },
      set onSharedMessage(value) {
        bot.onSharedMessage = value;
      },
      get onLike() {
        return bot.onLike;
      },
      set onLike(value) {
        bot.onLike = value;
      },
      get onUnlike() {
        return bot.onUnlike;
      },
      set onUnlike(value) {
        bot.onUnlike = value;
      },
      get onReact() {
        return bot.onReact;
      },
      set onReact(value) {
        bot.onReact = value;
      },
      get onUnreact() {
        return bot.onUnreact;
      },
      set onUnreact(value) {
        bot.onUnreact = value;
      },
      get onVote() {
        return bot.onVote;
      },
      set onVote(value) {
        bot.onVote = value;
      },
    };
  }

  async fetch(request: Request, contextData: TContextData): Promise<Response> {
    if (this.behindProxy) {
      request = await getXForwardedRequest(request);
    }
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/.well-known/") ||
      url.pathname.startsWith("/ap/") ||
      url.pathname.startsWith("/nodeinfo/")
    ) {
      return await this.federation.fetch(request, { contextData });
    }

    // Handle emoji routes for all bots
    const match = /^\/emojis\/([a-z0-9-_]+)(?:$|\.)/.exec(url.pathname);
    if (match != null) {
      for (const bot of this.#getAllBots()) {
        const customEmoji = bot.customEmojis[match[1]];
        if (customEmoji != null && "file" in customEmoji) {
          let file: fs.FileHandle;
          try {
            file = await fs.open(customEmoji.file, "r");
          } catch (error) {
            if (
              typeof error === "object" && error != null && "code" in error &&
              error.code === "ENOENT"
            ) {
              continue;
            }
            throw error;
          }
          const fileInfo = await file.stat();
          return new Response(file.readableWebStream(), {
            headers: {
              "Content-Type": customEmoji.type,
              "Content-Length": fileInfo.size.toString(),
              "Cache-Control": "public, max-age=31536000, immutable",
              "Last-Modified": (fileInfo.mtime ?? new Date()).toUTCString(),
              "ETag": `"${fileInfo.mtime?.getTime().toString(36)}${
                fileInfo.size.toString(36)
              }"`,
            },
          });
        }
      }
      return new Response("Not Found", { status: 404 });
    }

    // For web pages, use the first static bot
    const firstBot = this.#staticBots.values().next().value;
    if (firstBot != null) {
      return await app.fetch(request, { bot: firstBot, contextData });
    }

    return new Response("Not Found", { status: 404 });
  }
}
