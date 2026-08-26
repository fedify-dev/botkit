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
import "./temporal.ts";
import {
  type Context,
  type Federation,
  generateCryptoKeyPair,
  type InboxContext,
  type NodeInfo,
  type PageItems,
  type RequestContext,
  type Software,
  type UnverifiedActivityReason,
} from "@fedify/fedify";
import {
  type Accept,
  type Activity,
  type Actor,
  Announce,
  type Application,
  Article,
  ChatMessage,
  Create,
  type Delete,
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
  Object,
  PropertyValue,
  PUBLIC_COLLECTION,
  Question,
  QuoteAuthorization,
  QuoteRequest,
  type QuoteRequest as RawQuoteRequest,
  type Recipient,
  Reject,
  Service,
  type Undo,
  Update,
} from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import type { Bot, CreateBotOptions, PagesOptions } from "./bot.ts";
import type {
  BotDispatcher,
  BotGroup,
  BotProfile,
  CreateBotGroupOptions,
} from "./instance.ts";
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
  QuoteAcceptedEventHandler,
  QuoteEventHandler,
  QuoteRejectedEventHandler,
  QuoteRequestEventHandler,
  QuoteRevokedEventHandler,
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
import { InstanceImpl } from "./instance-impl.ts";
import {
  createMessage,
  getMessageClass,
  getMessageVisibility,
  isMessageObject,
  isQuoteLink,
  messageClasses,
} from "./message-impl.ts";
import type {
  AuthorizedMessage,
  Message,
  MessageClass,
  MessageVisibility,
  SharedMessage,
} from "./message.ts";
import type { Vote } from "./poll.ts";
import { validateQuoteAuthorization } from "./quote-authorization.ts";
import { QuoteRequestImpl } from "./quote-impl.ts";
import { normalizeQuotePolicy, type QuotePolicyOption } from "./quote.ts";
import type { Like, Reaction } from "./reaction.ts";
import {
  ActorScopedRepository,
  KvRepository,
  type Repository,
  type RepositoryGetFollowersOptions,
  type RepositoryGetMessagesOptions,
  type Uuid,
} from "./repository.ts";
import { parseLocalUri } from "./uri.ts";
import { SessionImpl } from "./session-impl.ts";
import type { Session } from "./session.ts";
import type { Text } from "./text.ts";

const logger = getLogger(["botkit", "bot"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): value is Uuid {
  return uuidPattern.test(value);
}

export interface BotImplOptions<TContextData>
  extends CreateBotOptions<TContextData> {
  collectionWindow?: number;

  /**
   * The instance to host the bot on.  If omitted, a dedicated instance is
   * created from the given options, which preserves the single-bot behavior
   * of BotKit 0.4 and earlier.
   */
  instance?: InstanceImpl<TContextData>;

  /**
   * Whether the bot is a transient view of a dynamically resolved bot,
   * which is not registered on the instance.
   */
  transient?: boolean;
}

/**
 * The names of the event handler properties of {@link BotEventHandlers}.
 * @internal
 */
export const botEventHandlerNames = [
  "onFollow",
  "onUnfollow",
  "onAcceptFollow",
  "onRejectFollow",
  "onMention",
  "onReply",
  "onQuote",
  "onQuoteRequest",
  "onQuoteAccepted",
  "onQuoteRejected",
  "onQuoteRevoked",
  "onMessage",
  "onSharedMessage",
  "onLike",
  "onUnlike",
  "onReact",
  "onUnreact",
  "onVote",
] as const;

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
  readonly quotePolicy: QuotePolicyOption;
  readonly repository: ActorScopedRepository;

  /**
   * The instance hosting the bot.  It owns the shared infrastructure:
   * the Fedify federation, the key–value store, the message queue,
   * the root repository, and HTTP handling.
   */
  readonly instance: InstanceImpl<TContextData>;

  get customEmojis(): Record<string, CustomEmoji> {
    return this.instance.customEmojis;
  }

  get software(): Software | undefined {
    return this.instance.software;
  }

  get behindProxy(): boolean {
    return this.instance.behindProxy;
  }

  get pages(): Required<PagesOptions> {
    return this.instance.pages;
  }

  get collectionWindow(): number {
    return this.instance.collectionWindow;
  }

  get federation(): Federation<TContextData> {
    return this.instance.federation;
  }

  /**
   * The identifier of the bot actor that owns local objects whose URIs are
   * in the legacy (pre-0.5) format, which did not carry the identifier.
   * Legacy URIs can only occur in deployments that hosted a single bot
   * before the upgrade, so they are attributed to that bot.
   */
  get legacyObjectUrisIdentifier(): string | undefined {
    return this.instance.legacyObjectUrisIdentifier;
  }

  onFollow?: FollowEventHandler<TContextData>;
  onUnfollow?: UnfollowEventHandler<TContextData>;
  onAcceptFollow?: AcceptEventHandler<TContextData>;
  onRejectFollow?: RejectEventHandler<TContextData>;
  onMention?: MentionEventHandler<TContextData>;
  onReply?: ReplyEventHandler<TContextData>;
  onQuote?: QuoteEventHandler<TContextData>;
  onQuoteRequest?: QuoteRequestEventHandler<TContextData>;
  onQuoteAccepted?: QuoteAcceptedEventHandler<TContextData>;
  onQuoteRejected?: QuoteRejectedEventHandler<TContextData>;
  onQuoteRevoked?: QuoteRevokedEventHandler<TContextData>;
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
    this.quotePolicy = options.quotePolicy ?? "public";
    this.instance = options.instance ?? new InstanceImpl({
      kv: options.kv,
      // The single-bot deployment may carry data from BotKit 0.4 or
      // earlier; adopt it for this bot before the first repository
      // operation:
      repository: new MigrationGatedRepository(
        options.repository ?? new KvRepository(options.kv),
        this.identifier,
      ),
      queue: options.queue,
      federationOptions: options.federationOptions,
      software: options.software,
      behindProxy: options.behindProxy,
      pages: options.pages,
      collectionWindow: options.collectionWindow,
      // A dedicated instance hosts the single bot that predates the
      // multi-bot upgrade, so legacy object URIs belong to it:
      legacyObjectUris: { identifier: this.identifier },
      compatMode: true,
    });
    this.repository = this.instance.repository.forIdentifier(this.identifier);
    if (!options.transient) this.instance.addBot(this);
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
      url: this.instance.getBotWebUrl(this, ctx.origin),
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
    values: { identifier: string; id: string },
  ): Promise<Follow | null> {
    if (values.identifier !== this.identifier) return null;
    const id = values.id as Uuid;
    const follow = await this.repository.getSentFollow(id);
    return follow ?? null;
  }

  async authorizeFollow(
    ctx: RequestContext<TContextData>,
    values: { identifier: string; id: string },
  ): Promise<boolean> {
    if (values.identifier !== this.identifier) return false;
    const signedKeyOwner = await ctx.getSignedKeyOwner();
    if (signedKeyOwner == null || signedKeyOwner.id == null) return false;
    const id = values.id as Uuid;
    const follow = await this.repository.getSentFollow(id);
    if (follow == null) return false;
    return signedKeyOwner.id.href === follow.objectId?.href ||
      signedKeyOwner.id.href === follow.actorId?.href;
  }

  async dispatchCreate(
    ctx: RequestContext<TContextData>,
    values: { identifier: string; id: string },
  ): Promise<Create | null> {
    if (values.identifier !== this.identifier) return null;
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
    values: { identifier: string; id: string },
  ): Promise<Announce | null> {
    if (values.identifier !== this.identifier) return null;
    const activity = await this.repository.getMessage(values.id as Uuid);
    if (!(activity instanceof Announce)) return null;
    const isVisible = await this.getPermissionChecker(ctx);
    return isVisible(activity) ? activity : null;
  }

  async dispatchQuoteAuthorization(
    _ctx: RequestContext<TContextData>,
    values: { identifier: string; id: string },
  ): Promise<QuoteAuthorization | null> {
    if (values.identifier !== this.identifier) return null;
    return await this.repository.getQuoteAuthorization(values.id as Uuid) ??
      null;
  }

  async dispatchQuoteRequest(
    ctx: RequestContext<TContextData>,
    values: { identifier: string; id: string },
  ): Promise<QuoteRequest | null> {
    if (values.identifier !== this.identifier) return null;
    if (!isUuid(values.id)) return null;
    const stored = await this.repository.getMessage(values.id as Uuid);
    if (!(stored instanceof Create)) return null;
    const isVisible = await this.getPermissionChecker(ctx);
    if (!isVisible(stored)) return null;
    const object = await stored.getObject(ctx);
    if (
      !isMessageObject(object) || object.id == null || object.quoteId == null
    ) {
      return null;
    }
    return new QuoteRequest({
      id: ctx.getObjectUri(QuoteRequest, {
        identifier: this.identifier,
        id: values.id,
      }),
      actor: ctx.getActorUri(this.identifier),
      object: object.quoteId,
      instrument: object.id,
    });
  }

  dispatchEmoji(
    ctx: Context<TContextData>,
    values: { name: string },
  ): APEmoji | null {
    return this.instance.dispatchEmoji(ctx, values);
  }

  dispatchSharedKey(ctx: Context<TContextData>): { identifier: string } {
    return this.instance.dispatchSharedKey(ctx);
  }

  onUnverifiedActivity(
    ctx: RequestContext<TContextData>,
    activity: Activity,
    reason: UnverifiedActivityReason,
  ): Response | void {
    return this.instance.onUnverifiedActivity(ctx, activity, reason);
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
    const parsedObj = parseLocalUri(
      ctx,
      accept.objectId,
      this.legacyObjectUrisIdentifier,
    );
    if (
      parsedObj?.type === "object" && parsedObj.class === QuoteRequest &&
      parsedObj.values.identifier === this.identifier &&
      isUuid(parsedObj.values.id)
    ) {
      await this.#onQuoteAccepted(ctx, accept, parsedObj.values.id);
      return;
    }
    if (
      parsedObj?.type !== "object" || parsedObj.class !== Follow ||
      parsedObj.values.identifier !== this.identifier
    ) {
      return;
    }
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
    const parsedObj = parseLocalUri(
      ctx,
      reject.objectId,
      this.legacyObjectUrisIdentifier,
    );
    if (
      parsedObj?.type === "object" && parsedObj.class === QuoteRequest &&
      parsedObj.values.identifier === this.identifier &&
      isUuid(parsedObj.values.id)
    ) {
      await this.#onQuoteRejected(ctx, reject, parsedObj.values.id);
      return;
    }
    if (
      parsedObj?.type !== "object" || parsedObj.class !== Follow ||
      parsedObj.values.identifier !== this.identifier
    ) {
      return;
    }
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

  async #onQuoteAccepted(
    ctx: InboxContext<TContextData>,
    accept: Accept,
    id: Uuid,
  ): Promise<void> {
    const stored = await this.repository.getMessage(id);
    if (!(stored instanceof Create)) return;
    const object = await stored.getObject(ctx);
    if (
      !isMessageObject(object) || object.id == null || object.quoteId == null
    ) {
      return;
    }
    const quoteId = object.quoteId;
    const approval = await this.#validateQuoteApproval(ctx, accept, object);
    if (approval == null) return;
    await this.repository.addQuoteAuthorizationReference(
      approval.authorization.id!,
      id,
      approval.actor.id!,
    );
    let updatedObject: MessageClass | undefined;
    const removeReference = async () => {
      try {
        await this.repository.removeQuoteAuthorizationReference(
          approval.authorization.id!,
        );
      } catch (cleanupError) {
        logger.warn(
          "Failed to remove quote authorization reference after message update failure: {error}",
          { error: cleanupError },
        );
      }
    };
    try {
      const wasUpdated = await this.repository.updateMessage(
        id,
        async (existing) => {
          if (!(existing instanceof Create)) return;
          const existingObject = await existing.getObject(ctx);
          if (
            !isMessageObject(existingObject) || existingObject.id == null ||
            existingObject.quoteId?.href !== quoteId.href
          ) {
            return;
          }
          updatedObject = existingObject.clone({
            quoteAuthorization: approval.authorization.id,
            updated: Temporal.Now.instant(),
          });
          return existing.clone({ object: updatedObject });
        },
      );
      if (!wasUpdated || updatedObject == null) {
        await removeReference();
        return;
      }
    } catch (error) {
      await removeReference();
      throw error;
    }
    await this.#sendQuoteUpdate(ctx, updatedObject, approval.actor);
    if (this.onQuoteAccepted != null) {
      const session = this.getSession(ctx);
      const message = await createMessage(
        updatedObject,
        session,
        { [approval.actor.id!.href]: approval.actor },
        undefined,
        undefined,
        true,
      ) as AuthorizedMessage<MessageClass, TContextData>;
      await this.onQuoteAccepted(session, message, approval.actor);
    }
  }

  async #onQuoteRejected(
    ctx: InboxContext<TContextData>,
    reject: Reject,
    id: Uuid,
  ): Promise<void> {
    const stored = await this.repository.getMessage(id);
    if (!(stored instanceof Create)) return;
    const object = await stored.getObject(ctx);
    if (
      !isMessageObject(object) || object.id == null || object.quoteId == null
    ) {
      return;
    }
    const rejecter = await this.#validateQuoteRejection(ctx, reject, object);
    if (rejecter == null) return;
    const stripped = await this.#stripRejectedQuote(
      ctx,
      id,
      object,
      rejecter,
      this.onQuoteRejected != null,
    );
    if (stripped != null && this.onQuoteRejected != null) {
      await this.onQuoteRejected(
        stripped.session,
        stripped.message,
        rejecter,
      );
    }
  }

  async onDeleted(
    ctx: InboxContext<TContextData>,
    del: Delete,
  ): Promise<void> {
    if (del.objectId == null) return;
    const id = await this.repository.findQuoteAuthorizationReference(
      del.objectId,
    );
    if (id == null) return;
    const stored = await this.repository.getMessage(id);
    if (!(stored instanceof Create)) {
      await this.repository.removeQuoteAuthorizationReference(del.objectId);
      return;
    }
    const object = await stored.getObject(ctx);
    if (
      !isMessageObject(object) || object.id == null ||
      object.quoteAuthorizationId?.href !== del.objectId.href
    ) {
      await this.repository.removeQuoteAuthorizationReference(del.objectId);
      return;
    }
    const actor = await this.#validateQuoteAuthorizationDeletion(
      ctx,
      del,
      object,
    );
    if (actor == null) return;
    await this.#forwardQuoteAuthorizationDeletion(ctx, object, actor);
    const stripped = await this.#stripRejectedQuote(
      ctx,
      id,
      object,
      actor,
      this.onQuoteRevoked != null,
    );
    if (stripped != null && this.onQuoteRevoked != null) {
      await this.onQuoteRevoked(stripped.session, stripped.message, actor);
    }
  }

  async #stripRejectedQuote(
    ctx: InboxContext<TContextData>,
    id: Uuid,
    object: MessageClass,
    actor: Actor,
    materializeMessage: boolean,
  ): Promise<
    | {
      readonly session: SessionImpl<TContextData>;
      readonly message: AuthorizedMessage<MessageClass, TContextData>;
    }
    | undefined
  > {
    const quoteId = object.quoteId;
    const quoteAuthorizationId = object.quoteAuthorizationId;
    let strippedObject: MessageClass | undefined;
    const wasUpdated = await this.repository.updateMessage(
      id,
      async (existing) => {
        if (!(existing instanceof Create)) return;
        const existingObject = await existing.getObject(ctx);
        if (
          !isMessageObject(existingObject) || existingObject.id == null ||
          (quoteId != null && existingObject.quoteId?.href !== quoteId.href) ||
          (quoteAuthorizationId != null &&
            existingObject.quoteAuthorizationId?.href !==
              quoteAuthorizationId.href)
        ) {
          return;
        }
        strippedObject = (await stripQuoteObject(existingObject)).clone({
          updated: Temporal.Now.instant(),
        });
        return existing.clone({ object: strippedObject });
      },
    );
    if (object.quoteAuthorizationId != null) {
      await this.repository.removeQuoteAuthorizationReference(
        object.quoteAuthorizationId,
      );
    }
    if (!wasUpdated || strippedObject == null) return;
    await this.#sendQuoteUpdate(ctx, strippedObject, actor);
    if (!materializeMessage) return;
    const session = this.getSession(ctx);
    const message = await createMessage(
      strippedObject,
      session,
      actor.id == null ? {} : { [actor.id.href]: actor },
      undefined,
      undefined,
      true,
    ) as AuthorizedMessage<MessageClass, TContextData>;
    return { session, message };
  }

  async #validateQuoteApproval(
    ctx: InboxContext<TContextData>,
    accept: Accept,
    object: MessageClass,
  ): Promise<
    | {
      readonly actor: Actor;
      readonly authorization: QuoteAuthorization;
    }
    | undefined
  > {
    if (accept.actorId == null || accept.resultId == null) return undefined;
    const actor = await accept.getActor({
      contextLoader: ctx.contextLoader,
      documentLoader: ctx.documentLoader,
      suppressError: true,
    });
    if (
      !isActor(actor) || actor.id == null ||
      actor.id.href !== accept.actorId.href
    ) return undefined;
    const target = await lookupObjectSafely(this, ctx, object.quoteId!);
    if (
      !isMessageObject(target) ||
      target.attributionId?.href !== actor.id.href
    ) return undefined;
    let authorization = await accept.getResult({
      contextLoader: ctx.contextLoader,
      documentLoader: ctx.documentLoader,
      suppressError: true,
    });
    if (authorization == null) {
      authorization = await lookupObjectSafely(this, ctx, accept.resultId);
    }
    if (
      !validateQuoteAuthorization(authorization, {
        authorizationId: accept.resultId,
        quoteId: object.id!,
        targetId: object.quoteId!,
        targetActorId: actor.id,
      })
    ) return undefined;
    return { actor, authorization };
  }

  async #validateQuoteRejection(
    ctx: InboxContext<TContextData>,
    reject: Reject,
    object: MessageClass,
  ): Promise<Actor | undefined> {
    if (reject.actorId == null) return undefined;
    const actor = await reject.getActor({
      contextLoader: ctx.contextLoader,
      documentLoader: ctx.documentLoader,
      suppressError: true,
    });
    if (
      !isActor(actor) || actor.id == null ||
      actor.id.href !== reject.actorId.href
    ) return undefined;
    const target = await lookupObjectSafely(this, ctx, object.quoteId!);
    if (
      !isMessageObject(target) ||
      target.attributionId?.href !== actor.id.href
    ) return undefined;
    return actor;
  }

  async #validateQuoteAuthorizationDeletion(
    ctx: InboxContext<TContextData>,
    del: Delete,
    object: MessageClass,
  ): Promise<Actor | undefined> {
    if (del.actorId == null || object.quoteAuthorizationId == null) {
      return undefined;
    }
    const actor = await del.getActor({
      contextLoader: ctx.contextLoader,
      documentLoader: ctx.documentLoader,
      suppressError: true,
    });
    if (
      !isActor(actor) || actor.id == null ||
      actor.id.href !== del.actorId.href
    ) {
      return undefined;
    }
    if (actor.id.origin !== object.quoteAuthorizationId.origin) {
      return undefined;
    }
    const attribution = await this.repository
      .findQuoteAuthorizationReferenceAttribution(
        object.quoteAuthorizationId,
      );
    if (attribution?.href !== actor.id.href) return undefined;
    return actor;
  }

  async #forwardQuoteAuthorizationDeletion(
    ctx: InboxContext<TContextData>,
    object: MessageClass,
    quoteActor: Actor,
  ): Promise<void> {
    const visibility = await this.#getMessageVisibility(ctx, object);
    const preferSharedInbox = visibility === "public" ||
      visibility === "unlisted" || visibility === "followers";
    const excludeBaseUris = [new URL(ctx.origin)];
    const followersUri = ctx.getFollowersUri(this.identifier);
    const botActorUri = ctx.getActorUri(this.identifier);
    const recipientIds = new Map<string, URL>();
    let forwardsToFollowers = false;
    const addRecipientId = (id: URL | null | undefined) => {
      if (id == null) return;
      if (id.href === followersUri.href) {
        forwardsToFollowers = true;
        return;
      }
      if (
        id.href === PUBLIC_COLLECTION.href ||
        id.href === botActorUri.href
      ) {
        return;
      }
      recipientIds.set(id.href, id);
    };
    for (const id of object.toIds) addRecipientId(id);
    for (const id of object.ccIds) addRecipientId(id);
    for await (
      const tag of object.getTags({
        contextLoader: ctx.contextLoader,
        documentLoader: ctx.documentLoader,
        suppressError: true,
      })
    ) {
      if (tag instanceof Mention) addRecipientId(tag.href);
    }
    if (forwardsToFollowers) {
      await ctx.forwardActivity(this, "followers", {
        skipIfUnsigned: true,
        preferSharedInbox: true,
        excludeBaseUris,
      });
    }
    const actorRecipients: Actor[] = [];
    const actorRecipientIds = new Set<string>();
    const knownActors = new Map<string, Actor>();
    if (quoteActor.id != null) knownActors.set(quoteActor.id.href, quoteActor);
    const addActorRecipient = (actor: Actor) => {
      if (
        actor.id == null ||
        actor.id.href === botActorUri.href ||
        actorRecipientIds.has(actor.id.href)
      ) return;
      actorRecipientIds.add(actor.id.href);
      actorRecipients.push(actor);
    };
    const resolvedRecipients = await Promise.all(
      Array.from(recipientIds.values(), async (id) => {
        const knownActor = knownActors.get(id.href);
        if (knownActor != null) return knownActor;
        const recipient = await lookupObjectSafely(this, ctx, id);
        return isActor(recipient) ? recipient : undefined;
      }),
    );
    for (const recipient of resolvedRecipients) {
      if (recipient != null) addActorRecipient(recipient);
    }
    if (object.replyTargetId != null) {
      const replyTarget = await lookupObjectSafely(
        this,
        ctx,
        object.replyTargetId,
      );
      if (isMessageObject(replyTarget)) {
        const replyActor = await replyTarget.getAttribution({
          contextLoader: ctx.contextLoader,
          documentLoader: ctx.documentLoader,
          suppressError: true,
        });
        if (isActor(replyActor)) addActorRecipient(replyActor);
      }
    }
    addActorRecipient(quoteActor);
    if (actorRecipients.length < 1) return;
    await ctx.forwardActivity(this, actorRecipients, {
      skipIfUnsigned: true,
      preferSharedInbox,
      excludeBaseUris,
    });
  }

  async #sendQuoteUpdate(
    ctx: InboxContext<TContextData>,
    object: MessageClass,
    quoteActor: Actor,
  ): Promise<void> {
    const update = new Update({
      id: new URL(`#update/${crypto.randomUUID()}`, object.id ?? ctx.origin),
      actor: ctx.getActorUri(this.identifier),
      tos: object.toIds,
      ccs: object.ccIds,
      object,
    });
    const visibility = await this.#getMessageVisibility(ctx, object);
    const excludeBaseUris = [new URL(ctx.origin)];
    const preferSharedInbox = visibility === "public" ||
      visibility === "unlisted" || visibility === "followers";
    if (preferSharedInbox) {
      await ctx.sendActivity(
        this,
        "followers",
        update,
        { preferSharedInbox, excludeBaseUris },
      );
    }
    const mentionUris: URL[] = [];
    for await (
      const tag of object.getTags({
        contextLoader: ctx.contextLoader,
        documentLoader: ctx.documentLoader,
        suppressError: true,
      })
    ) {
      if (!(tag instanceof Mention) || tag.href == null) continue;
      mentionUris.push(tag.href);
    }
    const mentionedActors = (await Promise.all(
      mentionUris.map((uri) => lookupObjectSafely(this, ctx, uri)),
    )).filter(isActor);
    const sentActorIds = new Set<string>();
    const sendActorOnce = async (actor: Actor) => {
      if (actor.id == null || sentActorIds.has(actor.id.href)) return;
      sentActorIds.add(actor.id.href);
      await ctx.sendActivity(
        this,
        actor,
        update,
        { preferSharedInbox, excludeBaseUris, fanout: "skip" },
      );
    };
    if (mentionedActors.length > 0) {
      const unsentMentionedActors = mentionedActors.filter((actor) => {
        if (actor.id == null || sentActorIds.has(actor.id.href)) return false;
        sentActorIds.add(actor.id.href);
        return true;
      });
      if (unsentMentionedActors.length > 0) {
        await ctx.sendActivity(
          this,
          unsentMentionedActors,
          update,
          { preferSharedInbox, excludeBaseUris },
        );
      }
    }
    if (object.replyTargetId != null) {
      const replyTarget = await lookupObjectSafely(
        this,
        ctx,
        object.replyTargetId,
      );
      if (isMessageObject(replyTarget)) {
        const replyActor = await replyTarget.getAttribution({
          contextLoader: ctx.contextLoader,
          documentLoader: ctx.documentLoader,
          suppressError: true,
        });
        if (isActor(replyActor)) await sendActorOnce(replyActor);
      }
    }
    await sendActorOnce(quoteActor);
  }

  async onQuoteRequested(
    ctx: InboxContext<TContextData>,
    request: RawQuoteRequest,
  ): Promise<void> {
    if (request.id == null || request.actorId == null) return;
    const requestId = request.id;
    const parsedObj = parseLocalUri(
      ctx,
      request.objectId,
      this.legacyObjectUrisIdentifier,
    );
    if (
      parsedObj?.type !== "object" ||
      !(messageClasses as readonly unknown[]).includes(parsedObj.class) ||
      parsedObj.values.identifier !== this.identifier
    ) return;
    const stored = await this.repository.getMessage(
      parsedObj.values.id as Uuid,
    );
    if (!(stored instanceof Create)) return;
    const targetObject = await stored.getObject(ctx);
    if (!isMessageObject(targetObject) || targetObject.id == null) return;
    const documentLoader = await ctx.getDocumentLoader(this);
    const instrument = await request.getInstrument({
      contextLoader: ctx.contextLoader,
      documentLoader,
      suppressError: true,
    });
    if (!isMessageObject(instrument) || instrument.id == null) return;
    const quotedObjectId = instrument.quoteId ?? instrument.quoteUrl;
    if (quotedObjectId?.href !== targetObject.id.href) return;
    const actor = await request.getActor({
      contextLoader: ctx.contextLoader,
      documentLoader,
      suppressError: true,
    });
    if (!isActor(actor) || actor.id == null) return;
    const session = this.getSession(ctx);
    if (!await this.#canActorSeeObject(ctx, actor.id, targetObject)) {
      return;
    }
    const rejectRequest = async () => {
      await session.context.sendActivity(
        this,
        actor,
        new Reject({
          id: new URL(`/#reject/${requestId.href}`, session.actorId),
          actor: session.actorId,
          to: actor.id,
          object: request,
        }),
        { excludeBaseUris: [new URL(session.context.origin)] },
      );
    };
    if (
      instrument.attributionId != null &&
      instrument.attributionId.href !== actor.id.href
    ) {
      await rejectRequest();
      return;
    }
    const quoteObject = instrument.attributionId == null
      ? instrument.clone({ attribution: actor.id })
      : instrument;
    const target = await createMessage(
      targetObject,
      session,
      {},
      undefined,
      undefined,
      true,
    );
    const quote = await createMessage(quoteObject, session, {
      [actor.id.href]: actor,
    });
    if (quote.id == null || target.id == null) return;
    const existingAuthorization = await this.repository.findQuoteAuthorization(
      quote.id,
    );
    if (
      existingAuthorization != null &&
      existingAuthorization.interactionTargetId?.href !== target.id.href
    ) {
      await rejectRequest();
      return;
    }
    if (
      await this.#isQuoteAudienceWider(
        ctx,
        quoteObject,
        targetObject,
        quote.visibility,
        target.visibility,
      )
    ) {
      if (existingAuthorization != null) {
        await target.unauthorizeQuote(quote);
      }
      await rejectRequest();
      return;
    }
    const quoteRequest = new QuoteRequestImpl(
      session,
      request,
      actor,
      quote,
      target,
    );
    const revokeAndRejectQuoteRequest = async () => {
      if (existingAuthorization != null) {
        await target.unauthorizeQuote(quote);
      }
      await quoteRequest.reject();
    };
    const rule = targetObject.interactionPolicy?.canQuote;
    if (rule == null) {
      const policy = normalizeQuotePolicy(this.quotePolicy);
      if (await this.#matchesQuoteAcceptance(ctx, actor.id, policy.automatic)) {
        await quoteRequest.accept();
      } else if (
        await this.#matchesQuoteAcceptance(ctx, actor.id, policy.manual)
      ) {
        if (existingAuthorization != null) {
          await quoteRequest.accept();
          return;
        }
      } else {
        await revokeAndRejectQuoteRequest();
      }
    } else if (
      await this.#matchesQuoteApprovals(ctx, actor.id, rule.automaticApprovals)
    ) {
      await quoteRequest.accept();
    } else if (
      await this.#matchesQuoteApprovals(ctx, actor.id, rule.manualApprovals)
    ) {
      if (existingAuthorization != null) {
        await quoteRequest.accept();
        return;
      }
    } else {
      await revokeAndRejectQuoteRequest();
    }
    await this.onQuoteRequest?.(session, quoteRequest);
  }

  async #canActorSeeObject(
    ctx: InboxContext<TContextData>,
    actorId: URL,
    object: Object,
  ): Promise<boolean> {
    if (actorId.href === ctx.getActorUri(this.identifier).href) return true;
    const recipients = [...object.toIds, ...object.ccIds].map((u) => u.href);
    if (recipients.includes(PUBLIC_COLLECTION.href)) return true;
    if (recipients.includes(actorId.href)) return true;
    return recipients.includes(ctx.getFollowersUri(this.identifier).href) &&
      await this.repository.hasFollower(actorId);
  }

  async #isQuoteAudienceWider(
    ctx: InboxContext<TContextData>,
    quoteObject: Object,
    targetObject: Object,
    quoteVisibility: MessageVisibility,
    targetVisibility: MessageVisibility,
  ): Promise<boolean> {
    if (targetVisibility === "unknown") {
      return quoteVisibility !== "direct" ||
        !await this.#isQuoteAudienceSubset(
          ctx,
          quoteObject,
          targetObject,
        );
    }
    if (quoteVisibility === "unknown") {
      return targetVisibility !== "public" && targetVisibility !== "unlisted";
    }
    const ranks: Record<MessageVisibility, number> = {
      public: 4,
      unlisted: 3,
      followers: 2,
      direct: 1,
      unknown: 0,
    };
    if (ranks[quoteVisibility] > ranks[targetVisibility]) return true;
    return !await this.#isQuoteAudienceSubset(
      ctx,
      quoteObject,
      targetObject,
    );
  }

  async #isQuoteAudienceSubset(
    ctx: InboxContext<TContextData>,
    quoteObject: Object,
    targetObject: Object,
  ): Promise<boolean> {
    const targetRecipients = new Set(
      [...targetObject.toIds, ...targetObject.ccIds].map((u) => u.href),
    );
    targetRecipients.add(ctx.getActorUri(this.identifier).href);
    if (targetRecipients.has(PUBLIC_COLLECTION.href)) return true;
    const followerCollection = ctx.getFollowersUri(this.identifier).href;
    const targetIncludesFollowers = targetRecipients.has(followerCollection);
    for (const recipient of [...quoteObject.toIds, ...quoteObject.ccIds]) {
      if (targetRecipients.has(recipient.href)) continue;
      if (
        targetIncludesFollowers &&
        await this.repository.hasFollower(recipient)
      ) continue;
      return false;
    }
    return true;
  }

  async #getMessageVisibility(
    ctx: InboxContext<TContextData>,
    object: Object,
  ): Promise<MessageVisibility | null> {
    const documentLoader = await ctx.getDocumentLoader(this);
    const actor = object.attributionId?.href ===
        ctx.getActorUri(this.identifier).href
      ? await this.getSession(ctx).getActor()
      : await object.getAttribution({
        contextLoader: ctx.contextLoader,
        documentLoader,
        suppressError: true,
      });
    if (!isActor(actor)) return null;
    const mentionedActorIds = new Set<string>();
    for await (
      const tag of object.getTags({
        contextLoader: ctx.contextLoader,
        documentLoader,
        suppressError: true,
      })
    ) {
      if (tag instanceof Mention && tag.href != null) {
        mentionedActorIds.add(tag.href.href);
      }
    }
    return getMessageVisibility(
      object.toIds,
      object.ccIds,
      actor,
      mentionedActorIds,
    );
  }

  async #matchesQuoteAcceptance(
    ctx: InboxContext<TContextData>,
    actorId: URL,
    acceptance: ReturnType<typeof normalizeQuotePolicy>["automatic"],
  ): Promise<boolean> {
    if (actorId.href === ctx.getActorUri(this.identifier).href) return true;
    switch (acceptance) {
      case "public":
        return true;
      case "followers":
        return await this.repository.hasFollower(actorId);
      case "nobody":
      default:
        return false;
    }
  }

  async #matchesQuoteApprovals(
    ctx: InboxContext<TContextData>,
    actorId: URL,
    approvals: readonly URL[],
  ): Promise<boolean> {
    if (actorId.href === ctx.getActorUri(this.identifier).href) return true;
    const followerCollection = ctx.getFollowersUri(this.identifier).href;
    for (const approval of approvals) {
      if (approval.href === PUBLIC_COLLECTION.href) return true;
      if (approval.href === actorId.href) return true;
      if (
        approval.href === followerCollection &&
        await this.repository.hasFollower(actorId)
      ) return true;
    }
    return false;
  }

  async #hasValidQuoteAuthorization(
    ctx: InboxContext<TContextData>,
    object: MessageClass,
    targetId: URL,
  ): Promise<boolean> {
    if (
      object.id == null ||
      !("quoteAuthorizationId" in object) ||
      !(object.quoteAuthorizationId instanceof URL)
    ) return false;
    const parsed = parseLocalUri(
      ctx,
      object.quoteAuthorizationId,
      this.legacyObjectUrisIdentifier,
    );
    if (
      parsed?.type !== "object" ||
      parsed.class !== QuoteAuthorization ||
      parsed.values.identifier !== this.identifier
    ) return false;
    const authorization = await this.repository.getQuoteAuthorization(
      parsed.values.id as Uuid,
    );
    if (
      !validateQuoteAuthorization(authorization, {
        authorizationId: object.quoteAuthorizationId,
        quoteId: object.id,
        targetId,
        targetActorId: ctx.getActorUri(this.identifier),
      })
    ) {
      return false;
    }
    const parsedTarget = parseLocalUri(
      ctx,
      targetId,
      this.legacyObjectUrisIdentifier,
    );
    if (
      parsedTarget?.type !== "object" ||
      parsedTarget.values.identifier !== this.identifier
    ) return false;
    const stored = await this.repository.getMessage(
      parsedTarget.values.id as Uuid,
    );
    if (!(stored instanceof Create)) return false;
    const targetObject = await stored.getObject(ctx);
    if (
      !isMessageObject(targetObject) || targetObject.id?.href !== targetId.href
    ) {
      return false;
    }
    const quoteVisibility = await this.#getMessageVisibility(ctx, object);
    const targetVisibility = await this.#getMessageVisibility(
      ctx,
      targetObject,
    );
    if (quoteVisibility == null || targetVisibility == null) return false;
    if (
      await this.#isQuoteAudienceWider(
        ctx,
        object,
        targetObject,
        quoteVisibility,
        targetVisibility,
      )
    ) {
      const session = this.getSession(ctx);
      const target = await createMessage(
        targetObject,
        session,
        {},
        undefined,
        undefined,
        true,
      );
      const quote = await createMessage(object, session, {});
      await target.unauthorizeQuote(quote);
      return false;
    }
    return true;
  }

  async onCreated(
    ctx: InboxContext<TContextData>,
    create: Create,
  ): Promise<void> {
    await this.#onCreatedOrUpdated(ctx, create);
  }

  async onUpdated(
    ctx: InboxContext<TContextData>,
    update: Update,
  ): Promise<void> {
    await this.#onCreatedOrUpdated(ctx, update);
  }

  async #onCreatedOrUpdated(
    ctx: InboxContext<TContextData>,
    create: Create | Update,
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
    const replyTarget = parseLocalUri(
      ctx,
      object.replyTargetId,
      this.legacyObjectUrisIdentifier,
    );
    if (
      this.onVote != null &&
      object instanceof Note && replyTarget?.type === "object" &&
      // @ts-ignore: replyTarget.class satisfies (typeof messageClasses)[number]
      messageClasses.includes(replyTarget.class) &&
      replyTarget.values.identifier === this.identifier &&
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
      messageClasses.includes(replyTarget.class) &&
      replyTarget.values.identifier === this.identifier
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
    const fepQuoteUrl = object.quoteId;
    const requiresQuoteAuthorization = fepQuoteUrl != null;
    quoteUrl = fepQuoteUrl ?? quoteUrl ?? object.quoteUrl;
    const quoteTarget = parseLocalUri(
      ctx,
      quoteUrl,
      this.legacyObjectUrisIdentifier,
    );
    const isLocalQuoteTarget = quoteTarget?.type === "object" &&
      // @ts-ignore: quoteTarget.class satisfies (typeof messageClasses)[number]
      messageClasses.includes(quoteTarget.class) &&
      quoteTarget.values.identifier === this.identifier;
    if (
      requiresQuoteAuthorization && isLocalQuoteTarget &&
      !await this.#hasValidQuoteAuthorization(ctx, object, fepQuoteUrl)
    ) {
      return;
    }
    if (
      this.onQuote != null &&
      isLocalQuoteTarget
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
    const objectUri = parseLocalUri(
      ctx,
      announce.objectId,
      this.legacyObjectUrisIdentifier,
    );
    let object: Object | null = null;
    if (
      objectUri?.type === "object" &&
      // deno-lint-ignore no-explicit-any
      messageClasses.includes(objectUri.class as any) &&
      objectUri.values.identifier === this.identifier
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
    const objectUri = parseLocalUri(
      ctx,
      like.objectId,
      this.legacyObjectUrisIdentifier,
    );
    let object: Object | null = null;
    if (
      objectUri?.type === "object" &&
      // deno-lint-ignore no-explicit-any
      messageClasses.includes(objectUri.class as any)
    ) {
      // A local object owned by another bot is not this bot's to report;
      // the owner receives the activity through its own routing:
      if (objectUri.values.identifier !== this.identifier) return undefined;
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
    const objectUri = parseLocalUri(
      ctx,
      react.objectId,
      this.legacyObjectUrisIdentifier,
    );
    let object: Object | null = null;
    if (
      objectUri?.type === "object" &&
      // deno-lint-ignore no-explicit-any
      messageClasses.includes(objectUri.class as any)
    ) {
      // A local object owned by another bot is not this bot's to report;
      // the owner receives the activity through its own routing:
      if (objectUri.values.identifier !== this.identifier) return undefined;
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

  dispatchNodeInfo(ctx: Context<TContextData>): NodeInfo {
    return this.instance.dispatchNodeInfo(ctx);
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

  addCollectionInverseProperty(
    request: Request,
    contextData: TContextData,
    response: Response,
  ): Promise<Response> {
    return this.instance.addCollectionInverseProperty(
      request,
      contextData,
      response,
    );
  }

  fetch(request: Request, contextData: TContextData): Promise<Response> {
    return this.instance.fetch(request, contextData);
  }

  getEmoji(
    ctx: Context<TContextData>,
    name: string,
    data: CustomEmoji,
  ): APEmoji {
    return this.instance.getEmoji(ctx, name, data);
  }

  addCustomEmoji<TEmojiName extends string>(
    name: TEmojiName,
    data: CustomEmoji,
  ): DeferredCustomEmoji<TContextData> {
    return this.instance.addCustomEmoji(name, data);
  }

  addCustomEmojis<TEmojiName extends string>(
    emojis: Readonly<Record<TEmojiName, CustomEmoji>>,
  ): Readonly<Record<TEmojiName, DeferredCustomEmoji<TContextData>>> {
    return this.instance.addCustomEmojis(emojis);
  }
}

async function stripQuoteObject(object: MessageClass): Promise<MessageClass> {
  const json = await object.toJsonLd({ format: "compact" });
  if (!isRecord(json)) return object;
  delete json.quote;
  delete json.quoteUrl;
  delete json.quoteUri;
  delete json._misskey_quote;
  delete json.quoteAuthorization;
  json.content = stripQuoteFallback(json.content);
  json.tag = stripQuoteTags(json.tag, object.quoteId ?? object.quoteUrl);
  const cls = getMessageClass(object);
  return await cls.fromJsonLd(json) as MessageClass;
}

function stripQuoteFallback(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(
      /\n\n<p class="quote-inline"><br>RE: <a href="([^"]+)">\1<\/a><\/p>$/,
      "",
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripQuoteFallback(item));
  }
  if (isRecord(value)) {
    const stripped: Record<string, unknown> = {};
    for (const [key, item] of globalThis.Object.entries(value)) {
      stripped[key] = stripQuoteFallback(item);
    }
    return stripped;
  }
  return value;
}

function stripQuoteTags(value: unknown, quoteUrl: URL | null): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !isMisskeyQuoteTag(item, quoteUrl))
      .map((item) => stripQuoteTags(item, quoteUrl));
  }
  if (isMisskeyQuoteTag(value, quoteUrl)) return undefined;
  return value;
}

function isMisskeyQuoteTag(value: unknown, quoteUrl: URL | null): boolean {
  if (!isRecord(value)) return false;
  if (
    value.rel === "https://misskey-hub.net/ns#_misskey_quote" ||
    value.rel === "misskey:_misskey_quote"
  ) return true;
  return quoteUrl != null && value.href === quoteUrl.href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

async function lookupObjectSafely<TContextData>(
  bot: BotImpl<TContextData>,
  ctx: InboxContext<TContextData>,
  id: URL,
): Promise<Object | null> {
  try {
    const documentLoader = await ctx.getDocumentLoader(bot);
    return await ctx.lookupObject(id, {
      contextLoader: ctx.contextLoader,
      documentLoader,
    });
  } catch {
    return null;
  }
}

/**
 * Wraps a {@link BotImpl} instance with a plain object implementing
 * the {@link Bot} interface.  Since `deno serve` does not recognize a class
 * instance having fetch(), we wrap a BotImpl instance with a plain object.
 * See also https://github.com/denoland/deno/issues/24062
 * @param bot The bot implementation to wrap.
 * @returns The wrapped bot.
 * @internal
 */
export function wrapBotImpl<TContextData>(
  bot: BotImpl<TContextData>,
): Bot<TContextData> {
  const wrapper = {
    impl: bot,
    get federation() {
      return bot.federation;
    },
    get identifier() {
      return bot.identifier;
    },
    getSession(a, b?) {
      // @ts-ignore: BotImpl.getSession() implements Bot.getSession()
      return bot.getSession(a, b);
    },
    fetch(request, contextData) {
      return bot.fetch(request, contextData);
    },
    addCustomEmojis<TEmojiName extends string>(
      emojis: Readonly<Record<TEmojiName, CustomEmoji>>,
    ): Readonly<Record<TEmojiName, DeferredCustomEmoji<TContextData>>> {
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
    get onQuoteRequest() {
      return bot.onQuoteRequest;
    },
    set onQuoteRequest(value) {
      bot.onQuoteRequest = value;
    },
    get onQuoteAccepted() {
      return bot.onQuoteAccepted;
    },
    set onQuoteAccepted(value) {
      bot.onQuoteAccepted = value;
    },
    get onQuoteRejected() {
      return bot.onQuoteRejected;
    },
    set onQuoteRejected(value) {
      bot.onQuoteRejected = value;
    },
    get onQuoteRevoked() {
      return bot.onQuoteRevoked;
    },
    set onQuoteRevoked(value) {
      bot.onQuoteRevoked = value;
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
  } satisfies Bot<TContextData> & { impl: BotImpl<TContextData> };
  return wrapper;
}

/**
 * A repository decorator that adopts legacy (pre-0.5) data for a bot actor
 * before the first repository operation.  The migration is kicked off at
 * construction time and every operation awaits its completion, so data
 * stored by BotKit 0.4 or earlier is visible from the start.
 * @internal
 */
export class MigrationGatedRepository implements Repository {
  readonly #repository: Repository;
  readonly #migration: Promise<void>;
  readonly #missingQuoteAuthorizationReferenceMethods = new Set<string>();

  constructor(repository: Repository, identifier: string) {
    this.#repository = repository;
    this.#migration = repository.migrate?.(identifier) ?? Promise.resolve();
    // The rejection is re-thrown by the first awaiting operation; this
    // no-op handler only prevents an unhandled rejection warning:
    this.#migration.catch(() => {});
  }

  #warnMissingQuoteAuthorizationReferenceMethod(method: string): void {
    if (this.#missingQuoteAuthorizationReferenceMethods.has(method)) return;
    this.#missingQuoteAuthorizationReferenceMethods.add(method);
    logger.warn(
      "Repository does not implement {method}; quote-authorization revocation and cleanup are disabled for this repository.",
      { method },
    );
  }

  async setKeyPairs(
    identifier: string,
    keyPairs: CryptoKeyPair[],
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.setKeyPairs(identifier, keyPairs);
  }

  async getKeyPairs(identifier: string): Promise<CryptoKeyPair[] | undefined> {
    await this.#migration;
    return await this.#repository.getKeyPairs(identifier);
  }

  async addMessage(
    identifier: string,
    id: Uuid,
    activity: Create | Announce,
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.addMessage(identifier, id, activity);
  }

  async updateMessage(
    identifier: string,
    id: Uuid,
    updater: (
      existing: Create | Announce,
    ) => Create | Announce | undefined | Promise<Create | Announce | undefined>,
  ): Promise<boolean> {
    await this.#migration;
    return await this.#repository.updateMessage(identifier, id, updater);
  }

  async removeMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    await this.#migration;
    return await this.#repository.removeMessage(identifier, id);
  }

  async *getMessages(
    identifier: string,
    options?: RepositoryGetMessagesOptions,
  ): AsyncIterable<Create | Announce> {
    await this.#migration;
    yield* this.#repository.getMessages(identifier, options);
  }

  async getMessage(
    identifier: string,
    id: Uuid,
  ): Promise<Create | Announce | undefined> {
    await this.#migration;
    return await this.#repository.getMessage(identifier, id);
  }

  async countMessages(identifier: string): Promise<number> {
    await this.#migration;
    return await this.#repository.countMessages(identifier);
  }

  async addFollower(
    identifier: string,
    followId: URL,
    follower: Actor,
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.addFollower(identifier, followId, follower);
  }

  async removeFollower(
    identifier: string,
    followId: URL,
    followerId: URL,
  ): Promise<Actor | undefined> {
    await this.#migration;
    return await this.#repository.removeFollower(
      identifier,
      followId,
      followerId,
    );
  }

  async hasFollower(identifier: string, followerId: URL): Promise<boolean> {
    await this.#migration;
    return await this.#repository.hasFollower(identifier, followerId);
  }

  async *getFollowers(
    identifier: string,
    options?: RepositoryGetFollowersOptions,
  ): AsyncIterable<Actor> {
    await this.#migration;
    yield* this.#repository.getFollowers(identifier, options);
  }

  async countFollowers(identifier: string): Promise<number> {
    await this.#migration;
    return await this.#repository.countFollowers(identifier);
  }

  async addSentFollow(
    identifier: string,
    id: Uuid,
    follow: Follow,
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.addSentFollow(identifier, id, follow);
  }

  async removeSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    await this.#migration;
    return await this.#repository.removeSentFollow(identifier, id);
  }

  async getSentFollow(
    identifier: string,
    id: Uuid,
  ): Promise<Follow | undefined> {
    await this.#migration;
    return await this.#repository.getSentFollow(identifier, id);
  }

  async addFollowee(
    identifier: string,
    followeeId: URL,
    follow: Follow,
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.addFollowee(identifier, followeeId, follow);
  }

  async removeFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    await this.#migration;
    return await this.#repository.removeFollowee(identifier, followeeId);
  }

  async getFollowee(
    identifier: string,
    followeeId: URL,
  ): Promise<Follow | undefined> {
    await this.#migration;
    return await this.#repository.getFollowee(identifier, followeeId);
  }

  async *findFollowedBots(followeeId: URL): AsyncIterable<string> {
    await this.#migration;
    yield* this.#repository.findFollowedBots(followeeId);
  }

  async addQuoteAuthorization(
    identifier: string,
    id: Uuid,
    authorization: QuoteAuthorization,
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.addQuoteAuthorization(
      identifier,
      id,
      authorization,
    );
  }

  async getQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    await this.#migration;
    return await this.#repository.getQuoteAuthorization(identifier, id);
  }

  async findQuoteAuthorization(
    identifier: string,
    interactingObject: URL,
  ): Promise<QuoteAuthorization | undefined> {
    await this.#migration;
    return await this.#repository.findQuoteAuthorization(
      identifier,
      interactingObject,
    );
  }

  async removeQuoteAuthorization(
    identifier: string,
    id: Uuid,
  ): Promise<QuoteAuthorization | undefined> {
    await this.#migration;
    return await this.#repository.removeQuoteAuthorization(identifier, id);
  }

  async addQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
    messageId: Uuid,
    attribution?: URL,
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.addQuoteAuthorizationReference(
      identifier,
      authorization,
      messageId,
      attribution,
    );
  }

  async findQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<Uuid | undefined> {
    await this.#migration;
    return await this.#repository.findQuoteAuthorizationReference(
      identifier,
      authorization,
    );
  }

  async *findQuoteAuthorizationReferenceIdentifiers(
    authorization: URL,
  ): AsyncIterable<string> {
    await this.#migration;
    if (
      typeof this.#repository.findQuoteAuthorizationReferenceIdentifiers !==
        "function"
    ) {
      this.#warnMissingQuoteAuthorizationReferenceMethod(
        "findQuoteAuthorizationReferenceIdentifiers",
      );
      return;
    }
    yield* this.#repository.findQuoteAuthorizationReferenceIdentifiers(
      authorization,
    );
  }

  async findQuoteAuthorizationReferenceAttribution(
    identifier: string,
    authorization: URL,
  ): Promise<URL | undefined> {
    await this.#migration;
    if (
      typeof this.#repository.findQuoteAuthorizationReferenceAttribution !==
        "function"
    ) {
      this.#warnMissingQuoteAuthorizationReferenceMethod(
        "findQuoteAuthorizationReferenceAttribution",
      );
      return undefined;
    }
    return await this.#repository.findQuoteAuthorizationReferenceAttribution(
      identifier,
      authorization,
    );
  }

  async removeQuoteAuthorizationReference(
    identifier: string,
    authorization: URL,
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.removeQuoteAuthorizationReference(
      identifier,
      authorization,
    );
  }

  async vote(
    identifier: string,
    messageId: Uuid,
    voterId: URL,
    option: string,
  ): Promise<void> {
    await this.#migration;
    return await this.#repository.vote(identifier, messageId, voterId, option);
  }

  async countVoters(identifier: string, messageId: Uuid): Promise<number> {
    await this.#migration;
    return await this.#repository.countVoters(identifier, messageId);
  }

  async countVotes(
    identifier: string,
    messageId: Uuid,
  ): Promise<Readonly<Record<string, number>>> {
    await this.#migration;
    return await this.#repository.countVotes(identifier, messageId);
  }

  forIdentifier(identifier: string): ActorScopedRepository {
    return new ActorScopedRepository(this, identifier);
  }

  async migrate(identifier: string): Promise<void> {
    await this.#migration;
    await this.#repository.migrate?.(identifier);
  }
}

/**
 * The internal implementation of a {@link BotGroup}: a registry of event
 * handlers shared by every bot its dispatcher resolves.
 * @internal
 */
export class BotGroupImpl<TContextData> implements BotGroup<TContextData> {
  readonly instance: InstanceImpl<TContextData>;
  readonly dispatcher: BotDispatcher<TContextData>;
  readonly mapUsername?: (
    ctx: Context<TContextData>,
    username: string,
  ) => string | null | Promise<string | null>;

  onFollow?: FollowEventHandler<TContextData>;
  onUnfollow?: UnfollowEventHandler<TContextData>;
  onAcceptFollow?: AcceptEventHandler<TContextData>;
  onRejectFollow?: RejectEventHandler<TContextData>;
  onMention?: MentionEventHandler<TContextData>;
  onReply?: ReplyEventHandler<TContextData>;
  onQuote?: QuoteEventHandler<TContextData>;
  onQuoteRequest?: QuoteRequestEventHandler<TContextData>;
  onQuoteAccepted?: QuoteAcceptedEventHandler<TContextData>;
  onQuoteRejected?: QuoteRejectedEventHandler<TContextData>;
  onQuoteRevoked?: QuoteRevokedEventHandler<TContextData>;
  onMessage?: MessageEventHandler<TContextData>;
  onSharedMessage?: SharedMessageEventHandler<TContextData>;
  onLike?: LikeEventHandler<TContextData>;
  onUnlike?: UnlikeEventHandler<TContextData>;
  onReact?: ReactionEventHandler<TContextData>;
  onUnreact?: UndoneReactionEventHandler<TContextData>;
  onVote?: VoteEventHandler<TContextData>;

  constructor(
    instance: InstanceImpl<TContextData>,
    dispatcher: BotDispatcher<TContextData>,
    options: CreateBotGroupOptions<TContextData> = {},
  ) {
    this.instance = instance;
    this.dispatcher = dispatcher;
    this.mapUsername = options.mapUsername;
  }

  async getSession(
    origin: string | URL,
    identifier: string,
    contextData: TContextData,
  ): Promise<Session<TContextData>> {
    const ctx = this.instance.federation.createContext(
      new URL(origin),
      contextData,
    );
    const bot = await this.instance.resolveBot(ctx, identifier);
    if (bot == null || !(bot instanceof GroupBotImpl) || bot.group !== this) {
      throw new TypeError(
        `The group's dispatcher does not resolve the identifier: ${identifier}`,
      );
    }
    return bot.getSession(ctx);
  }
}

/**
 * A transient per-bot view of a dynamically resolved bot.  It behaves like
 * a regular {@link BotImpl}, except that its event handlers are read live
 * from the owning {@link BotGroupImpl} at dispatch time, so handlers
 * registered on the group after a bot was resolved still fire.  Views are
 * not registered on the instance and live only as long as the resolution
 * cache of the request that produced them.
 * @internal
 */
export class GroupBotImpl<TContextData> extends BotImpl<TContextData> {
  readonly group: BotGroupImpl<TContextData>;

  constructor(
    group: BotGroupImpl<TContextData>,
    identifier: string,
    profile: BotProfile<TContextData>,
  ) {
    super({
      instance: group.instance,
      transient: true,
      identifier,
      kv: group.instance.kv,
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
    this.group = group;
    for (const name of botEventHandlerNames) {
      // Class fields would shadow prototype accessors, so the live views
      // into the group's handlers are defined per instance:
      globalThis.Object.defineProperty(this, name, {
        get: () => group[name],
        configurable: true,
      });
    }
  }
}
