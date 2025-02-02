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
  Accept,
  type Activity,
  type Actor,
  Announce,
  type Application,
  Article,
  ChatMessage,
  type Context,
  Create,
  createFederation,
  Endpoints,
  type Federation,
  Follow,
  generateCryptoKeyPair,
  Image,
  type InboxContext,
  isActor,
  Like as RawLike,
  type Link,
  Mention,
  type NodeInfo,
  Note,
  type Object,
  type PageItems,
  PropertyValue,
  Question,
  type Recipient,
  type RequestContext,
  Service,
  type Software,
  Undo,
} from "@fedify/fedify";
import {
  type CryptographicKey,
  PUBLIC_COLLECTION,
  Reject,
} from "@fedify/fedify/vocab";
import { getXForwardedRequest } from "@hongminhee/x-forwarded-fetch";
import { getLogger } from "@logtape/logtape";
import metadata from "../deno.json" with { type: "json" };
import type { Bot, CreateBotOptions, PagesOptions } from "./bot.ts";
import type {
  AcceptEventHandler,
  FollowEventHandler,
  LikeEventHandler,
  MentionEventHandler,
  MessageEventHandler,
  RejectEventHandler,
  ReplyEventHandler,
  SharedMessageEventHandler,
  UnfollowEventHandler,
  UnlikeEventHandler,
} from "./events.ts";
import { FollowRequestImpl } from "./follow-impl.ts";
import {
  createMessage,
  getMessageVisibility,
  isMessageObject,
  messageClasses,
} from "./message-impl.ts";
import type { Message, MessageClass, SharedMessage } from "./message.ts";
import { app } from "./pages.tsx";
import type { Like } from "./reaction.ts";
import { KvRepository, type Repository, type Uuid } from "./repository.ts";
import { SessionImpl } from "./session-impl.ts";
import type { Session } from "./session.ts";
import type { Text } from "./text.ts";

export interface BotImplOptions<TContextData>
  extends CreateBotOptions<TContextData> {
  collectionWindow?: number;
}

export class BotImpl<TContextData> implements Bot<TContextData> {
  readonly identifier: string;
  readonly class: typeof Service | typeof Application;
  readonly username: string;
  readonly name?: string;
  readonly summary?: Text<"block", TContextData>;
  #summary: { text: string; tags: Link[] } | null;
  readonly icon?: URL | Image;
  readonly image?: URL | Image;
  readonly properties: Record<string, Text<"block" | "inline", TContextData>>;
  #properties: { pairs: PropertyValue[]; tags: Link[] } | null;
  readonly followerPolicy: "accept" | "reject" | "manual";
  readonly repository: Repository;
  readonly software?: Software;
  readonly behindProxy: boolean;
  readonly pages: Required<PagesOptions>;
  readonly collectionWindow: number;
  readonly federation: Federation<TContextData>;

  onFollow?: FollowEventHandler<TContextData>;
  onUnfollow?: UnfollowEventHandler<TContextData>;
  onAcceptFollow?: AcceptEventHandler<TContextData>;
  onRejectFollow?: RejectEventHandler<TContextData>;
  onMention?: MentionEventHandler<TContextData>;
  onReply?: ReplyEventHandler<TContextData>;
  onMessage?: MessageEventHandler<TContextData>;
  onSharedMessage?: SharedMessageEventHandler<TContextData>;
  onLike?: LikeEventHandler<TContextData>;
  onUnlike?: UnlikeEventHandler<TContextData>;

  constructor(options: BotImplOptions<TContextData>) {
    this.identifier = options.identifier ?? "bot";
    this.class = options.class ?? Service;
    this.username = options.username;
    this.name = options.name;
    this.summary = options.summary;
    this.#summary = null;
    this.icon = options.icon;
    this.image = options.image;
    this.properties = options.properties ?? {};
    this.#properties = null;
    this.followerPolicy = options.followerPolicy ?? "accept";
    this.repository = options.repository ?? new KvRepository(options.kv);
    this.software = options.software;
    this.pages = {
      color: "green",
      css: "",
      ...(options.pages ?? {}),
    };
    this.federation = createFederation<TContextData>({
      kv: options.kv,
      queue: options.queue,
      userAgent: {
        software: `BotKit/${metadata.version}`,
      },
    });
    this.behindProxy = options.behindProxy ?? false;
    this.collectionWindow = options.collectionWindow ?? 50;
    this.initialize();
  }

  initialize(): void {
    this.federation
      .setActorDispatcher(
        "/ap/actor/{identifier}",
        this.dispatchActor.bind(this),
      )
      .mapHandle(this.mapHandle.bind(this))
      .setKeyPairsDispatcher(this.dispatchActorKeyPairs.bind(this));
    this.federation
      .setFollowersDispatcher(
        "/ap/actor/{identifier}/followers",
        this.dispatchFollowers.bind(this),
      )
      .setFirstCursor(this.getFollowersFirstCursor.bind(this))
      .setCounter(this.countFollowers.bind(this));
    this.federation
      .setOutboxDispatcher(
        "/ap/actor/{identifier}/outbox",
        this.dispatchOutbox.bind(this),
      )
      .setFirstCursor(this.getOutboxFirstCursor.bind(this))
      .setCounter(this.countOutbox.bind(this));
    this.federation
      .setObjectDispatcher(
        Follow,
        "/ap/follow/{id}",
        this.dispatchFollow.bind(this),
      )
      .authorize(this.authorizeFollow.bind(this));
    this.federation.setObjectDispatcher(
      Create,
      "/ap/create/{id}",
      this.dispatchCreate.bind(this),
    );
    this.federation.setObjectDispatcher(
      Article,
      "/ap/article/{id}",
      (ctx, values) => this.dispatchMessage(Article, ctx, values.id),
    );
    this.federation.setObjectDispatcher(
      ChatMessage,
      "/ap/chat-message/{id}",
      (ctx, values) => this.dispatchMessage(ChatMessage, ctx, values.id),
    );
    this.federation.setObjectDispatcher(
      Note,
      "/ap/note/{id}",
      (ctx, values) => this.dispatchMessage(Note, ctx, values.id),
    );
    this.federation.setObjectDispatcher(
      Question,
      "/ap/question/{id}",
      (ctx, values) => this.dispatchMessage(Question, ctx, values.id),
    );
    this.federation.setObjectDispatcher(
      Announce,
      "/ap/announce/{id}",
      this.dispatchAnnounce.bind(this),
    );
    this.federation
      .setInboxListeners("/ap/actor/{identifier}/inbox", "/ap/inbox")
      .on(Follow, this.onFollowed.bind(this))
      .on(Undo, async (ctx, undo) => {
        const object = await undo.getObject(ctx);
        if (object instanceof Follow) await this.onUnfollowed(ctx, undo);
        else if (object instanceof RawLike) await this.onUnliked(ctx, undo);
        else {
          const logger = getLogger(["botkit", "bot", "inbox"]);
          logger.warn(
            "The Undo object {undoId} is not about Follow or Like: {object}.",
            { undoId: undo.id?.href, object },
          );
        }
      })
      .on(Accept, this.onFollowAccepted.bind(this))
      .on(Reject, this.onFollowRejected.bind(this))
      .on(Create, this.onCreated.bind(this))
      .on(Announce, this.onAnnounced.bind(this))
      .on(RawLike, this.onLiked.bind(this))
      .setSharedKeyDispatcher(this.dispatchSharedKey.bind(this));
    if (this.software != null) {
      this.federation.setNodeInfoDispatcher(
        "/nodeinfo/2.1",
        this.dispatchNodeInfo.bind(this),
      );
    }
  }

  async getActorSummary(
    session: Session<TContextData>,
  ): Promise<{ text: string; tags: Link[] } | null> {
    if (this.summary == null) return null;
    if (this.#summary == null) {
      let summary = "";
      const tags: Link[] = [];
      for await (const chunk of this.summary.getHtml(session)) {
        summary += chunk;
      }
      for await (const tag of this.summary.getTags(session)) {
        tags.push(tag);
      }
      return this.#summary = { text: summary, tags };
    }
    return this.#summary;
  }

  async getActorProperties(
    session: Session<TContextData>,
  ): Promise<{ pairs: PropertyValue[]; tags: Link[] }> {
    if (this.#properties != null) return this.#properties;
    const pairs: PropertyValue[] = [];
    const tags: Link[] = [];
    for (const name in this.properties) {
      const value = this.properties[name];
      const pair = new PropertyValue({
        name,
        value: (await Array.fromAsync(value.getHtml(session))).join(""),
      });
      pairs.push(pair);
      for await (const tag of value.getTags(session)) {
        tags.push(tag);
      }
    }
    return this.#properties = { pairs, tags };
  }

  async dispatchActor(
    ctx: Context<TContextData>,
    identifier: string,
  ): Promise<Actor | null> {
    if (this.identifier !== identifier) return null;
    const session = this.getSession(ctx);
    const summary = await this.getActorSummary(session);
    const { pairs, tags } = await this.getActorProperties(session);
    const allTags = summary == null ? tags : [...tags, ...summary.tags];
    const keyPairs = await ctx.getActorKeyPairs(identifier);
    return new this.class({
      id: ctx.getActorUri(identifier),
      preferredUsername: this.username,
      name: this.name,
      summary: summary == null ? null : summary.text,
      attachments: pairs,
      tags: allTags.filter((tag, i) =>
        allTags.findIndex((t) =>
          t.name?.toString() === tag.name?.toString() &&
          t.href?.href === tag.href?.href
        ) === i
      ),
      icon: this.icon == null
        ? null
        : this.icon instanceof Image
        ? this.icon
        : new Image({ url: this.icon }),
      image: this.image == null
        ? null
        : this.image instanceof Image
        ? this.image
        : new Image({ url: this.image }),
      inbox: ctx.getInboxUri(identifier),
      endpoints: new Endpoints({
        sharedInbox: ctx.getInboxUri(),
      }),
      followers: ctx.getFollowersUri(identifier),
      outbox: ctx.getOutboxUri(identifier),
      publicKey: keyPairs[0].cryptographicKey,
      assertionMethods: keyPairs.map((pair) => pair.multikey),
      url: new URL("/", ctx.origin),
    });
  }

  mapHandle(_ctx: Context<TContextData>, username: string): string | null {
    return username === this.username ? this.identifier : null;
  }

  async dispatchActorKeyPairs(
    _ctx: Context<TContextData>,
    identifier: string,
  ): Promise<CryptoKeyPair[]> {
    if (identifier !== this.identifier) return [];
    let keyPairs = await this.repository.getKeyPairs();
    if (keyPairs == null) {
      const rsa = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
      const ed25519 = await generateCryptoKeyPair("Ed25519");
      keyPairs = [rsa, ed25519];
      await this.repository.setKeyPairs(keyPairs);
    }
    return keyPairs;
  }

  async dispatchFollowers(
    _ctx: Context<TContextData>,
    identifier: string,
    cursor: string | null,
  ): Promise<PageItems<Recipient> | null> {
    if (identifier !== this.identifier) return null;
    let followers: AsyncIterable<Actor>;
    let nextCursor: string | null;
    if (cursor == null) {
      followers = this.repository.getFollowers();
      nextCursor = null;
    } else {
      const offset = cursor.match(/^\d+$/) ? parseInt(cursor) : 0;
      followers = this.repository.getFollowers({
        offset,
        limit: this.collectionWindow,
      });
      nextCursor = (offset + this.collectionWindow).toString();
    }
    const items: Recipient[] = [];
    let i = 0;
    for await (const follower of followers) {
      items.push(follower);
      i++;
    }
    if (i < this.collectionWindow) nextCursor = null;
    return { items, nextCursor };
  }

  getFollowersFirstCursor(
    _ctx: Context<TContextData>,
    identifier: string,
  ): string | null {
    if (identifier !== this.identifier) return null;
    return "0";
  }

  async countFollowers(
    _ctx: Context<TContextData>,
    identifier: string,
  ): Promise<number | null> {
    if (identifier !== this.identifier) return null;
    return await this.repository.countFollowers();
  }

  async getPermissionChecker(
    ctx: RequestContext<TContextData>,
  ): Promise<(object: Object) => boolean> {
    let owner: Actor | null;
    try {
      owner = await ctx.getSignedKeyOwner();
    } catch {
      owner = null;
    }
    let follower = false;
    const ownerUri = owner?.id;
    if (ownerUri != null) {
      follower = await this.repository.hasFollower(ownerUri);
    }
    const followersUri = ctx.getFollowersUri(this.identifier);
    return (object: Object): boolean => {
      const recipients = [...object.toIds, ...object.ccIds].map((u) => u.href);
      if (recipients.includes(PUBLIC_COLLECTION.href)) return true;
      if (recipients.includes(followersUri.href) && follower) return true;
      return ownerUri == null ? false : recipients.includes(ownerUri.href);
    };
  }

  async dispatchOutbox(
    ctx: RequestContext<TContextData>,
    identifier: string,
    cursor: string | null,
  ): Promise<PageItems<Activity> | null> {
    if (identifier !== this.identifier) return null;
    const activities = this.repository.getMessages({
      order: "newest",
      until: cursor == null || cursor === ""
        ? undefined
        : Temporal.Instant.from(cursor),
      limit: cursor == null ? undefined : this.collectionWindow + 1,
    });
    const items: Activity[] = [];
    const isVisible = await this.getPermissionChecker(ctx);
    let i = 0;
    let nextPublished: Temporal.Instant | null = null;
    for await (const activity of activities) {
      if (cursor != null && i >= this.collectionWindow) {
        nextPublished = activity.published ??
          (await activity.getObject())?.published ?? null;
        break;
      }
      if (isVisible(activity)) items.push(activity);
      i++;
    }
    return { items, nextCursor: nextPublished?.toString() ?? null };
  }

  getOutboxFirstCursor(
    _ctx: Context<TContextData>,
    identifier: string,
  ): string | null {
    if (identifier !== this.identifier) return null;
    return "";
  }

  async countOutbox(
    _ctx: Context<TContextData>,
    identifier: string,
  ): Promise<number | null> {
    if (identifier !== this.identifier) return null;
    return await this.repository.countMessages();
  }

  async dispatchFollow(
    _ctx: RequestContext<TContextData>,
    values: { id: string },
  ): Promise<Follow | null> {
    const id = values.id as Uuid;
    const follow = await this.repository.getSentFollow(id);
    return follow ?? null;
  }

  async authorizeFollow(
    _ctx: RequestContext<TContextData>,
    values: { id: string },
    _signedKey: CryptographicKey | null,
    signedKeyOwner: Actor | null,
  ): Promise<boolean> {
    if (signedKeyOwner == null || signedKeyOwner.id == null) return false;
    const id = values.id as Uuid;
    const follow = await this.repository.getSentFollow(id);
    if (follow == null) return false;
    return signedKeyOwner.id.href === follow.objectId?.href ||
      signedKeyOwner.id.href === follow.actorId?.href;
  }

  async dispatchCreate(
    ctx: RequestContext<TContextData>,
    values: { id: string },
  ): Promise<Create | null> {
    const activity = await this.repository.getMessage(values.id as Uuid);
    if (!(activity instanceof Create)) return null;
    const isVisible = await this.getPermissionChecker(ctx);
    return isVisible(activity) ? activity : null;
  }

  async dispatchMessage<T extends MessageClass>(
    // deno-lint-ignore no-explicit-any
    cls: new (values: any) => T,
    ctx: Context<TContextData> | RequestContext<TContextData>,
    id: string,
  ): Promise<T | null> {
    const activity = await this.repository.getMessage(id as Uuid);
    if (!(activity instanceof Create)) return null;
    if ("request" in ctx) {
      // TODO: Split this method into two
      const isVisible = await this.getPermissionChecker(ctx);
      if (!isVisible(activity)) return null;
    }
    const object = await activity.getObject(ctx);
    if (object == null || !(object instanceof cls)) return null;
    return object;
  }

  async dispatchAnnounce(
    ctx: RequestContext<TContextData>,
    values: { id: string },
  ): Promise<Announce | null> {
    const activity = await this.repository.getMessage(values.id as Uuid);
    if (!(activity instanceof Announce)) return null;
    const isVisible = await this.getPermissionChecker(ctx);
    return isVisible(activity) ? activity : null;
  }

  dispatchSharedKey(_ctx: Context<TContextData>): { identifier: string } {
    return { identifier: this.identifier };
  }

  async onFollowed(
    ctx: InboxContext<TContextData>,
    follow: Follow,
  ): Promise<void> {
    const botUri = ctx.getActorUri(this.identifier);
    if (
      follow.actorId?.href === botUri.href ||
      follow.objectId?.href !== botUri.href
    ) {
      return;
    }
    const follower = await follow.getActor({
      contextLoader: ctx.contextLoader,
      documentLoader: ctx.documentLoader,
      suppressError: true,
    });
    if (follower == null || follower.id == null) return;
    const session = this.getSession(ctx);
    const followRequest = new FollowRequestImpl<TContextData>(
      session,
      follow,
      follower,
    );
    await this.onFollow?.(session, followRequest);
    if (followRequest.state === "pending") {
      if (this.followerPolicy === "accept") await followRequest.accept();
      else if (this.followerPolicy === "reject") await followRequest.reject();
    }
  }

  async onUnfollowed(
    ctx: InboxContext<TContextData>,
    undo: Undo,
  ): Promise<void> {
    const followId = undo.objectId;
    if (followId == null || undo.actorId == null) return;
    const follower = await this.repository.removeFollower(
      followId,
      undo.actorId,
    );
    if (this.onUnfollow != null && follower != null) {
      const session = this.getSession(ctx);
      await this.onUnfollow(session, follower);
    }
  }

  async onFollowAccepted(
    ctx: InboxContext<TContextData>,
    accept: Accept,
  ): Promise<void> {
    const parsedObj = ctx.parseUri(accept.objectId);
    if (parsedObj?.type !== "object" || parsedObj.class !== Follow) return;
    const follow = await this.repository.getSentFollow(
      parsedObj.values.id as Uuid,
    );
    if (follow == null) return;
    const followee = await follow.getObject(ctx);
    if (
      !isActor(followee) || followee.id == null ||
      followee.id.href !== accept.actorId?.href
    ) {
      return;
    }
    await this.repository.addFollowee(followee.id, follow);
    if (this.onAcceptFollow != null) {
      const session = this.getSession(ctx);
      await this.onAcceptFollow(session, followee);
    }
  }

  async onFollowRejected(
    ctx: InboxContext<TContextData>,
    reject: Reject,
  ): Promise<void> {
    const parsedObj = ctx.parseUri(reject.objectId);
    if (parsedObj?.type !== "object" || parsedObj.class !== Follow) return;
    const id = parsedObj.values.id as Uuid;
    const follow = await this.repository.getSentFollow(id);
    if (follow == null) return;
    const followee = await follow.getObject(ctx);
    if (
      !isActor(followee) || followee.id == null ||
      followee.id.href !== reject.actorId?.href
    ) {
      return;
    }
    await this.repository.removeSentFollow(id);
    if (this.onRejectFollow != null) {
      const session = this.getSession(ctx);
      await this.onRejectFollow(session, followee);
    }
  }

  async onCreated(
    ctx: InboxContext<TContextData>,
    create: Create,
  ): Promise<void> {
    const object = await create.getObject(ctx);
    if (
      !(object instanceof Article || object instanceof ChatMessage ||
        object instanceof Note || object instanceof Question)
    ) {
      return;
    }
    const session = this.getSession(ctx);
    let messageCache: Message<MessageClass, TContextData> | null = null;
    const getMessage = async () => {
      if (messageCache != null) return messageCache;
      return messageCache = await createMessage(object, session, {});
    };
    const replyTarget = ctx.parseUri(object.replyTargetId);
    if (
      this.onReply != null &&
      replyTarget?.type === "object" &&
      // @ts-ignore: replyTarget.class satisfies (typeof messageClasses)[number]
      messageClasses.includes(replyTarget.class)
    ) {
      const message = await getMessage();
      await ctx.forwardActivity(this, "followers");
      await this.onReply(session, message);
    }
    for await (const tag of object.getTags(ctx)) {
      if (
        tag instanceof Mention && tag.href != null && this.onMention != null
      ) {
        const parsed = ctx.parseUri(tag.href);
        if (
          parsed?.type === "actor" && parsed.identifier === this.identifier
        ) {
          await this.onMention(session, await getMessage());
          break;
        }
      }
    }
    if (this.onMessage != null) {
      await this.onMessage(session, await getMessage());
    }
  }

  async onAnnounced(
    ctx: InboxContext<TContextData>,
    announce: Announce,
  ): Promise<void> {
    if (
      this.onSharedMessage == null || announce.id == null ||
      announce.actorId == null
    ) return;
    const objectUri = ctx.parseUri(announce.objectId);
    let object: Object | null = null;
    if (
      objectUri?.type === "object" &&
      // deno-lint-ignore no-explicit-any
      messageClasses.includes(objectUri.class as any)
    ) {
      const msg = await this.repository.getMessage(objectUri.values.id as Uuid);
      if (msg instanceof Create) object = await msg.getObject(ctx);
    } else {
      object = await announce.getObject(ctx);
    }
    if (!isMessageObject(object)) return;
    const session = this.getSession(ctx);
    const actor = announce.actorId.href == session.actorId.href
      ? await session.getActor()
      : await announce.getActor(ctx);
    if (actor == null) return;
    const original = await createMessage(object, session, {});
    const sharedMessage: SharedMessage<MessageClass, TContextData> = {
      raw: announce,
      id: announce.id,
      actor,
      visibility: getMessageVisibility(announce.toIds, announce.ccIds, actor),
      original,
    };
    await this.onSharedMessage(session, sharedMessage);
  }

  async #parseLike(
    ctx: InboxContext<TContextData>,
    like: RawLike,
  ): Promise<
    { session: Session<TContextData>; like: Like<TContextData> } | undefined
  > {
    if (like.id == null || like.actorId == null) return undefined;
    const objectUri = ctx.parseUri(like.objectId);
    let object: Object | null = null;
    if (
      objectUri?.type === "object" &&
      // deno-lint-ignore no-explicit-any
      messageClasses.includes(objectUri.class as any)
    ) {
      const msg = await this.repository.getMessage(objectUri.values.id as Uuid);
      if (msg instanceof Create) object = await msg.getObject(ctx);
    } else {
      object = await like.getObject(ctx);
    }
    if (!isMessageObject(object)) return undefined;
    const session = this.getSession(ctx);
    const actor = like.actorId.href == session.actorId.href
      ? await session.getActor()
      : await like.getActor(ctx);
    if (actor == null) return;
    const message = await createMessage(object, session, {});
    return {
      session,
      like: {
        raw: like,
        id: like.id,
        actor,
        message,
      },
    };
  }

  async onLiked(ctx: InboxContext<TContextData>, like: RawLike): Promise<void> {
    if (this.onLike == null) return;
    const sessionAndLike = await this.#parseLike(ctx, like);
    if (sessionAndLike == null) return;
    const { session, like: likeObject } = sessionAndLike;
    await this.onLike(session, likeObject);
  }

  async onUnliked(ctx: InboxContext<TContextData>, undo: Undo): Promise<void> {
    if (this.onUnlike == null) return;
    const like = await undo.getObject(ctx);
    if (!(like instanceof RawLike)) return;
    if (undo.actorId?.href !== like.actorId?.href) return;
    const sessionAndLike = await this.#parseLike(ctx, like);
    if (sessionAndLike == null) return;
    const { session, like: likeObject } = sessionAndLike;
    await this.onUnlike(session, likeObject);
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
          total: 1,
          activeMonth: 1, // FIXME
          activeHalfyear: 1, // FIXME
        },
        localPosts: 0, // FIXME
        localComments: 0,
      },
    };
  }

  getSession(
    origin: string | URL,
    contextData: TContextData,
  ): SessionImpl<TContextData>;
  getSession(origin: string | URL): SessionImpl<TContextData>;
  getSession(context: Context<TContextData>): SessionImpl<TContextData>;

  getSession(
    origin: string | URL | Context<TContextData>,
    contextData?: TContextData,
  ): SessionImpl<TContextData> {
    const ctx = typeof origin === "string" || origin instanceof URL
      ? this.federation.createContext(new URL(origin), contextData!)
      : origin;
    return new SessionImpl(this, ctx);
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
    return await app.fetch(request, { bot: this, contextData });
  }
}
