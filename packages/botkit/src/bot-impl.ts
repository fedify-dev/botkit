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
  generateCryptoKeyPair,
  type InboxContext,
  type NodeInfo,
  Object,
  type PageItems,
  type Recipient,
  type RequestContext,
  type Software,
  Update,
} from "@fedify/fedify";
import {
  Accept,
  type Activity,
  type Actor,
  Announce,
  type Application,
  Article,
  ChatMessage,
  Create,
  type CryptographicKey,
  Emoji as APEmoji,
  EmojiReact,
  Endpoints,
  Follow,
  Image,
  isActor,
  Like as RawLike,
  Link,
  Mention,
  Note,
  PropertyValue,
  PUBLIC_COLLECTION,
  Question,
  Reject,
  Service,
  Undo,
} from "@fedify/fedify/vocab";
import { getLogger } from "@logtape/logtape";
import mimeDb from "mime-db";
import fs from "node:fs/promises";
import { getXForwardedRequest } from "x-forwarded-fetch";
import metadata from "../deno.json" with { type: "json" };
import type { Bot, CreateBotOptions, PagesOptions } from "./bot.ts";
import {
  type CustomEmoji,
  type DeferredCustomEmoji,
  type Emoji,
  isEmoji,
} from "./emoji.ts";
import type {
  AcceptEventHandler,
  FollowEventHandler,
  LikeEventHandler,
  MentionEventHandler,
  MessageEventHandler,
  QuoteEventHandler,
  ReactionEventHandler,
  RejectEventHandler,
  ReplyEventHandler,
  SharedMessageEventHandler,
  UndoneReactionEventHandler,
  UnfollowEventHandler,
  UnlikeEventHandler,
  VoteEventHandler,
} from "./events.ts";
import { FollowRequestImpl } from "./follow-impl.ts";
import {
  createMessage,
  getMessageVisibility,
  isMessageObject,
  isQuoteLink,
  messageClasses,
} from "./message-impl.ts";
import type { Message, MessageClass, SharedMessage } from "./message.ts";
import { app } from "./pages.tsx";
import type { Vote } from "./poll.ts";
import type { Like, Reaction } from "./reaction.ts";
import { KvRepository, type Repository, type Uuid } from "./repository.ts";
import { SessionImpl } from "./session-impl.ts";
import type { Session } from "./session.ts";
import type { Text } from "./text.ts";

export interface BotImplOptions<TContextData>
  extends CreateBotOptions<TContextData> {
  collectionWindow?: number;
  /**
   * An existing federation to use instead of creating a new one.
   * When provided, `skipInitialize` should also be set to `true`.
   */
  federation?: Federation<TContextData>;
  /**
   * Whether to skip the initialization of the federation.
   * Set this to `true` when this bot is managed by an Instance.
   */
  skipInitialize?: boolean;
}

export class BotImpl<TContextData> implements Bot<TContextData> {
  readonly identifier: string;
  readonly class: typeof Service | typeof Application;
  readonly username: string;
  readonly name?: string;
  readonly summary?: Text<"block", TContextData>;
  #summary: { text: string; tags: (Link | Object)[] } | null;
  readonly icon?: URL | Image;
  readonly image?: URL | Image;
  readonly properties: Record<string, Text<"block" | "inline", TContextData>>;
  #properties: { pairs: PropertyValue[]; tags: (Link | Object)[] } | null;
  readonly followerPolicy: "accept" | "reject" | "manual";
  readonly customEmojis: Record<string, CustomEmoji>;
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
  onQuote?: QuoteEventHandler<TContextData>;
  onMessage?: MessageEventHandler<TContextData>;
  onSharedMessage?: SharedMessageEventHandler<TContextData>;
  onLike?: LikeEventHandler<TContextData>;
  onUnlike?: UnlikeEventHandler<TContextData>;
  onReact?: ReactionEventHandler<TContextData>;
  onUnreact?: UndoneReactionEventHandler<TContextData>;
  onVote?: VoteEventHandler<TContextData>;

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
    this.customEmojis = {};
    this.repository = options.repository ?? new KvRepository(options.kv);
    this.software = options.software;
    this.pages = {
      color: "green",
      css: "",
      ...(options.pages ?? {}),
    };
    this.federation = options.federation ?? createFederation<TContextData>({
      kv: options.kv,
      queue: options.queue,
      userAgent: {
        software: `BotKit/${metadata.version}`,
      },
    });
    this.behindProxy = options.behindProxy ?? false;
    this.collectionWindow = options.collectionWindow ?? 50;
    if (!options.skipInitialize) {
      this.initialize();
    }
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
    this.federation.setObjectDispatcher(
      APEmoji,
      "/ap/emoji/{name}",
      this.dispatchEmoji.bind(this),
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
  ): Promise<{ text: string; tags: (Link | Object)[] } | null> {
    if (this.summary == null) return null;
    if (this.#summary == null) {
      let summary = "";
      const tags: (Link | Object)[] = [];
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
  ): Promise<{ pairs: PropertyValue[]; tags: (Link | Object)[] }> {
    if (this.#properties != null) return this.#properties;
    const pairs: PropertyValue[] = [];
    const tags: (Link | Object)[] = [];
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
          (t instanceof Link
            ? tag instanceof Link && t.href?.href === tag.href?.href
            : tag instanceof Object && t.id?.href === tag.id?.href)
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

  dispatchEmoji(
    ctx: Context<TContextData>,
    values: { name: string },
  ): APEmoji | null {
    const customEmoji = this.customEmojis[values.name];
    if (customEmoji == null) return null;
    return this.getEmoji(ctx, values.name, customEmoji);
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
        object instanceof Note || object instanceof Question) ||
      object.attributionId?.href !== create.actorId?.href
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
      this.onVote != null &&
      object instanceof Note && replyTarget?.type === "object" &&
      // @ts-ignore: replyTarget.class satisfies (typeof messageClasses)[number]
      messageClasses.includes(replyTarget.class) &&
      object.name != null
    ) {
      if (
        create.actorId == null || create.actorId.href === session.actorId.href
      ) {
        return;
      }
      const actorId = create.actorId;
      const actor = await create.getActor(ctx);
      if (actor == null) return;
      const messageId = replyTarget.values.id as Uuid;
      const pollMessage = await this.repository.getMessage(messageId);
      if (!(pollMessage instanceof Create)) return;
      const question = await pollMessage.getObject(ctx);
      if (
        !(question instanceof Question) || question.endTime == null ||
        Temporal.Instant.compare(question.endTime, Temporal.Now.instant()) < 0
      ) {
        return;
      }
      const optionNotes: Note[] = [];
      const options: string[] = [];
      for await (const note of question.getInclusiveOptions(ctx)) {
        if (!(note instanceof Note)) continue;
        optionNotes.push(note);
        if (note.name != null) options.push(note.name.toString());
      }
      const multiple = options.length > 0;
      for await (const note of question.getExclusiveOptions(ctx)) {
        if (!(note instanceof Note)) continue;
        optionNotes.push(note);
        if (note.name != null) options.push(note.name.toString());
      }
      const option = object.name.toString();
      if (!options.includes(option)) return;
      let updatedQuestion: Question = question;
      let updatedPollMessage = pollMessage;
      await this.repository.vote(messageId, actorId, option);
      await this.repository.updateMessage(
        replyTarget.values.id as Uuid,
        async () => {
          const votes = await this.repository.countVotes(messageId);
          const updatedOptionNotes: Note[] = [...optionNotes];
          let i = 0;
          for (const note of updatedOptionNotes) {
            if (note.name != null) {
              const replies = await note.getReplies(ctx);
              if (replies != null && replies.totalItems != null) {
                updatedOptionNotes[i] = note.clone({
                  replies: replies.clone({
                    totalItems: votes[note.name.toString()],
                  }),
                });
              }
            }
            i++;
          }
          updatedQuestion = question.clone({
            inclusiveOptions: multiple ? updatedOptionNotes : [],
            exclusiveOptions: !multiple ? updatedOptionNotes : [],
            voters: await this.repository.countVoters(messageId),
          });
          return updatedPollMessage = pollMessage.clone({
            object: updatedQuestion,
          });
        },
      );
      const message = await createMessage(updatedQuestion, session, {});
      const vote: Vote<TContextData> = {
        raw: object,
        actor,
        message,
        poll: {
          multiple,
          options,
          endTime: question.endTime,
        },
        option,
      };
      await this.onVote(session, vote);
      const update = new Update({
        id: new URL(
          `#update-votes/${crypto.randomUUID()}`,
          updatedQuestion.id ?? ctx.origin,
        ),
        actor: ctx.getActorUri(this.identifier),
        object: updatedPollMessage.id,
        tos: updatedPollMessage.toIds,
        ccs: updatedPollMessage.ccIds,
      });
      if (message.visibility === "direct") {
        await ctx.forwardActivity(this, [...message.mentions], {
          skipIfUnsigned: true,
          excludeBaseUris: [new URL(ctx.origin)],
        });
        await ctx.sendActivity(
          this,
          [...message.mentions],
          update,
          { excludeBaseUris: [new URL(ctx.origin)] },
        );
      } else {
        await ctx.forwardActivity(this, "followers", {
          skipIfUnsigned: true,
          preferSharedInbox: true,
          excludeBaseUris: [new URL(ctx.origin)],
        });
        await ctx.sendActivity(
          this,
          "followers",
          update,
          {
            preferSharedInbox: true,
            excludeBaseUris: [new URL(ctx.origin)],
          },
        );
      }
      return;
    }
    if (
      this.onReply != null &&
      replyTarget?.type === "object" &&
      // @ts-ignore: replyTarget.class satisfies (typeof messageClasses)[number]
      messageClasses.includes(replyTarget.class)
    ) {
      const message = await getMessage();
      if (
        message.visibility === "public" || message.visibility === "unlisted"
      ) {
        await ctx.forwardActivity(this, "followers", {
          skipIfUnsigned: true,
          preferSharedInbox: true,
          excludeBaseUris: [new URL(ctx.origin)],
        });
      }
      await this.onReply(session, message);
    }
    let quoteUrl: URL | null = null;
    // FIXME: eliminate this duplication
    for await (const tag of object.getTags(ctx)) {
      if (tag instanceof Link && isQuoteLink(tag)) {
        quoteUrl = tag.href;
        break;
      }
    }
    if (quoteUrl == null) quoteUrl = object.quoteUrl;
    const quoteTarget = ctx.parseUri(quoteUrl);
    if (
      this.onQuote != null &&
      quoteTarget?.type === "object" &&
      // @ts-ignore: quoteTarget.class satisfies (typeof messageClasses)[number]
      messageClasses.includes(quoteTarget.class)
    ) {
      const message = await getMessage();
      if (
        message.visibility === "public" || message.visibility === "unlisted"
      ) {
        await ctx.forwardActivity(this, "followers", {
          skipIfUnsigned: true,
          preferSharedInbox: true,
          excludeBaseUris: [new URL(ctx.origin)],
        });
      }
      await this.onQuote(session, message);
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
    if (like.name != null) return this.onReacted(ctx, like);
    if (this.onLike == null) return;
    const sessionAndLike = await this.#parseLike(ctx, like);
    if (sessionAndLike == null) return;
    const { session, like: likeObject } = sessionAndLike;
    await this.onLike(session, likeObject);
  }

  async onUnliked(ctx: InboxContext<TContextData>, undo: Undo): Promise<void> {
    const like = await undo.getObject(ctx);
    if (!(like instanceof RawLike)) return;
    if (like.name != null) return this.onUnreacted(ctx, undo);
    if (this.onUnlike == null) return;
    if (undo.actorId?.href !== like.actorId?.href) return;
    const sessionAndLike = await this.#parseLike(ctx, like);
    if (sessionAndLike == null) return;
    const { session, like: likeObject } = sessionAndLike;
    await this.onUnlike(session, likeObject);
  }

  async #parseReaction(
    ctx: InboxContext<TContextData>,
    react: EmojiReact | RawLike,
  ): Promise<
    | { session: Session<TContextData>; reaction: Reaction<TContextData> }
    | undefined
  > {
    if (react.id == null || react.actorId == null || react.name == null) {
      return undefined;
    }
    let emoji: Emoji | APEmoji | undefined;
    if (isEmoji(react.name)) {
      emoji = react.name;
    } else if (
      typeof react.name === "string" && react.name.startsWith(":") &&
      react.name.endsWith(":")
    ) {
      for await (const tag of react.getTags(ctx)) {
        if (tag instanceof APEmoji && tag.name === react.name) {
          emoji = tag;
          break;
        }
      }
    }
    if (emoji == null) return undefined;
    const objectUri = ctx.parseUri(react.objectId);
    let object: Object | null = null;
    if (
      objectUri?.type === "object" &&
      // deno-lint-ignore no-explicit-any
      messageClasses.includes(objectUri.class as any)
    ) {
      const msg = await this.repository.getMessage(objectUri.values.id as Uuid);
      if (msg instanceof Create) object = await msg.getObject(ctx);
    } else {
      object = await react.getObject(ctx);
    }
    if (!isMessageObject(object)) return undefined;
    const session = this.getSession(ctx);
    const actor = react.actorId.href == session.actorId.href
      ? await session.getActor()
      : await react.getActor(ctx);
    if (actor == null) return;
    const message = await createMessage(object, session, {});
    return {
      session,
      reaction: {
        raw: react,
        id: react.id,
        actor,
        message,
        emoji,
      },
    };
  }

  async onReacted(
    ctx: InboxContext<TContextData>,
    react: EmojiReact | RawLike,
  ): Promise<void> {
    if (this.onReact == null) return;
    const sessionAndReaction = await this.#parseReaction(ctx, react);
    if (sessionAndReaction == null) return;
    const { session, reaction } = sessionAndReaction;
    await this.onReact(session, reaction);
  }

  async onUnreacted(
    ctx: InboxContext<TContextData>,
    undo: Undo,
  ): Promise<void> {
    if (this.onUnreact == null) return;
    const react = await undo.getObject(ctx);
    if (!(react instanceof EmojiReact || react instanceof RawLike)) return;
    if (undo.actorId?.href !== react.actorId?.href) return;
    const sessionAndReaction = await this.#parseReaction(ctx, react);
    if (sessionAndReaction == null) return;
    const { session, reaction } = sessionAndReaction;
    await this.onUnreact(session, reaction);
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
    const match = /^\/emojis\/([a-z0-9-_]+)(?:$|\.)/.exec(url.pathname);
    if (match != null) {
      const customEmoji = this.customEmojis[match[1]];
      if (customEmoji == null || !("file" in customEmoji)) {
        return new Response("Not Found", { status: 404 });
      }
      let file: fs.FileHandle;
      try {
        file = await fs.open(customEmoji.file, "r");
      } catch (error) {
        if (
          typeof error === "object" && error != null && "code" in error &&
          error.code === "ENOENT"
        ) {
          return new Response("Not Found", { status: 404 });
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
    return await app.fetch(request, { bot: this, contextData });
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
}
