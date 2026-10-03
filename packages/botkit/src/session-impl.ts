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
import type { Context } from "@fedify/fedify/federation";
import { quoteInteraction } from "@fedify/interaction-controls";
import { type DocumentLoader, LanguageString } from "@fedify/vocab-runtime";
import {
  type Actor,
  Collection,
  Create,
  Follow,
  isActor,
  Link,
  Mention,
  Move,
  Note,
  type Object,
  Object as APObject,
  PUBLIC_COLLECTION,
  QuoteRequest,
  Undo,
  Update,
} from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { encode } from "html-entities";
import { v7 as uuidv7 } from "uuid";
import type { BotImpl } from "./bot-impl.ts";
import {
  createMessage,
  deduplicateTags,
  isMessageObject,
} from "./message-impl.ts";
import {
  type AuthorizedMessage,
  type Message,
  type MessageClass,
  Question,
} from "./message.ts";
import type { Uuid } from "./repository.ts";
import { serializeQuotePolicy } from "./quote.ts";
import type {
  Session,
  SessionGetOutboxOptions,
  SessionMoveOptions,
  SessionPublishOptions,
  SessionPublishOptionsWithClass,
  SessionPublishOptionsWithQuestion,
} from "./session.ts";
import { plainText, type Text } from "./text.ts";
import { getFollowDeliveryOptions } from "./uri.ts";

const logger = getLogger(["botkit", "session"]);

export interface SessionImplPublishOptions<TContextData>
  extends SessionPublishOptions<TContextData> {
  replyTarget?: Message<MessageClass, TContextData>;
}

export interface SessionImplPublishOptionsWithClass<
  T extends MessageClass,
  TContextData,
> extends
  SessionPublishOptionsWithClass<T, TContextData>,
  SessionImplPublishOptions<TContextData> {
}

export interface SessionImplPublishOptionsWithQuestion<TContextData>
  extends
    SessionPublishOptionsWithQuestion<TContextData>,
    SessionImplPublishOptionsWithClass<Question, TContextData> {
}

export class SessionImpl<TContextData> implements Session<TContextData> {
  readonly bot: BotImpl<TContextData>;
  readonly context: Context<TContextData>;

  constructor(bot: BotImpl<TContextData>, context: Context<TContextData>) {
    this.bot = bot;
    this.context = context;
  }

  get actorId() {
    return this.context.getActorUri(this.bot.identifier);
  }

  get actorHandle() {
    return `@${this.bot.username}@${this.context.host}` as const;
  }

  async getActor(): Promise<Actor> {
    return (await this.bot.dispatchActor(this.context, this.bot.identifier))!;
  }

  async follow(actor: Actor | URL | string): Promise<void> {
    if (actor instanceof URL || typeof actor === "string") {
      if (
        actor instanceof URL && actor.href === this.actorId.href ||
        typeof actor === "string" &&
          (actor === this.actorId.href || actor === this.actorHandle)
      ) {
        throw new TypeError("The bot cannot follow itself.");
      }
      const documentLoader = await this.context.getDocumentLoader(this.bot);
      const object = await this.context.lookupObject(actor, { documentLoader });
      if (!isActor(object)) {
        throw new TypeError("The resolved object is not an Actor.");
      }
      actor = object;
    }
    if (actor.id == null) {
      throw new TypeError("The actor does not have an ID.");
    } else if (actor.id.href === this.actorId.href) {
      throw new TypeError("The bot cannot follow itself.");
    }
    const followee = await this.bot.repository.getFollowee(actor.id);
    if (followee != null) {
      logger.warn(
        "The bot is already following the actor {actor}.",
        { actor: actor.id.href },
      );
      return;
    }
    const id = uuidv7() as Uuid;
    const follow = new Follow({
      id: this.context.getObjectUri(Follow, {
        identifier: this.bot.identifier,
        id,
      }),
      actor: this.context.getActorUri(this.bot.identifier),
      object: actor.id,
      to: actor.id,
    });
    await this.bot.repository.addSentFollow(id, follow);
    await this.context.sendActivity(
      this.bot,
      actor,
      follow,
      getFollowDeliveryOptions(this.context, actor.id),
    );
  }

  async unfollow(actor: Actor | URL | string): Promise<void> {
    const documentLoader = await this.context.getDocumentLoader(this.bot);
    if (actor instanceof URL || typeof actor === "string") {
      if (
        actor instanceof URL && actor.href === this.actorId.href ||
        typeof actor === "string" &&
          (actor === this.actorId.href || actor === this.actorHandle)
      ) {
        throw new TypeError("The bot cannot unfollow itself.");
      }
      const object = await this.context.lookupObject(actor, { documentLoader });
      if (!isActor(object)) {
        throw new TypeError("The resolved object is not an Actor.");
      }
      actor = object;
    }
    if (actor.id == null) {
      throw new TypeError("The actor does not have an ID.");
    } else if (actor.id.href === this.actorId.href) {
      throw new TypeError("The bot cannot unfollow itself.");
    }
    const follow = await this.bot.repository.getFollowee(actor.id);
    if (follow == null) {
      logger.warn(
        "The bot is not following the actor {actor}.",
        { actor: actor.id.href },
      );
      return;
    }
    await this.bot.repository.removeFollowee(actor.id);
    if (follow.id != null && follow.objectId?.href === actor.id.href) {
      await this.context.sendActivity(
        this.bot,
        actor,
        new Undo({
          id: new URL("#undo", follow.id),
          actor: this.context.getActorUri(this.bot.identifier),
          object: follow,
          to: actor.id,
        }),
        getFollowDeliveryOptions(this.context, actor.id),
      );
    }
  }

  async follows(actor: Actor | URL | string): Promise<boolean> {
    let actorId: URL;
    if (isActor(actor)) {
      if (actor.id == null) {
        throw new TypeError("The actor does not have an ID.");
      }
      actorId = actor.id;
    } else if (actor instanceof URL) {
      actorId = actor;
    } else {
      if (actor.startsWith("http://") || actor.startsWith("https://")) {
        actorId = new URL(actor);
      } else {
        if (actor === this.actorHandle) return false;
        const documentLoader = await this.context.getDocumentLoader(this.bot);
        const object = await this.context.lookupObject(actor, {
          documentLoader,
        });
        if (object == null || !isActor(object)) {
          throw new TypeError("The resolved object is not an Actor.");
        }
        if (object.id == null) {
          throw new TypeError("The actor does not have an ID.");
        }
        actorId = object.id;
      }
    }
    if (actorId.href === this.actorId.href) return false;
    const follow = await this.bot.repository.getFollowee(actorId);
    return follow != null;
  }

  async move(
    target: Actor | URL | string,
    options: SessionMoveOptions = {},
  ): Promise<void> {
    const signal = options.signal;
    signal?.throwIfAborted();
    if (await this.bot.repository.getSuccessor(signal) != null) {
      throw new TypeError("The bot has already moved.");
    }
    const actor = await this.#resolveMoveTarget(target, false, signal);
    const successorId = actor.id!;
    signal?.throwIfAborted();
    const committed = await this.bot.instance.withSharingLock(
      this.bot.identifier,
      async (signal) =>
        await this.bot.repository.setSuccessor(successorId, signal),
      signal,
    );
    if (!committed) throw new TypeError("The bot has already moved.");
    // From here cancellation must not interrupt the notification pair.
    // Never roll back a move which another server may already have processed.
    try {
      await this.#notifyMove(successorId);
    } catch (error) {
      if (error instanceof AggregateError) throw error;
      throw new AggregateError(
        [error],
        "The bot moved, but its migration notifications failed.",
      );
    }
  }

  async republishMove(options: SessionMoveOptions = {}): Promise<void> {
    const signal = options.signal;
    signal?.throwIfAborted();
    const successorId = await this.bot.repository.getSuccessor(signal);
    if (successorId == null) throw new TypeError("The bot has not moved.");
    await this.#resolveMoveTarget(successorId, true, signal);
    await this.#notifyMove(successorId, signal);
  }

  async #resolveMoveTarget(
    target: Actor | URL | string,
    allowMoved: boolean,
    signal?: AbortSignal,
  ): Promise<Actor> {
    signal?.throwIfAborted();
    let id: URL | null;
    if (isActor(target)) {
      id = target.id;
    } else if (target instanceof URL) {
      id = target;
    } else {
      const handle = target.replace(/^acct:/, "").match(
        /^@?([^@/:]+)@([^@/]+)$/,
      );
      if (
        handle != null &&
        handle[2].toLowerCase() === this.context.host.toLowerCase()
      ) {
        const bot = await this.bot.instance.resolveBotByUsername(
          this.context,
          handle[1],
        );
        if (bot == null) {
          throw new TypeError("The migration target could not be resolved.");
        }
        id = this.context.getActorUri(bot.identifier);
      } else if (handle != null) {
        const documentLoader = await this.context.getDocumentLoader(this.bot);
        const actor = await this.context.lookupObject(target, {
          documentLoader,
          signal,
        });
        signal?.throwIfAborted();
        if (!isActor(actor)) {
          throw new TypeError("The migration target could not be resolved.");
        }
        id = actor.id;
      } else {
        id = new URL(target);
      }
    }
    if (id == null) {
      throw new TypeError("The migration target does not have an ID.");
    }
    if (id.protocol !== "http:" && id.protocol !== "https:") {
      throw new TypeError(
        "The migration target must have an HTTP or HTTPS actor URI.",
      );
    }
    if (id.href === this.actorId.href) {
      throw new TypeError("The bot cannot move to itself.");
    }
    let actor: APObject | null;
    const local = this.context.parseUri(id);
    if (local?.type === "actor") {
      const bot = await this.bot.instance.resolveBot(
        this.context,
        local.identifier,
      );
      actor = await bot?.dispatchActor(this.context, local.identifier) ?? null;
    } else {
      const loader = await this.context.getDocumentLoader(this.bot);
      const documentLoader: DocumentLoader = (url, options) =>
        loader(url, { ...options, signal: signal ?? options?.signal });
      const document = await documentLoader(id.href);
      const documentUrl = new URL(document.documentUrl);
      if (documentUrl.origin !== id.origin) {
        throw new TypeError(
          "The migration target document has a different origin.",
        );
      }
      actor = await APObject.fromJsonLd(document.document, {
        baseUrl: documentUrl,
        documentLoader,
        contextLoader: (url, options) =>
          this.context.contextLoader(url, {
            ...options,
            signal: signal ?? options?.signal,
          }),
      });
    }
    signal?.throwIfAborted();
    if (
      !isActor(actor) || actor.id?.href !== id.href || actor.inboxId == null
    ) {
      throw new TypeError(
        "The migration target is not a valid actor with an inbox.",
      );
    }
    if (!allowMoved && actor.successorId != null) {
      throw new TypeError("The migration target has already moved.");
    }
    if (!actor.aliasIds.some((alias) => alias.href === this.actorId.href)) {
      throw new TypeError(
        "The migration target does not list the bot as an alias.",
      );
    }
    return actor;
  }

  async #notifyMove(successorId: URL, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    // Freeze the audience for both sends: a local Move can cause immediate
    // Undo(Follow) deliveries which mutate the live followers collection.
    const followers = await Array.fromAsync(this.bot.repository.getFollowers());
    const actor = await this.getActor();
    const followersId = this.context.getFollowersUri(this.bot.identifier);
    const update = new Update({
      id: new URL(`#update-profile/${crypto.randomUUID()}`, this.actorId),
      actor: this.actorId,
      to: followersId,
      object: actor,
    });
    const move = new Move({
      id: new URL(`#move/${crypto.randomUUID()}`, this.actorId),
      actor: this.actorId,
      object: this.actorId,
      target: successorId,
      to: PUBLIC_COLLECTION,
      cc: followersId,
    });
    signal?.throwIfAborted();
    if (followers.length === 0) return;
    const errors: unknown[] = [];
    for (const activity of [update, move]) {
      try {
        await this.context.sendActivity(this.bot, followers, activity, {
          preferSharedInbox: true,
          excludeBaseUris: [],
          orderingKey: this.actorId.href,
        });
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        "The migration notifications could not all be submitted.",
      );
    }
  }

  /** Checks whether this bot may publish new messages. @internal */
  async ensureActive(signal?: AbortSignal): Promise<void> {
    if (await this.bot.repository.getSuccessor(signal) != null) {
      throw new TypeError("The bot has moved and cannot publish new messages.");
    }
  }

  async republishProfile(): Promise<void> {
    const actor = await this.getActor();
    const update = new Update({
      id: new URL(`#update-profile/${crypto.randomUUID()}`, this.actorId),
      actor: this.actorId,
      to: this.context.getFollowersUri(this.bot.identifier),
      object: actor,
    });
    await this.context.sendActivity(
      this.bot,
      "followers",
      update,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.context.origin)],
      },
    );
  }

  async publish(
    content: Text<"block", TContextData>,
    options?: SessionImplPublishOptions<TContextData>,
  ): Promise<AuthorizedMessage<Note, TContextData>>;
  async publish<T extends MessageClass>(
    content: Text<"block", TContextData>,
    options: SessionImplPublishOptionsWithClass<T, TContextData>,
  ): Promise<AuthorizedMessage<T, TContextData>>;
  async publish(
    content: Text<"block", TContextData>,
    options: SessionImplPublishOptionsWithQuestion<TContextData>,
  ): Promise<AuthorizedMessage<Question, TContextData>>;
  async publish(
    content: Text<"block", TContextData>,
    options:
      | SessionImplPublishOptions<TContextData>
      | SessionImplPublishOptionsWithClass<MessageClass, TContextData>
      | SessionImplPublishOptionsWithQuestion<TContextData> = {},
  ): Promise<AuthorizedMessage<MessageClass, TContextData>> {
    await this.ensureActive();
    const published = new Date();
    const id = uuidv7({ msecs: +published }) as Uuid;
    const cls = "class" in options ? options.class : Note;
    const visibility = options.visibility ?? "public";
    let contentHtml = "";
    for await (const chunk of content.getHtml(this)) {
      contentHtml += chunk;
    }
    const summary = typeof options.summary === "string"
      ? plainText<TContextData>(options.summary)
      : options.summary;
    let summaryHtml: string | undefined;
    if (summary != null) {
      summaryHtml = "";
      for await (const chunk of summary.getHtml(this)) {
        summaryHtml += chunk;
      }
    }
    const tagCandidates = await Array.fromAsync(content.getTags(this));
    if (summary != null) {
      tagCandidates.push(...await Array.fromAsync(summary.getTags(this)));
    }
    const tags = deduplicateTags(tagCandidates);
    const mentionedActorIds: URL[] = [];
    for (const tag of tags) {
      if (
        tag instanceof Mention && tag.href != null &&
        !mentionedActorIds.some((id) => id.href === tag.href?.href)
      ) {
        mentionedActorIds.push(tag.href);
      }
    }
    if (options.quoteTarget != null) {
      let url = options.quoteTarget.raw.url ?? options.quoteTarget.id;
      if (url instanceof Link) url = url.href ?? options.quoteTarget.id;
      contentHtml += `\n\n<p class="quote-inline"><br>RE: <a href="${
        encode(url.href)
      }">${encode(url.href)}</a></p>`;
      tags.push(
        new Link({
          mediaType:
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          rel: "https://misskey-hub.net/ns#_misskey_quote",
          href: options.quoteTarget.id,
          name: `RE: ${url.href}`,
        }),
      );
    }
    const actorId = this.context.getActorUri(this.bot.identifier);
    const quoteTargetActorId = options.quoteTarget?.actor.id;
    const privateQuoteAudienceIds = quoteTargetActorId != null &&
        quoteTargetActorId.href !== actorId.href &&
        (visibility === "followers" || visibility === "direct") &&
        !mentionedActorIds.some((id) => id.href === quoteTargetActorId.href)
      ? [quoteTargetActorId]
      : [];
    let inclusiveOptions: Note[] = [];
    let exclusiveOptions: Note[] = [];
    let voters: number | null = null;
    let endTime: Temporal.Instant | null = null;
    if ("class" in options && options.class === Question && "poll" in options) {
      if (options.poll.options.length < 2) {
        throw new TypeError("At least two options are required in a poll.");
      } else if (
        new Set(options.poll.options).size != options.poll.options.length
      ) {
        throw new TypeError("Duplicate options are not allowed in a poll.");
      } else if (options.poll.options.some((o) => o.trim() === "")) {
        throw new TypeError("Poll options cannot be empty.");
      }
      const pollOptions = options.poll.options.map((option) =>
        new Note({
          name: option,
          replies: new Collection({ totalItems: 0 }),
        })
      );
      if (options.poll.multiple) inclusiveOptions = pollOptions;
      else exclusiveOptions = pollOptions;
      voters = 0;
      endTime = options.poll.endTime;
    }
    const msgId = this.context.getObjectUri<MessageClass>(cls, {
      identifier: this.bot.identifier,
      id,
    });
    const msg = new cls({
      id: msgId,
      contents: options.language == null
        ? [contentHtml]
        : [new LanguageString(contentHtml, options.language), contentHtml],
      names: options.name == null
        ? []
        : options.language == null
        ? [options.name]
        : [
          new LanguageString(options.name, options.language),
          options.name,
        ],
      summaries: summaryHtml == null
        ? []
        : options.language == null
        ? [summaryHtml]
        : [
          new LanguageString(summaryHtml, options.language),
          summaryHtml,
        ],
      replyTarget: options.replyTarget?.id,
      quote: options.quoteTarget?.id,
      quoteUrl: options.quoteTarget?.id,
      tags,
      interactionPolicy: serializeQuotePolicy(
        options.quotePolicy ?? this.bot.quotePolicy,
        actorId,
        this.context.getFollowersUri(this.bot.identifier),
      ),
      attribution: actorId,
      attachments: options.attachments ?? [],
      inclusiveOptions,
      exclusiveOptions,
      voters,
      endTime,
      tos: visibility === "public"
        ? [PUBLIC_COLLECTION, ...mentionedActorIds]
        : visibility === "unlisted" || visibility === "followers"
        ? [
          this.context.getFollowersUri(this.bot.identifier),
          ...mentionedActorIds,
          ...privateQuoteAudienceIds,
        ]
        : [...mentionedActorIds, ...privateQuoteAudienceIds],
      ccs: visibility === "public"
        ? [this.context.getFollowersUri(this.bot.identifier)]
        : visibility === "unlisted"
        ? [PUBLIC_COLLECTION]
        : [],
      published: published.toTemporalInstant(),
      url: options.url ??
        this.bot.instance.getMessageWebUrl(
          this.bot,
          id,
          this.context.origin,
        ),
    });
    const activity = new Create({
      id: this.context.getObjectUri(Create, {
        identifier: this.bot.identifier,
        id,
      }),
      actors: msg.attributionIds,
      tos: msg.toIds,
      ccs: msg.ccIds,
      object: msg,
      published: published.toTemporalInstant(),
    });
    // Rendering text can await remote lookups or user code.  Recheck before
    // storing anything in case the bot moved during that preparation.
    await this.ensureActive();
    await this.bot.repository.addMessage(id, activity);
    const preferSharedInbox = visibility === "public" ||
      visibility === "unlisted" || visibility === "followers";
    const excludeBaseUris = [new URL(this.context.origin)];
    if (preferSharedInbox) {
      await this.context.sendActivity(
        this.bot,
        "followers",
        activity,
        { preferSharedInbox, excludeBaseUris },
      );
    }
    const cachedObjects: Record<string, Object> = {};
    const textObjects = [
      ...content.getCachedObjects(),
      ...(summary?.getCachedObjects() ?? []),
    ];
    for (const cachedObject of textObjects) {
      if (cachedObject.id == null) continue;
      cachedObjects[cachedObject.id.href] = cachedObject;
    }
    if (mentionedActorIds.length > 0) {
      const documentLoader = await this.context.getDocumentLoader(this.bot);
      const promises: Promise<Object | null>[] = [];
      for (const mentionedActorId of mentionedActorIds) {
        const cachedObject = cachedObjects[mentionedActorId.href];
        const promise = cachedObject == null
          ? this.context.lookupObject(
            mentionedActorId,
            { documentLoader },
          )
          : Promise.resolve(cachedObject);
        promises.push(promise);
      }
      const objects = await Promise.all(promises);
      const mentionedActors = objects.filter(isActor);
      await this.context.sendActivity(
        this.bot,
        mentionedActors,
        activity,
        { preferSharedInbox, excludeBaseUris },
      );
    }
    if (options.replyTarget != null) {
      await this.context.sendActivity(
        this.bot,
        options.replyTarget.actor,
        activity,
        { preferSharedInbox, excludeBaseUris, fanout: "skip" },
      );
    }
    if (options.quoteTarget != null) {
      await this.context.sendActivity(
        this.bot,
        options.quoteTarget.actor,
        activity,
        { preferSharedInbox, excludeBaseUris, fanout: "skip" },
      );
      if (
        options.quoteTarget.actor.id != null &&
        options.quoteTarget.actor.id.href !==
          this.context.getActorUri(this.bot.identifier).href
      ) {
        const request = quoteInteraction.createRequest({
          id: this.context.getObjectUri(QuoteRequest, {
            identifier: this.bot.identifier,
            id,
          }),
          actor: this.context.getActorUri(this.bot.identifier),
          object: options.quoteTarget.id,
          instrument: msgId,
          to: options.quoteTarget.actor.id,
        });
        await this.context.sendActivity(
          this.bot,
          options.quoteTarget.actor,
          request,
          { preferSharedInbox, excludeBaseUris, fanout: "skip" },
        );
      }
    }
    return await createMessage(
      msg,
      this,
      cachedObjects,
      options.replyTarget,
      options.quoteTarget,
      true,
    );
  }

  async *getOutbox(
    options: SessionGetOutboxOptions = {},
  ): AsyncIterable<AuthorizedMessage<MessageClass, TContextData>> {
    for await (const activity of this.bot.repository.getMessages(options)) {
      let object: Object | null;
      try {
        object = await activity.getObject(this.context);
      } catch {
        continue;
      }
      if (object == null || !isMessageObject(object)) continue;
      const message = await createMessage(
        object,
        this,
        {},
        undefined,
        undefined,
        true,
      );
      yield message;
    }
  }
}
