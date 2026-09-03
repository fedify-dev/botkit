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
  createFederation,
  type Federation,
  generateCryptoKeyPair,
  type InboxContext,
  type KvStore,
  type MessageQueue,
  type NodeInfo,
  type Software,
} from "@fedify/fedify";
import {
  Accept,
  type Activity,
  type Actor,
  Announce,
  Application,
  Article,
  ChatMessage,
  Create,
  Delete,
  Emoji as APEmoji,
  Endpoints,
  Follow,
  Image,
  Like as RawLike,
  Link,
  Mention,
  Note,
  Question,
  QuoteAuthorization,
  QuoteRequest,
  Reject,
  Undo,
  Update,
} from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import mimeDb from "mime-db";
import fs from "node:fs/promises";
import { getXForwardedRequest } from "x-forwarded-fetch";
import metadata from "../deno.json" with { type: "json" };
import { serveAsset } from "./assets.ts";
import { BotImpl } from "./bot-impl.ts";
import type { Bot, PagesOptions } from "./bot.ts";
import { BotGroupImpl, GroupBotImpl, wrapBotImpl } from "./bot-impl.ts";
import type { CustomEmoji, DeferredCustomEmoji } from "./emoji.ts";
import type {
  BotDispatcher,
  BotGroup,
  BotProfile,
  CreateBotGroupOptions,
  CreateInstanceOptions,
  Instance,
} from "./instance.ts";
import { isMessageObject, isQuoteLink } from "./message-impl.ts";
import { app, multiApp } from "./pages.tsx";
import { KvRepository, type Repository } from "./repository.ts";
import type { Session } from "./session.ts";
import { parseLocalUri, rewriteLegacyObjectPath } from "./uri.ts";

/**
 * The default identifier of the instance actor: an internal `Application`
 * actor that an {@link Instance} uses for signing shared-inbox related
 * requests on behalf of the whole instance.  It can be overridden through
 * the {@link CreateInstanceOptions.instanceActorIdentifier} option; either
 * way, bots cannot take the effective identifier.
 * @since 0.5.0
 */
export const DEFAULT_INSTANCE_ACTOR_IDENTIFIER = "__botkit_instance__";

/**
 * Options for creating an {@link InstanceImpl}.
 * @internal
 */
export interface InstanceImplOptions extends CreateInstanceOptions {
  collectionWindow?: number;

  /**
   * Whether the instance was created through the single-bot
   * `createBot()` compatibility path.  A compatible instance keeps
   * the pre-0.5 behavior: the sole bot's key signs shared-inbox
   * requests and no instance actor is exposed.
   */
  compatMode?: boolean;
}

/**
 * The internal implementation of an {@link Instance}.  It owns the single
 * Fedify {@link Federation} shared by every bot hosted on the instance, and
 * routes federation callbacks to the right bot by its identifier.
 * @internal
 */
export class InstanceImpl<TContextData>
  implements Omit<Instance<TContextData>, "createBot"> {
  readonly kv: KvStore;
  readonly queue?: MessageQueue;

  /**
   * The root repository shared by every bot hosted on the instance.
   */
  readonly repository: Repository;
  readonly software?: Software;
  readonly behindProxy: boolean;
  readonly pages: Required<PagesOptions>;
  readonly collectionWindow: number;
  readonly federation: Federation<TContextData>;
  readonly customEmojis: Record<string, CustomEmoji> = {};

  /**
   * The identifier of the bot actor that owns local objects whose URIs are
   * in the legacy (pre-0.5) format, which did not carry the identifier.
   */
  readonly legacyObjectUrisIdentifier?: string;

  /**
   * Whether the instance was created through the single-bot
   * `createBot()` compatibility path.
   */
  readonly compatMode: boolean;

  /**
   * The reserved identifier of the instance actor.
   */
  readonly instanceActorIdentifier: string;

  readonly #bots: Map<string, BotImpl<TContextData>> = new Map();
  readonly #groups: BotGroupImpl<TContextData>[] = [];

  /**
   * Memoizes dynamic bot resolution per Fedify context, which is stable
   * for the duration of one HTTP dispatch or one queue-delivered inbox
   * activity, so a dispatcher is invoked at most once per identifier per
   * request.  Entries die with their context.
   */
  readonly #resolutionCache: WeakMap<
    Context<TContextData>,
    Map<string, BotImpl<TContextData> | null>
  > = new WeakMap();

  constructor(options: InstanceImplOptions) {
    this.kv = options.kv;
    this.queue = options.queue;
    this.repository = options.repository ?? new KvRepository(options.kv);
    this.software = options.software;
    this.behindProxy = options.behindProxy ?? false;
    this.pages = {
      color: options.pages?.color ?? "green",
      theme: options.pages?.theme ?? "auto",
      css: options.pages?.css ?? "",
    };
    this.collectionWindow = options.collectionWindow ?? 50;
    this.legacyObjectUrisIdentifier = options.legacyObjectUris?.identifier;
    this.compatMode = options.compatMode ?? false;
    this.instanceActorIdentifier = options.instanceActorIdentifier ??
      DEFAULT_INSTANCE_ACTOR_IDENTIFIER;
    if (this.instanceActorIdentifier === "") {
      throw new TypeError("The instance actor identifier cannot be empty.");
    }
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
        async (ctx, identifier) => {
          if (
            !this.compatMode && identifier === this.instanceActorIdentifier
          ) {
            return await this.#dispatchInstanceActor(ctx);
          }
          const bot = await this.resolveBot(ctx, identifier);
          return await bot?.dispatchActor(ctx, identifier) ?? null;
        },
      )
      .mapHandle((ctx, username) => this.mapHandle(ctx, username))
      .setKeyPairsDispatcher(async (ctx, identifier) => {
        if (
          !this.compatMode && identifier === this.instanceActorIdentifier
        ) {
          return await this.#dispatchInstanceActorKeyPairs();
        }
        const bot = await this.resolveBot(ctx, identifier);
        return await bot?.dispatchActorKeyPairs(ctx, identifier) ?? [];
      });
    this.federation
      .setFollowersDispatcher(
        "/ap/actor/{identifier}/followers",
        async (ctx, identifier, cursor) => {
          const bot = await this.resolveBot(ctx, identifier);
          return await bot?.dispatchFollowers(ctx, identifier, cursor) ??
            null;
        },
      )
      .setFirstCursor(async (ctx, identifier) => {
        const bot = await this.resolveBot(ctx, identifier);
        return bot?.getFollowersFirstCursor(ctx, identifier) ?? null;
      })
      .setCounter(async (ctx, identifier) => {
        const bot = await this.resolveBot(ctx, identifier);
        return await bot?.countFollowers(ctx, identifier) ?? null;
      });
    this.federation
      .setOutboxDispatcher(
        "/ap/actor/{identifier}/outbox",
        async (ctx, identifier, cursor) => {
          const bot = await this.resolveBot(ctx, identifier);
          return await bot?.dispatchOutbox(ctx, identifier, cursor) ?? null;
        },
      )
      .setFirstCursor(async (ctx, identifier) => {
        const bot = await this.resolveBot(ctx, identifier);
        return bot?.getOutboxFirstCursor(ctx, identifier) ?? null;
      })
      .setCounter(async (ctx, identifier) => {
        const bot = await this.resolveBot(ctx, identifier);
        return await bot?.countOutbox(ctx, identifier) ?? null;
      });
    this.federation
      .setObjectDispatcher(
        Follow,
        "/ap/actor/{identifier}/follow/{id}",
        async (ctx, values) => {
          const bot = await this.resolveBot(ctx, values.identifier);
          return await bot?.dispatchFollow(ctx, values) ?? null;
        },
      )
      .authorize(async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.authorizeFollow(ctx, values) ?? false;
      });
    this.federation.setObjectDispatcher(
      Create,
      "/ap/actor/{identifier}/create/{id}",
      async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.dispatchCreate(ctx, values) ?? null;
      },
    );
    this.federation.setObjectDispatcher(
      Article,
      "/ap/actor/{identifier}/article/{id}",
      async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.dispatchMessage(Article, ctx, values.id) ?? null;
      },
    );
    this.federation.setObjectDispatcher(
      ChatMessage,
      "/ap/actor/{identifier}/chat-message/{id}",
      async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.dispatchMessage(ChatMessage, ctx, values.id) ??
          null;
      },
    );
    this.federation.setObjectDispatcher(
      Note,
      "/ap/actor/{identifier}/note/{id}",
      async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.dispatchMessage(Note, ctx, values.id) ?? null;
      },
    );
    this.federation.setObjectDispatcher(
      Question,
      "/ap/actor/{identifier}/question/{id}",
      async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.dispatchMessage(Question, ctx, values.id) ?? null;
      },
    );
    this.federation.setObjectDispatcher(
      Announce,
      "/ap/actor/{identifier}/announce/{id}",
      async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.dispatchAnnounce(ctx, values) ?? null;
      },
    );
    this.federation.setObjectDispatcher(
      QuoteAuthorization,
      "/ap/actor/{identifier}/quote-authorization/{id}",
      async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.dispatchQuoteAuthorization(ctx, values) ?? null;
      },
    );
    this.federation.setObjectDispatcher(
      QuoteRequest,
      "/ap/actor/{identifier}/quote-request/{id}",
      async (ctx, values) => {
        const bot = await this.resolveBot(ctx, values.identifier);
        return await bot?.dispatchQuoteRequest(ctx, values) ?? null;
      },
    );
    this.federation.setObjectDispatcher(
      APEmoji,
      "/ap/emoji/{name}",
      (ctx, values) => this.dispatchEmoji(ctx, values),
    );
    this.federation
      .setInboxListeners("/ap/actor/{identifier}/inbox", "/ap/inbox")
      .onUnverifiedActivity((ctx, activity, reason) =>
        this.onUnverifiedActivity(ctx, activity, reason)
      )
      .on(Follow, (ctx, follow) => this.onFollowed(ctx, follow))
      .on(QuoteRequest, (ctx, request) => this.onQuoteRequested(ctx, request))
      .on(Undo, (ctx, undo) => this.onUndone(ctx, undo))
      .on(Accept, (ctx, accept) => this.onFollowAccepted(ctx, accept))
      .on(Reject, (ctx, reject) => this.onFollowRejected(ctx, reject))
      .on(Create, (ctx, create) => this.onCreated(ctx, create))
      .on(Update, (ctx, update) => this.onUpdated(ctx, update))
      .on(Delete, (ctx, del) => this.onDeleted(ctx, del))
      .on(Announce, (ctx, announce) => this.onAnnounced(ctx, announce))
      .on(RawLike, (ctx, like) => this.onLiked(ctx, like))
      .setSharedKeyDispatcher((ctx) => this.dispatchSharedKey(ctx));
    if (this.software != null) {
      this.federation.setNodeInfoDispatcher(
        "/nodeinfo/2.1",
        (ctx) => this.dispatchNodeInfo(ctx),
      );
    }
  }

  /**
   * Registers a bot on the instance.  Invoked by the {@link BotImpl}
   * constructor.
   * @param bot The bot to register.
   * @throws {TypeError} If a bot with the same identifier or username
   *                     already exists on the instance.
   */
  addBot(bot: BotImpl<TContextData>): void {
    if (
      !this.compatMode && bot.identifier === this.instanceActorIdentifier
    ) {
      throw new TypeError(
        `The identifier is reserved for the instance actor: ${bot.identifier}`,
      );
    }
    if (this.#bots.has(bot.identifier)) {
      throw new TypeError(
        `A bot with the identifier already exists: ${bot.identifier}`,
      );
    }
    // Fediverse usernames are looked up case-insensitively (WebFinger
    // acct: resources and mentions vary in casing), so two usernames
    // differing only in case would be indistinguishable:
    const username = bot.username.toLowerCase();
    // A static bot holding the instance actor's name would leave the actor
    // with no WebFinger record, which is the fault this reservation exists to
    // prevent.  Registration is synchronous, so the collision is rejected
    // outright here rather than resolved by ordering in mapHandle():
    if (
      !this.compatMode &&
      username === this.instanceActorIdentifier.toLowerCase()
    ) {
      throw new TypeError(
        `The username is reserved for the instance actor: ${bot.username}`,
      );
    }
    for (const existing of this.#bots.values()) {
      if (existing.username.toLowerCase() === username) {
        throw new TypeError(
          `A bot with the username already exists: ${bot.username}`,
        );
      }
    }
    this.#bots.set(bot.identifier, bot);
  }

  /**
   * Resolves a bot hosted on the instance by its identifier.
   * @param identifier The identifier of the bot to resolve.
   * @returns The resolved bot, or `undefined` if no bot has the identifier.
   */
  getBot(identifier: string): BotImpl<TContextData> | undefined {
    return this.#bots.get(identifier);
  }

  /**
   * Resolves a bot by its identifier: bots registered statically win, then
   * the dynamic bot groups are probed in their registration order.
   * Dynamic resolutions are memoized per context.
   * @param ctx The Fedify context of the resolution.
   * @param identifier The identifier of the bot to resolve.
   * @returns The resolved bot, or `null` if no bot has the identifier.
   */
  async resolveBot(
    ctx: Context<TContextData>,
    identifier: string,
  ): Promise<BotImpl<TContextData> | null> {
    // The instance actor's identifier is reserved; no bot, static or
    // dynamic, resolves under it.  (addBot() already rejects static bots
    // with the reserved identifier; this keeps the invariant local.)
    if (!this.compatMode && identifier === this.instanceActorIdentifier) {
      return null;
    }
    const staticBot = this.#bots.get(identifier);
    if (staticBot != null) return staticBot;
    if (this.#groups.length < 1) return null;
    let cache = this.#resolutionCache.get(ctx);
    if (cache == null) {
      cache = new Map();
      this.#resolutionCache.set(ctx, cache);
    }
    const cached = cache.get(identifier);
    if (cached !== undefined) return cached;
    let resolved: BotImpl<TContextData> | null = null;
    for (const group of this.#groups) {
      const profile = await group.dispatcher(ctx, identifier);
      if (profile != null) {
        resolved = new GroupBotImpl(group, identifier, profile);
        break;
      }
    }
    cache.set(identifier, resolved);
    return resolved;
  }

  /**
   * Every bot hosted on the instance.
   */
  get bots(): Iterable<BotImpl<TContextData>> {
    return this.#bots.values();
  }

  /**
   * The number of bots hosted on the instance.
   */
  get botCount(): number {
    return this.#bots.size;
  }

  #firstBot(): BotImpl<TContextData> | undefined {
    return this.#bots.values().next().value;
  }

  createBot(
    identifier: string,
    profile: BotProfile<TContextData>,
  ): Bot<TContextData>;
  createBot(
    dispatcher: BotDispatcher<TContextData>,
    options?: CreateBotGroupOptions<TContextData>,
  ): BotGroup<TContextData>;
  createBot(
    identifierOrDispatcher: string | BotDispatcher<TContextData>,
    profileOrOptions?:
      | BotProfile<TContextData>
      | CreateBotGroupOptions<TContextData>,
  ): Bot<TContextData> | BotGroup<TContextData> {
    if (typeof identifierOrDispatcher !== "string") {
      const group = new BotGroupImpl(
        this,
        identifierOrDispatcher,
        profileOrOptions as CreateBotGroupOptions<TContextData> | undefined,
      );
      this.#groups.push(group);
      return group;
    }
    const profile = profileOrOptions as BotProfile<TContextData> | undefined;
    if (profile == null || profile.username == null) {
      throw new TypeError("The bot profile with a username is required.");
    }
    const bot = new BotImpl<TContextData>({
      instance: this,
      identifier: identifierOrDispatcher,
      kv: this.kv,
      class: profile.class,
      username: profile.username,
      name: profile.name,
      summary: profile.summary,
      icon: profile.icon,
      image: profile.image,
      properties: profile.properties,
      followerPolicy: profile.followerPolicy,
      quotePolicy: profile.quotePolicy,
    });
    return wrapBotImpl(bot);
  }

  /**
   * Resolves a bot hosted on the instance by its username, including
   * dynamically resolved bots.
   * @param ctx The Fedify context of the resolution.
   * @param username The username of the bot to resolve.
   * @returns The resolved bot, or `null` if no bot has the username.
   */
  async resolveBotByUsername(
    ctx: Context<TContextData>,
    username: string,
  ): Promise<BotImpl<TContextData> | null> {
    const identifier = await this.mapHandle(ctx, username);
    if (identifier == null) return null;
    return await this.resolveBot(ctx, identifier);
  }

  async mapHandle(
    ctx: Context<TContextData>,
    username: string,
  ): Promise<string | null> {
    // WebFinger lookups and profile page visits vary in casing, so static
    // usernames are matched case-insensitively:
    const normalized = username.toLowerCase();
    for (const bot of this.#bots.values()) {
      if (bot.username.toLowerCase() === normalized) return bot.identifier;
    }
    for (const group of this.#groups) {
      if (group.mapUsername == null) continue;
      const identifier = await group.mapUsername(ctx, username);
      if (identifier == null) continue;
      // The mapping must resolve to a bot of the very group that mapped it;
      // otherwise a group could hijack usernames of other bots:
      const bot = await this.resolveBot(ctx, identifier);
      if (bot instanceof GroupBotImpl && bot.group === group) {
        return identifier;
      }
    }
    // Unless a group maps usernames explicitly, usernames are assumed to
    // equal identifiers.  The fallback applies only to dynamic groups
    // without a mapUsername; a static bot's internal identifier is not
    // a public username:
    const bot = await this.resolveBot(ctx, username);
    if (bot instanceof GroupBotImpl && bot.group.mapUsername == null) {
      return username;
    }
    // The instance actor is served by the actor dispatcher but is not a
    // registered bot, so it needs a mapping of its own.  Without one it has
    // no WebFinger record, and implementations that resolve a signature's
    // key owner through WebFinger rather than by URI (GoToSocial) reject
    // every request the instance actor signs.
    //
    // It resolves last so that a mapping something else already owns keeps
    // working: addBot() reserves the name against static bots, but a group's
    // mapUsername() can only be evaluated per request, and one that claims
    // the name resolved to its own bot before this method knew about the
    // instance actor at all.  Deferring keeps that mapping rather than
    // silently redirecting the handle away from a bot that is still
    // dereferenceable under its own identifier:
    if (
      !this.compatMode &&
      normalized === this.instanceActorIdentifier.toLowerCase()
    ) {
      return this.instanceActorIdentifier;
    }
    return null;
  }

  onUnverifiedActivity(
    _ctx: Context<TContextData>,
    activity: Activity,
    reason: { type: string; result?: unknown },
  ): Response | void {
    if (
      activity instanceof Delete &&
      reason.type === "keyFetchError" &&
      typeof reason.result === "object" && reason.result != null &&
      "status" in reason.result &&
      reason.result.status === 410
    ) {
      return new Response(null, { status: 202 });
    }
  }

  /**
   * Resolves which bots an incoming shared-inbox activity is relevant to.
   * On a compatible (single-bot) instance every hosted bot is returned,
   * preserving the pre-0.5 behavior.  A personal-inbox delivery targets
   * its recipient only.  Otherwise the given resolver computes the
   * relevant bot identifiers.
   */
  async #resolveTargets(
    ctx: InboxContext<TContextData>,
    resolve: () =>
      | Promise<Iterable<string>>
      | Iterable<string>,
  ): Promise<BotImpl<TContextData>[]> {
    if (this.compatMode) return [...this.#bots.values()];
    if (ctx.recipient != null) {
      const bot = await this.resolveBot(ctx, ctx.recipient);
      return bot == null ? [] : [bot];
    }
    const identifiers = new Set(await resolve());
    const bots: BotImpl<TContextData>[] = [];
    for (const identifier of identifiers) {
      const bot = await this.resolveBot(ctx, identifier);
      if (bot != null) bots.push(bot);
    }
    return bots;
  }

  /**
   * Attributes a local object URI to its owning bot identifier, or logs and
   * yields nothing when the URI is not a local object.  Activities on
   * objects the instance does not own cannot be attributed to any bot on
   * a multi-bot instance, so they are dropped.
   */
  #localObjectTarget(
    ctx: InboxContext<TContextData>,
    uri: URL | null,
  ): Iterable<string> {
    const parsed = parseLocalUri(ctx, uri, this.legacyObjectUrisIdentifier);
    if (
      parsed?.type === "object" &&
      typeof parsed.values.identifier === "string"
    ) {
      return [parsed.values.identifier];
    }
    const logger = getLogger(["botkit", "instance", "inbox"]);
    logger.debug(
      "The object {uri} is not owned by any bot on this instance; " +
        "the activity is not routed.",
      { uri: uri?.href },
    );
    return [];
  }

  async onFollowed(
    ctx: InboxContext<TContextData>,
    follow: Follow,
  ): Promise<void> {
    const bots = await this.#resolveTargets(ctx, () => {
      const parsed = ctx.parseUri(follow.objectId);
      return parsed?.type === "actor" ? [parsed.identifier] : [];
    });
    for (const bot of bots) await bot.onFollowed(ctx, follow);
  }

  async onUndone(
    ctx: InboxContext<TContextData>,
    undo: Undo,
  ): Promise<void> {
    const object = await undo.getObject(ctx);
    if (object instanceof Follow) {
      const bots = await this.#resolveTargets(ctx, () => {
        const parsed = ctx.parseUri(object.objectId);
        return parsed?.type === "actor" ? [parsed.identifier] : [];
      });
      for (const bot of bots) await bot.onUnfollowed(ctx, undo);
    } else if (object instanceof RawLike) {
      const bots = await this.#resolveTargets(
        ctx,
        () => this.#localObjectTarget(ctx, object.objectId),
      );
      for (const bot of bots) await bot.onUnliked(ctx, undo);
    } else {
      const logger = getLogger(["botkit", "bot", "inbox"]);
      logger.warn(
        "The Undo object {undoId} is not about Follow or Like: {object}.",
        { undoId: undo.id?.href, object },
      );
    }
  }

  async onQuoteRequested(
    ctx: InboxContext<TContextData>,
    request: QuoteRequest,
  ): Promise<void> {
    const bots = await this.#resolveTargets(
      ctx,
      () => this.#localObjectTarget(ctx, request.objectId),
    );
    for (const bot of bots) await bot.onQuoteRequested(ctx, request);
  }

  async onFollowAccepted(
    ctx: InboxContext<TContextData>,
    accept: Accept,
  ): Promise<void> {
    const bots = await this.#resolveTargets(
      ctx,
      () => this.#localObjectTarget(ctx, accept.objectId),
    );
    for (const bot of bots) await bot.onFollowAccepted(ctx, accept);
  }

  async onFollowRejected(
    ctx: InboxContext<TContextData>,
    reject: Reject,
  ): Promise<void> {
    const bots = await this.#resolveTargets(
      ctx,
      () => this.#localObjectTarget(ctx, reject.objectId),
    );
    for (const bot of bots) await bot.onFollowRejected(ctx, reject);
  }

  async onDeleted(
    ctx: InboxContext<TContextData>,
    del: Delete,
  ): Promise<void> {
    const bots = await this.#resolveTargets(ctx, async () => {
      const targets = new Set<string>();
      for (const uri of [...del.toIds, ...del.ccIds]) {
        const parsed = ctx.parseUri(uri);
        if (parsed?.type === "actor" || parsed?.type === "followers") {
          if (parsed.identifier != null) targets.add(parsed.identifier);
        }
      }
      if (
        del.objectId != null &&
        typeof this.repository.findQuoteAuthorizationReferenceIdentifiers ===
          "function"
      ) {
        for await (
          const identifier of this.repository
            .findQuoteAuthorizationReferenceIdentifiers(del.objectId)
        ) {
          targets.add(identifier);
        }
      }
      return targets;
    });
    for (const bot of bots) await bot.onDeleted(ctx, del);
  }

  async onLiked(
    ctx: InboxContext<TContextData>,
    like: RawLike,
  ): Promise<void> {
    const bots = await this.#resolveTargets(
      ctx,
      () => this.#localObjectTarget(ctx, like.objectId),
    );
    for (const bot of bots) await bot.onLiked(ctx, like);
  }

  async onCreated(
    ctx: InboxContext<TContextData>,
    create: Create,
  ): Promise<void> {
    const bots = await this.#resolveTargets(ctx, async () => {
      const targets = new Set<string>();
      // Bots following the author see the message on their timeline:
      if (create.actorId != null) {
        for await (
          const identifier of this.repository.findFollowedBots(create.actorId)
        ) {
          targets.add(identifier);
        }
      }
      // Bots addressed directly, or whose followers collection is
      // addressed (either on the activity or on the embedded object):
      const addAddressee = (uri: URL) => {
        const parsed = ctx.parseUri(uri);
        if (parsed?.type === "actor" || parsed?.type === "followers") {
          if (parsed.identifier != null) targets.add(parsed.identifier);
        }
      };
      for (const uri of [...create.toIds, ...create.ccIds]) {
        addAddressee(uri);
      }
      const addLocalObject = (uri: URL | null) => {
        const parsed = parseLocalUri(
          ctx,
          uri,
          this.legacyObjectUrisIdentifier,
        );
        if (
          parsed?.type === "object" &&
          typeof parsed.values.identifier === "string"
        ) {
          targets.add(parsed.values.identifier);
        }
      };
      const object = await create.getObject(ctx);
      if (isMessageObject(object)) {
        for (const uri of [...object.toIds, ...object.ccIds]) {
          addAddressee(uri);
        }
        // Bots mentioned in or quoted by the message:
        for await (const tag of object.getTags(ctx)) {
          if (tag instanceof Mention && tag.href != null) {
            const parsed = ctx.parseUri(tag.href);
            if (parsed?.type === "actor") targets.add(parsed.identifier);
          } else if (tag instanceof Link && isQuoteLink(tag)) {
            addLocalObject(tag.href);
          }
        }
        addLocalObject(object.quoteId);
        addLocalObject(object.quoteUrl);
        // Bots whose message is replied to:
        addLocalObject(object.replyTargetId);
      }
      return targets;
    });
    for (const bot of bots) await bot.onCreated(ctx, create);
  }

  async onUpdated(
    ctx: InboxContext<TContextData>,
    update: Update,
  ): Promise<void> {
    const bots = await this.#resolveTargets(ctx, async () => {
      const targets = new Set<string>();
      const addLocalObject = (uri: URL | null) => {
        const parsed = parseLocalUri(
          ctx,
          uri,
          this.legacyObjectUrisIdentifier,
        );
        if (
          parsed?.type === "object" &&
          typeof parsed.values.identifier === "string"
        ) {
          targets.add(parsed.values.identifier);
        }
      };
      const object = await update.getObject(ctx);
      if (isMessageObject(object)) addLocalObject(object.quoteId);
      return targets;
    });
    for (const bot of bots) await bot.onUpdated(ctx, update);
  }

  async onAnnounced(
    ctx: InboxContext<TContextData>,
    announce: Announce,
  ): Promise<void> {
    const bots = await this.#resolveTargets(ctx, async () => {
      const targets = new Set<string>();
      // Bots following the sharer see the share on their timeline:
      if (announce.actorId != null) {
        for await (
          const identifier of this.repository.findFollowedBots(
            announce.actorId,
          )
        ) {
          targets.add(identifier);
        }
      }
      // Bots addressed directly, or whose followers collection is
      // addressed, or whose message is shared:
      for (const uri of [...announce.toIds, ...announce.ccIds]) {
        const parsed = ctx.parseUri(uri);
        if (parsed?.type === "actor" || parsed?.type === "followers") {
          if (parsed.identifier != null) targets.add(parsed.identifier);
        }
      }
      const parsedObject = parseLocalUri(
        ctx,
        announce.objectId,
        this.legacyObjectUrisIdentifier,
      );
      if (
        parsedObject?.type === "object" &&
        typeof parsedObject.values.identifier === "string"
      ) {
        targets.add(parsedObject.values.identifier);
      }
      return targets;
    });
    for (const bot of bots) await bot.onAnnounced(ctx, announce);
  }

  dispatchSharedKey(_ctx: Context<TContextData>): { identifier: string } {
    if (this.compatMode) {
      const bot = this.#firstBot();
      if (bot == null) {
        throw new TypeError(
          "The instance has no bots; the shared inbox key cannot be " +
            "dispatched.",
        );
      }
      return { identifier: bot.identifier };
    }
    return { identifier: this.instanceActorIdentifier };
  }

  async #dispatchInstanceActor(
    ctx: Context<TContextData>,
  ): Promise<Actor> {
    const keyPairs = await ctx.getActorKeyPairs(this.instanceActorIdentifier);
    return new Application({
      id: ctx.getActorUri(this.instanceActorIdentifier),
      preferredUsername: this.instanceActorIdentifier,
      name: "Instance actor",
      summary: "An internal actor the instance uses for signing requests " +
        "on behalf of the whole instance.",
      inbox: ctx.getInboxUri(this.instanceActorIdentifier),
      endpoints: new Endpoints({
        sharedInbox: ctx.getInboxUri(),
      }),
      publicKey: keyPairs[0].cryptographicKey,
      assertionMethods: keyPairs.map((pair) => pair.multikey),
      discoverable: false,
    });
  }

  #instanceActorKeyPairs?: Promise<CryptoKeyPair[]>;

  #dispatchInstanceActorKeyPairs(): Promise<CryptoKeyPair[]> {
    // Concurrent cold-start requests must not generate competing key pairs
    // and overwrite each other, so the whole load-or-generate sequence is
    // memoized in process:
    if (this.#instanceActorKeyPairs != null) {
      return this.#instanceActorKeyPairs;
    }
    const promise = (async () => {
      let keyPairs = await this.repository.getKeyPairs(
        this.instanceActorIdentifier,
      );
      if (keyPairs == null) {
        const rsa = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
        const ed25519 = await generateCryptoKeyPair("Ed25519");
        keyPairs = [rsa, ed25519];
        await this.repository.setKeyPairs(
          this.instanceActorIdentifier,
          keyPairs,
        );
      }
      return keyPairs;
    })();
    this.#instanceActorKeyPairs = promise;
    // A failed attempt (e.g. a transient storage error) must not be cached
    // forever:
    promise.catch(() => {
      if (this.#instanceActorKeyPairs === promise) {
        this.#instanceActorKeyPairs = undefined;
      }
    });
    return promise;
  }

  dispatchNodeInfo(_ctx: Context<TContextData>): NodeInfo {
    return {
      software: this.software!,
      protocols: ["activitypub"],
      services: {
        outbound: ["atom1.0"], // TODO
      },
      usage: {
        users: {
          total: this.botCount,
          activeMonth: this.botCount, // FIXME
          activeHalfyear: this.botCount, // FIXME
        },
        localPosts: 0, // FIXME
        localComments: 0,
      },
    };
  }

  dispatchEmoji(
    ctx: Context<TContextData>,
    values: { name: string },
  ): APEmoji | null {
    const customEmoji = this.customEmojis[values.name];
    if (customEmoji == null) return null;
    return this.getEmoji(ctx, values.name, customEmoji);
  }

  getEmoji(
    ctx: Context<TContextData>,
    name: string,
    data: CustomEmoji,
  ): APEmoji {
    let url: URL;
    if ("url" in data) {
      url = new URL(data.url);
    } else {
      // @ts-ignore: data.type satisfies keyof typeof mimeDb
      const t = mimeDb[data.type];
      url = new URL(
        `/emojis/${name}${
          t == null || t.extensions == null || t.extensions.length < 1
            ? ""
            : `.${t.extensions[0]}`
        }`,
        ctx.origin,
      );
    }
    return new APEmoji({
      id: ctx.getObjectUri(APEmoji, { name }),
      name: `:${name}:`,
      icon: new Image({
        mediaType: data.type,
        url,
      }),
    });
  }

  addCustomEmoji<TEmojiName extends string>(
    name: TEmojiName,
    data: CustomEmoji,
  ): DeferredCustomEmoji<TContextData> {
    if (!name.match(/^[a-z0-9-_]+$/i)) {
      throw new TypeError(
        `Invalid custom emoji name: ${name}. It must match /^[a-z0-9-_]+$/i.`,
      );
    } else if (name in this.customEmojis) {
      throw new TypeError(`Duplicate custom emoji name: ${name}`);
    } else if (!data.type.startsWith("image/")) {
      throw new TypeError(`Unsupported media type: ${data.type}`);
    }
    this.customEmojis[name] = data;
    return (session: Session<TContextData>) =>
      this.getEmoji(
        session.context,
        name,
        data,
      );
  }

  addCustomEmojis<TEmojiName extends string>(
    emojis: Readonly<Record<TEmojiName, CustomEmoji>>,
  ): Readonly<Record<TEmojiName, DeferredCustomEmoji<TContextData>>> {
    const emojiMap = {} as Record<
      TEmojiName,
      DeferredCustomEmoji<TContextData>
    >;
    for (const name in emojis) {
      emojiMap[name] = this.addCustomEmoji(name, emojis[name]);
    }
    return emojiMap;
  }

  async addCollectionInverseProperty(
    request: Request,
    contextData: TContextData,
    response: Response,
  ): Promise<Response> {
    if (!response.ok) return response;
    const ctx = this.federation.createContext(request, contextData);
    const parsed = ctx.parseUri(new URL(request.url));
    if (
      parsed == null ||
      (parsed.type !== "outbox" && parsed.type !== "followers") ||
      parsed.identifier == null
    ) {
      return response;
    }
    const contentType = response.headers.get("Content-Type");
    if (
      contentType == null ||
      (
        !contentType.startsWith("application/activity+json") &&
        !contentType.startsWith("application/ld+json")
      )
    ) {
      return response;
    }
    const body = await response.json();
    if (typeof body !== "object" || body == null || Array.isArray(body)) {
      return new Response(JSON.stringify(body), {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    }
    const property = parsed.type === "outbox" ? "outboxOf" : "followersOf";
    const actorUri = ctx.getActorUri(parsed.identifier).href;
    if (body[property] === actorUri) {
      return new Response(JSON.stringify(body), {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    }
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    return new Response(JSON.stringify({ ...body, [property]: actorUri }), {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  async fetch(request: Request, contextData: TContextData): Promise<Response> {
    if (this.behindProxy) {
      request = await getXForwardedRequest(request);
    }
    const url = new URL(request.url);
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      this.legacyObjectUrisIdentifier != null
    ) {
      // Dereferenceable requests to object URIs in the legacy (pre-0.5)
      // format are permanently redirected to their canonical URIs:
      const rewrittenPath = rewriteLegacyObjectPath(
        url.pathname,
        this.legacyObjectUrisIdentifier,
      );
      if (rewrittenPath != null) {
        const location = new URL(url.href);
        location.pathname = rewrittenPath;
        return new Response(null, {
          status: 301,
          headers: { Location: location.href },
        });
      }
    }
    if (
      url.pathname.startsWith("/.well-known/") ||
      url.pathname.startsWith("/ap/") ||
      url.pathname.startsWith("/nodeinfo/")
    ) {
      const response = await this.federation.fetch(request, { contextData });
      return await this.addCollectionInverseProperty(
        request,
        contextData,
        response,
      );
    }
    if (url.pathname.startsWith("/.botkit/")) {
      const assetResponse = serveAsset(url.pathname);
      if (assetResponse != null) return assetResponse;
    }
    const match = /^\/emojis\/([a-z0-9-_]+)(?:$|\.)/.exec(url.pathname);
    if (match != null) {
      const customEmoji = this.customEmojis[match[1]];
      if (customEmoji == null || !("file" in customEmoji)) {
        return new Response("Not Found", { status: 404 });
      }
      // Custom emojis are small images, so reading them into memory avoids
      // managing a file handle whose readableWebStream() does not close it
      // on completion (leaking a descriptor per request):
      let fileInfo: Awaited<ReturnType<typeof fs.stat>>;
      let data: Uint8Array;
      try {
        fileInfo = await fs.stat(customEmoji.file);
        data = await fs.readFile(customEmoji.file);
      } catch (error) {
        if (
          typeof error === "object" && error != null && "code" in error &&
          error.code === "ENOENT"
        ) {
          return new Response("Not Found", { status: 404 });
        }
        throw error;
      }
      const mtime = fileInfo.mtime ?? new Date();
      return new Response(data as Uint8Array<ArrayBuffer>, {
        headers: {
          "Content-Type": customEmoji.type,
          "Content-Length": fileInfo.size.toString(),
          "Cache-Control": "public, max-age=31536000, immutable",
          "Last-Modified": mtime.toUTCString(),
          "ETag": `"${mtime.getTime().toString(36)}${
            fileInfo.size.toString(36)
          }"`,
        },
      });
    }
    if (this.compatMode) {
      const bot = this.#firstBot();
      if (bot == null) return new Response("Not Found", { status: 404 });
      return await app.fetch(request, { bot, contextData });
    }
    return await multiApp.fetch(request, {
      instance: this as InstanceImpl<unknown>,
      contextData,
    });
  }

  /**
   * The web page URL of a bot hosted on the instance.  A compatible
   * (single-bot) instance serves its bot at the web root; a multi-bot
   * instance serves each bot under a path derived from its username.
   * @param bot The bot to get the web page URL of.
   * @param origin The origin of the URL.
   * @returns The web page URL of the bot.
   */
  getBotWebUrl(bot: BotImpl<TContextData>, origin: string | URL): URL {
    return new URL(
      this.compatMode ? "/" : `/@${encodeURIComponent(bot.username)}`,
      origin,
    );
  }

  /**
   * The web permalink of a message published by a bot hosted on
   * the instance.
   * @param bot The bot that published the message.
   * @param id The UUID of the message.
   * @param origin The origin of the URL.
   * @returns The web permalink of the message.
   */
  getMessageWebUrl(
    bot: BotImpl<TContextData>,
    id: string,
    origin: string | URL,
  ): URL {
    return new URL(
      this.compatMode
        ? `/message/${id}`
        : `/@${encodeURIComponent(bot.username)}/${id}`,
      origin,
    );
  }
}
