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
import { LanguageString } from "@fedify/vocab-runtime";
import {
  type Actor,
  Announce,
  Article,
  ChatMessage,
  Create,
  Delete,
  Document,
  type Emoji as CustomEmoji,
  EmojiReact,
  Hashtag,
  isActor,
  Like as RawLike,
  Link,
  Mention,
  Note,
  type Object,
  PUBLIC_COLLECTION,
  Question,
  QuoteAuthorization,
  Tombstone,
  Undo,
  Update,
} from "@fedify/vocab";
import { decode } from "html-entities";
import { v7 as uuidv7 } from "uuid";
import { parseLocalUri } from "./uri.ts";
import xss from "xss";
import type { DeferredCustomEmoji, Emoji } from "./emoji.ts";
import type {
  AuthorizedMessage,
  AuthorizedMessageUpdateOptions,
  AuthorizedSharedMessage,
  Message,
  MessageClass,
  MessageShareOptions,
  MessageVisibility,
} from "./message.ts";
import type { AuthorizedLike, AuthorizedReaction } from "./reaction.ts";
import type { Uuid } from "./repository.ts";
import { validateQuoteAuthorization } from "./quote-authorization.ts";
import {
  parseQuotePolicy,
  type QuotePolicy,
  serializeQuotePolicy,
} from "./quote.ts";
import type { SessionImpl } from "./session-impl.ts";
import type {
  SessionPublishOptions,
  SessionPublishOptionsWithClass,
} from "./session.ts";
import type { Text } from "./text.ts";

export const messageClasses = [Article, ChatMessage, Note, Question];

export function isMessageObject(value: unknown): value is MessageClass {
  return messageClasses.some((cls) => value instanceof cls);
}

export function getMessageClass(
  value: MessageClass,
): (typeof Article | typeof ChatMessage | typeof Note | typeof Question) & {
  typeId: URL;
} {
  return value instanceof Article
    ? Article
    : value instanceof ChatMessage
    ? ChatMessage
    : value instanceof Note
    ? Note
    : Question;
}

export class MessageImpl<T extends MessageClass, TContextData>
  implements Message<T, TContextData> {
  readonly session: SessionImpl<TContextData>;
  raw: T;
  readonly id: URL;
  readonly actor: Actor;
  readonly visibility: MessageVisibility;
  readonly language?: Intl.Locale | undefined;
  text: string;
  html: string;
  readonly replyTarget?: Message<MessageClass, TContextData> | undefined;
  readonly quoteTarget?: Message<MessageClass, TContextData> | undefined;
  quotePolicy?: QuotePolicy | undefined;
  readonly quoteApproved?: boolean | undefined;
  mentions: readonly Actor[];
  hashtags: readonly Hashtag[];
  readonly attachments: readonly Document[];
  readonly published?: Temporal.Instant;
  updated?: Temporal.Instant;

  constructor(
    session: SessionImpl<TContextData>,
    message:
      & Omit<
        Message<T, TContextData>,
        "delete" | "reply" | "share" | "like" | "react"
      >
      & {
        readonly quoteApprovalState?: "pending" | "accepted" | "notRequired";
      },
  ) {
    this.session = session;
    this.raw = message.raw;
    this.id = message.id;
    this.actor = message.actor;
    this.visibility = message.visibility;
    this.language = message.language;
    this.text = message.text;
    this.html = message.html;
    this.replyTarget = message.replyTarget;
    this.quoteTarget = message.quoteTarget;
    this.quotePolicy = message.quotePolicy;
    this.quoteApproved = message.quoteApproved;
    this.mentions = message.mentions;
    this.hashtags = message.hashtags;
    this.attachments = message.attachments;
    this.published = message.published;
    this.updated = message.updated;
  }

  reply(
    text: Text<"block", TContextData>,
    options?: SessionPublishOptions<TContextData>,
  ): Promise<AuthorizedMessage<Note, TContextData>>;
  reply<T extends MessageClass>(
    text: Text<"block", TContextData>,
    options?: SessionPublishOptionsWithClass<T, TContextData> | undefined,
  ): Promise<AuthorizedMessage<T, TContextData>>;
  reply(
    text: Text<"block", TContextData>,
    options?:
      | SessionPublishOptions<TContextData>
      | SessionPublishOptionsWithClass<MessageClass, TContextData>,
  ): Promise<AuthorizedMessage<MessageClass, TContextData>> {
    return this.session.publish(text, {
      visibility: this.visibility === "unknown" ? "direct" : this.visibility,
      ...options,
      replyTarget: this,
    });
  }

  async share(
    options: MessageShareOptions = {},
  ): Promise<AuthorizedSharedMessage<T, TContextData>> {
    const published = new Date();
    const id = uuidv7({ msecs: +published }) as Uuid;
    const visibility = options.visibility ?? this.visibility;
    const originalActor = this.actor.id == null ? [] : [this.actor.id];
    const uri = this.session.context.getObjectUri(Announce, {
      identifier: this.session.bot.identifier,
      id,
    });
    const announce = new Announce({
      id: uri,
      actor: this.session.context.getActorUri(this.session.bot.identifier),
      published: published.toTemporalInstant(),
      object: this.id,
      tos: visibility === "public"
        ? [PUBLIC_COLLECTION]
        : visibility === "unlisted" || visibility === "followers"
        ? [
          this.session.context.getFollowersUri(this.session.bot.identifier),
        ]
        : [],
      ccs: visibility === "public"
        ? [
          this.session.context.getFollowersUri(this.session.bot.identifier),
          ...originalActor,
        ]
        : visibility === "unlisted"
        ? [PUBLIC_COLLECTION, ...originalActor]
        : originalActor,
    });
    await this.session.bot.repository.addMessage(id, announce);
    await this.session.context.sendActivity(
      this.session.bot,
      "followers",
      announce,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.session.context.origin)],
      },
    );
    await this.session.context.sendActivity(
      this.session.bot,
      this.actor,
      announce,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.session.context.origin)],
        fanout: "skip",
      },
    );
    const actor = announce.actorId?.href === this.session.actorId.href
      ? await this.session.getActor()
      : await announce.getActor(this.session.context);
    if (actor == null) throw new TypeError("The actor is required.");
    return {
      raw: announce,
      id: uri,
      actor,
      visibility,
      original: this,
      unshare: async () => {
        await this.session.bot.repository.removeMessage(id);
        const undo = new Undo({
          id: new URL("#delete", uri),
          actor: this.session.context.getActorUri(
            this.session.bot.identifier,
          ),
          tos: announce.toIds,
          ccs: announce.ccIds,
          object: announce,
        });
        await this.session.context.sendActivity(
          this.session.bot,
          "followers",
          undo,
          {
            preferSharedInbox: true,
            excludeBaseUris: [new URL(this.session.context.origin)],
          },
        );
        await this.session.context.sendActivity(
          this.session.bot,
          this.actor,
          undo,
          {
            preferSharedInbox: true,
            excludeBaseUris: [new URL(this.session.context.origin)],
            fanout: "skip",
          },
        );
      },
    };
  }

  async like(): Promise<AuthorizedLike<TContextData>> {
    const uuid = crypto.randomUUID();
    const actor = this.session.context.getActorUri(this.session.bot.identifier);
    const id = new URL(`#like/${uuid}`, actor);
    const activity = new RawLike({
      id,
      actor,
      object: this.id,
    });
    await this.session.context.sendActivity(
      this.session.bot,
      "followers",
      activity,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.session.context.origin)],
      },
    );
    await this.session.context.sendActivity(
      this.session.bot,
      this.actor,
      activity,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.session.context.origin)],
        fanout: "skip",
      },
    );
    return {
      raw: activity,
      id,
      actor: await this.session.getActor(),
      message: this,
      unlike: async () => {
        const undo = new Undo({
          id: new URL(`#unlike/${uuid}`, actor),
          actor,
          object: activity,
        });
        await this.session.context.sendActivity(
          this.session.bot,
          "followers",
          undo,
          {
            preferSharedInbox: true,
            excludeBaseUris: [new URL(this.session.context.origin)],
          },
        );
        await this.session.context.sendActivity(
          this.session.bot,
          this.actor,
          undo,
          {
            preferSharedInbox: true,
            excludeBaseUris: [new URL(this.session.context.origin)],
            fanout: "skip",
          },
        );
      },
    };
  }

  async react(
    emoji: Emoji | CustomEmoji | DeferredCustomEmoji<TContextData>,
  ): Promise<AuthorizedReaction<TContextData>> {
    const uuid = crypto.randomUUID();
    const actor = this.session.context.getActorUri(this.session.bot.identifier);
    const id = new URL(`#react/${uuid}`, actor);
    if (typeof emoji === "function") {
      emoji = await emoji(this.session);
    }
    const activity = new EmojiReact({
      id,
      actor,
      object: this.id,
      name: typeof emoji === "string" ? emoji : emoji.name,
      tags: typeof emoji === "string" ? [] : [emoji],
    });
    await this.session.context.sendActivity(
      this.session.bot,
      "followers",
      activity,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.session.context.origin)],
      },
    );
    await this.session.context.sendActivity(
      this.session.bot,
      this.actor,
      activity,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.session.context.origin)],
        fanout: "skip",
      },
    );
    return {
      raw: activity,
      id,
      actor: await this.session.getActor(),
      message: this,
      emoji,
      unreact: async () => {
        const undo = new Undo({
          id: new URL(`#unreact/${uuid}`, actor),
          actor,
          object: activity,
          name: typeof emoji === "string" ? emoji : emoji.name,
          tags: typeof emoji === "string" ? [] : [emoji],
        });
        await this.session.context.sendActivity(
          this.session.bot,
          "followers",
          undo,
          {
            preferSharedInbox: true,
            excludeBaseUris: [new URL(this.session.context.origin)],
          },
        );
        await this.session.context.sendActivity(
          this.session.bot,
          this.actor,
          undo,
          {
            preferSharedInbox: true,
            excludeBaseUris: [new URL(this.session.context.origin)],
            fanout: "skip",
          },
        );
      },
    };
  }
}

export class AuthorizedMessageImpl<T extends MessageClass, TContextData>
  extends MessageImpl<T, TContextData>
  implements AuthorizedMessage<T, TContextData> {
  readonly quoteApprovalState?: "pending" | "accepted" | "notRequired";

  constructor(
    session: SessionImpl<TContextData>,
    message: Omit<
      AuthorizedMessage<T, TContextData>,
      | "delete"
      | "reply"
      | "share"
      | "like"
      | "react"
      | "update"
      | "unauthorizeQuote"
    >,
  ) {
    super(session, message);
    this.quoteApprovalState = message.quoteApprovalState;
  }

  async update(
    text: Text<"block", TContextData>,
    options: AuthorizedMessageUpdateOptions = {},
  ): Promise<void> {
    const parsed = parseLocalUri(
      this.session.context,
      this.id,
      this.session.bot.legacyObjectUrisIdentifier,
    );
    if (
      parsed?.type !== "object" ||
      !messageClasses.some((cls) => parsed.class === cls) ||
      parsed.values.identifier !== this.session.bot.identifier
    ) {
      return;
    }
    const { id } = parsed.values;
    let existingMentions: readonly Actor[] = [];
    let mentionedActors: Actor[] = [];
    let update: Update | undefined;
    const updated = await this.session.bot.repository.updateMessage(
      id as Uuid,
      async (create) => {
        if (create instanceof Announce) return;
        const message = await create.getObject(this.session.context);
        if (message == null || !isMessageObject(message)) return;
        let contentHtml = "";
        for await (const chunk of text.getHtml(this.session)) {
          contentHtml += chunk;
        }
        const tags = await Array.fromAsync(text.getTags(this.session));
        const mentionedActorIds: URL[] = [];
        const hashtags: Hashtag[] = [];
        for (const tag of tags) {
          if (tag instanceof Mention && tag.href != null) {
            mentionedActorIds.push(tag.href);
          } else if (tag instanceof Hashtag) {
            hashtags.push(tag);
          }
        }
        const cachedObjects: Record<string, Object> = {};
        for (const cachedObject of text.getCachedObjects()) {
          if (cachedObject.id == null) continue;
          cachedObjects[cachedObject.id.href] = cachedObject;
        }
        const documentLoader = await this.session.context.getDocumentLoader(
          this.session.bot,
        );
        const promises: Promise<Object | null>[] = [];
        for (const uri of mentionedActorIds) {
          const cachedObject = cachedObjects[uri.href];
          const promise = cachedObject == null
            ? this.session.context.lookupObject(uri, { documentLoader })
            : Promise.resolve(cachedObject);
          promises.push(promise);
        }
        const objects = await Promise.all(promises);
        mentionedActors = objects.filter(isActor);
        this.html = contentHtml;
        this.text = decode(textXss.process(contentHtml));
        existingMentions = this.mentions;
        this.mentions = mentionedActors;
        this.hashtags = hashtags;
        const updated = Temporal.Now.instant();
        this.updated = updated;
        const quoteTargetActorId = this.quoteTarget?.actor.id;
        const privateQuoteAudienceIds = quoteTargetActorId != null &&
            quoteTargetActorId.href !== this.session.actorId.href &&
            (this.visibility === "followers" || this.visibility === "direct") &&
            !mentionedActorIds.some((id) => id.href === quoteTargetActorId.href)
          ? [quoteTargetActorId]
          : [];
        const newMessage = message.clone({
          contents: this.language == null
            ? [contentHtml]
            : [new LanguageString(contentHtml, this.language), contentHtml],
          tags,
          tos: this.visibility === "public"
            ? [PUBLIC_COLLECTION, ...mentionedActorIds]
            : this.visibility === "unlisted" || this.visibility === "followers"
            ? [
              this.session.context.getFollowersUri(this.session.bot.identifier),
              ...mentionedActorIds,
              ...privateQuoteAudienceIds,
            ]
            : [...mentionedActorIds, ...privateQuoteAudienceIds],
          ccs: this.visibility === "public"
            ? [
              this.session.context.getFollowersUri(this.session.bot.identifier),
            ]
            : this.visibility === "unlisted"
            ? [PUBLIC_COLLECTION]
            : [],
          updated,
          interactionPolicy: options.quotePolicy == null
            ? message.interactionPolicy
            : serializeQuotePolicy(
              options.quotePolicy,
              this.session.actorId,
              this.session.context.getFollowersUri(
                this.session.bot.identifier,
              ),
            ),
        });
        this.raw = newMessage as T;
        this.quotePolicy = parseQuotePolicy(
          newMessage.interactionPolicy?.canQuote,
          this.session.actorId,
          this.session.context.getFollowersUri(this.session.bot.identifier),
        );
        create = create.clone({ object: newMessage, updated });
        const to = create.toIds.map((url) => url.href);
        for (const url of newMessage.toIds) {
          if (!to.includes(url.href)) to.push(url.href);
        }
        const cc = create.ccIds.map((url) => url.href);
        for (const url of newMessage.ccIds) {
          if (!cc.includes(url.href)) cc.push(url.href);
        }
        update = new Update({
          id: new URL(
            `#updated/${updated.toString()}`,
            this.session.context.getObjectUri(Create, {
              identifier: this.session.bot.identifier,
              id,
            }),
          ),
          actors: newMessage.attributionIds,
          tos: to.map((url) => new URL(url)),
          ccs: cc.map((url) => new URL(url)),
          object: newMessage,
          updated,
        });
        return create;
      },
    );
    if (!updated || update == null) return;
    const preferSharedInbox = this.visibility === "public" ||
      this.visibility === "unlisted" || this.visibility === "followers";
    const excludeBaseUris = [new URL(this.session.context.origin)];
    if (preferSharedInbox) {
      await this.session.context.sendActivity(
        this.session.bot,
        "followers",
        update,
        { preferSharedInbox, excludeBaseUris },
      );
    }
    await this.session.context.sendActivity(
      this.session.bot,
      [...existingMentions, ...mentionedActors],
      update,
      { preferSharedInbox, excludeBaseUris },
    );
    if (this.replyTarget != null) {
      await this.session.context.sendActivity(
        this.session.bot,
        this.replyTarget.actor,
        update,
        { preferSharedInbox: true, excludeBaseUris, fanout: "skip" },
      );
    }
    if (this.quoteTarget != null) {
      await this.session.context.sendActivity(
        this.session.bot,
        this.quoteTarget.actor,
        update,
        { preferSharedInbox: true, excludeBaseUris, fanout: "skip" },
      );
    }
  }

  async delete(): Promise<void> {
    const parsed = parseLocalUri(
      this.session.context,
      this.id,
      this.session.bot.legacyObjectUrisIdentifier,
    );
    if (
      parsed?.type !== "object" ||
      !messageClasses.some((cls) => parsed.class === cls) ||
      parsed.values.identifier !== this.session.bot.identifier
    ) {
      return;
    }
    const { id } = parsed.values;
    const create = await this.session.bot.repository.removeMessage(id as Uuid);
    if (create == null) return;
    const message = await create.getObject(this.session.context);
    if (message == null) return;
    if (
      isMessageObject(message) &&
      message.quoteAuthorizationId != null
    ) {
      await this.session.bot.repository.removeQuoteAuthorizationReference(
        message.quoteAuthorizationId,
      );
    }
    const mentionedActorIds: Set<string> = new Set();
    for await (const tag of message.getTags(this.session.context)) {
      if (tag instanceof Mention && tag.href != null) {
        mentionedActorIds.add(tag.href.href);
      }
    }
    const promises: Promise<Object | null>[] = [];
    const documentLoader = await this.session.context.getDocumentLoader(
      this.session.bot,
    );
    for (const uri of mentionedActorIds) {
      promises.push(this.session.context.lookupObject(uri, { documentLoader }));
    }
    const mentionedActors = (await Promise.all(promises)).filter(isActor);
    const activity = new Delete({
      id: new URL("#delete", this.id),
      actor: this.session.context.getActorUri(this.session.bot.identifier),
      tos: create.toIds,
      ccs: create.ccIds,
      object: new Tombstone({
        id: this.id,
      }),
    });
    const excludeBaseUris = [new URL(this.session.context.origin)];
    await this.session.context.sendActivity(
      this.session.bot,
      "followers",
      activity,
      { preferSharedInbox: true, excludeBaseUris },
    );
    if (mentionedActors.length > 0) {
      await this.session.context.sendActivity(
        this.session.bot,
        mentionedActors,
        activity,
        { preferSharedInbox: true, excludeBaseUris },
      );
    }
    if (this.replyTarget != null) {
      await this.session.context.sendActivity(
        this.session.bot,
        this.replyTarget.actor,
        activity,
        { preferSharedInbox: true, excludeBaseUris, fanout: "skip" },
      );
    }
    if (this.quoteTarget != null) {
      await this.session.context.sendActivity(
        this.session.bot,
        this.quoteTarget.actor,
        activity,
        { preferSharedInbox: true, excludeBaseUris, fanout: "skip" },
      );
    }
  }

  async unauthorizeQuote(
    quote: Message<MessageClass, TContextData> | URL,
  ): Promise<void> {
    const quoteId = quote instanceof URL ? quote : quote.id;
    if (quoteId == null) {
      throw new TypeError("The quote message ID is missing.");
    }
    const authorization = await this.session.bot.repository
      .findQuoteAuthorization(quoteId);
    if (authorization == null || authorization.id == null) {
      throw new TypeError("The quote authorization does not exist.");
    }
    if (authorization.interactionTargetId?.href !== this.id.href) {
      throw new TypeError(
        "The quote authorization does not belong to this message.",
      );
    }
    const parsed = parseLocalUri(
      this.session.context,
      authorization.id,
      this.session.bot.legacyObjectUrisIdentifier,
    );
    if (
      parsed?.type !== "object" ||
      parsed.class !== QuoteAuthorization ||
      parsed.values.identifier !== this.session.bot.identifier
    ) {
      throw new TypeError("The quote authorization is not local.");
    }
    await this.session.bot.repository.removeQuoteAuthorization(
      parsed.values.id as Uuid,
    );
    const quoteActor = quote instanceof URL
      ? await this.#getQuoteActor(quote).catch(() => undefined)
      : quote.actor;
    const followersUri = this.session.context.getFollowersUri(
      this.session.bot.identifier,
    );
    const del = new Delete({
      id: new URL("#delete", authorization.id),
      actor: this.session.actorId,
      object: authorization.id,
      to: quoteActor?.id ?? followersUri,
      cc: quoteActor?.id == null ? undefined : followersUri,
    });
    if (quoteActor?.id != null) {
      await this.session.context.sendActivity(
        this.session.bot,
        quoteActor,
        del,
        {
          preferSharedInbox: true,
          excludeBaseUris: [new URL(this.session.context.origin)],
          fanout: "skip",
        },
      );
    }
    await this.session.context.sendActivity(
      this.session.bot,
      "followers",
      del,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.session.context.origin)],
      },
    );
  }

  async #getQuoteActor(quoteId: URL): Promise<Actor> {
    const documentLoader = await this.session.context.getDocumentLoader(
      this.session.bot,
    );
    const object = await this.session.context.lookupObject(quoteId, {
      documentLoader,
    });
    if (!isMessageObject(object)) {
      throw new TypeError("The quote message does not exist.");
    }
    return (await createMessage(object, this.session, {})).actor;
  }
}

// @ts-ignore: The `xss` module has `getDefaultWhiteList` function.
const allowList = xss.getDefaultWhiteList();
/**
 * The configured `xss.FilterXSS` instance used to sanitize user-provided HTML,
 * such as a message's content, before it is rendered on the web pages.  It
 * keeps the default allowlist of safe tags, additionally permitting the `class`
 * and `translate` attributes on `<a>` elements, while stripping scripts, event
 * handlers, and unsafe URLs.
 *
 * @since 0.5.0
 */
// @ts-ignore: The `xss` module has `FilterXSS` class.
export const htmlXss = new xss.FilterXSS({
  allowList: {
    ...allowList,
    a: [...allowList.a ?? [], "class", "translate"],
  },
});
// @ts-ignore: The `xss` module has `FilterXSS` class.
export const textXss = new xss.FilterXSS({
  allowList: {},
  stripIgnoreTag: true,
});

export async function createMessage<T extends MessageClass, TContextData>(
  raw: T,
  session: SessionImpl<TContextData>,
  cachedObjects: Record<string, Object>,
  replyTarget: Message<MessageClass, TContextData> | undefined,
  quote: Message<MessageClass, TContextData> | undefined,
  authorized: true,
  signal?: AbortSignal,
): Promise<AuthorizedMessage<T, TContextData>>;
export async function createMessage<T extends MessageClass, TContextData>(
  raw: T,
  session: SessionImpl<TContextData>,
  cachedObjects: Record<string, Object>,
  replyTarget?: Message<MessageClass, TContextData>,
  quote?: Message<MessageClass, TContextData>,
  authorized?: boolean,
  signal?: AbortSignal,
): Promise<Message<T, TContextData>>;
export async function createMessage<T extends MessageClass, TContextData>(
  raw: T,
  session: SessionImpl<TContextData>,
  cachedObjects: Record<string, Object>,
  replyTarget?: Message<MessageClass, TContextData>,
  quoteTarget?: Message<MessageClass, TContextData>,
  authorized: boolean = false,
  signal?: AbortSignal,
): Promise<Message<T, TContextData>> {
  if (raw.id == null) throw new TypeError("The raw.id is required.");
  else if (raw.content == null) {
    throw new TypeError("The raw.content is required.");
  }
  const documentLoader = await session.context.getDocumentLoader(session.bot);
  const options = {
    contextLoader: session.context.contextLoader,
    documentLoader,
    suppressError: true,
    signal,
  };
  const rawActor = raw.attributionId?.href === session.actorId?.href
    ? await session.getActor()
    : raw.attributionId == null
    ? null
    : cachedObjects[raw.attributionId.href] == null
    ? await raw.getAttribution(options)
    : cachedObjects[raw.attributionId.href];
  if (!isActor(rawActor)) {
    throw new TypeError("The raw.attributionId is required.");
  }
  const actor = rawActor;
  const content = raw.content.toString();
  const text = textXss.process(content);
  const html = htmlXss.process(content);
  const mentions: Actor[] = [];
  const mentionedActorIds = new Set<string>();
  const hashtags: Hashtag[] = [];
  const quoteLinks: Link[] = [];
  for await (const tag of raw.getTags(options)) {
    if (tag instanceof Mention && tag.href != null) {
      const obj = tag.href.href === session.actorId?.href
        ? await session.getActor()
        : cachedObjects[tag.href.href] == null
        ? await session.context.lookupObject(tag.href, options)
        : cachedObjects[tag.href.href];
      if (isActor(obj)) mentions.push(obj);
      mentionedActorIds.add(tag.href.href);
    } else if (tag instanceof Hashtag) {
      hashtags.push(tag);
    } else if (tag instanceof Link && isQuoteLink(tag)) {
      quoteLinks.push(tag);
    }
  }
  const attachments: Document[] = [];
  for await (const attachment of raw.getAttachments(options)) {
    if (attachment instanceof Document) attachments.push(attachment);
  }
  if (replyTarget == null) {
    let rt: Link | Object | null;
    const parsed = parseLocalUri(
      session.context,
      raw.replyTargetId,
      session.bot.legacyObjectUrisIdentifier,
    );
    if (
      // @ts-ignore: The `class` property satisfies the `MessageClass` type.
      parsed?.type === "object" && messageClasses.includes(parsed.class) &&
      parsed.values.identifier === session.bot.identifier
    ) {
      // @ts-ignore: The `class` property satisfies the `MessageClass` type.
      // deno-lint-ignore no-explicit-any
      const cls: new (values: any) => T = parsed.class;
      rt = await session.bot.dispatchMessage(
        cls,
        session.context,
        parsed.values.id,
      );
    } else {
      rt = await raw.getReplyTarget(options);
    }
    if (
      rt instanceof Article || rt instanceof ChatMessage ||
      rt instanceof Note || rt instanceof Question
    ) {
      replyTarget = await createMessage(
        rt,
        session,
        cachedObjects,
        undefined,
        undefined,
        undefined,
        signal,
      );
    }
  }
  if (quoteTarget == null) {
    let quoteUrl = raw.quoteId;
    if (quoteUrl == null) {
      for (const quoteLink of quoteLinks) {
        if (quoteLink.href == null) continue;
        quoteUrl = quoteLink.href;
        break;
      }
    }
    if (quoteUrl == null) quoteUrl = raw.quoteUrl;
    let qt: Object | null = null;
    const parsed = parseLocalUri(
      session.context,
      quoteUrl,
      session.bot.legacyObjectUrisIdentifier,
    );
    if (
      // @ts-ignore: The `class` property satisfies the `MessageClass` type.
      parsed?.type === "object" && messageClasses.includes(parsed.class) &&
      parsed.values.identifier === session.bot.identifier
    ) {
      // @ts-ignore: The `class` property satisfies the `MessageClass` type.
      // deno-lint-ignore no-explicit-any
      const cls: new (values: any) => T = parsed.class;
      qt = await session.bot.dispatchMessage(
        cls,
        session.context,
        parsed.values.id,
      );
    } else if (quoteUrl != null) {
      qt = await session.context.lookupObject(quoteUrl, options);
    }
    if (
      qt instanceof Article || qt instanceof ChatMessage ||
      qt instanceof Note || qt instanceof Question
    ) {
      quoteTarget = await createMessage(
        qt,
        session,
        cachedObjects,
        undefined,
        undefined,
        undefined,
        signal,
      );
    }
  }
  const quotePolicy = actor.id == null && raw.attributionId == null
    ? undefined
    : parseQuotePolicy(
      raw.interactionPolicy?.canQuote,
      actor.id ?? raw.attributionId!,
      actor.followersId,
    );
  const quoteApproved = quoteTarget == null ? undefined : actor.id != null &&
      quoteTarget.actor.id != null &&
      actor.id.href === quoteTarget.actor.id.href
    ? true
    : await verifyQuoteApproval(
      raw,
      quoteTarget,
      session,
      signal,
    );
  const quoteApprovalState = !authorized || quoteTarget == null
    ? undefined
    : quoteTarget.actor.id?.href === actor.id?.href
    ? "notRequired"
    : raw.quoteAuthorizationId == null
    ? "pending"
    : "accepted";
  const directRecipientIds = new Set(mentionedActorIds);
  if (quoteTarget?.actor.id != null) {
    directRecipientIds.add(quoteTarget.actor.id.href);
  }
  return new (authorized ? AuthorizedMessageImpl : MessageImpl)(session, {
    raw,
    id: raw.id,
    actor,
    visibility: getMessageVisibility(
      raw.toIds,
      raw.ccIds,
      actor,
      directRecipientIds,
    ),
    language: raw.content instanceof LanguageString
      ? raw.content.locale
      : undefined,
    text: decode(text),
    html,
    replyTarget,
    quoteTarget,
    quotePolicy,
    quoteApproved,
    quoteApprovalState,
    mentions,
    hashtags,
    attachments,
    published: raw.published ?? undefined,
    updated: raw.updated ?? undefined,
  });
}

async function verifyQuoteApproval<TContextData>(
  raw: MessageClass,
  quoteTarget: Message<MessageClass, TContextData>,
  session: SessionImpl<TContextData>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (
    raw.id == null ||
    raw.quoteAuthorizationId == null ||
    quoteTarget.actor.id == null
  ) {
    return false;
  }
  try {
    const parsed = parseLocalUri(
      session.context,
      raw.quoteAuthorizationId,
      session.bot.legacyObjectUrisIdentifier,
    );
    const authorization = parsed?.type === "object" &&
        parsed.class === QuoteAuthorization &&
        parsed.values.identifier === session.bot.identifier
      ? await session.bot.repository.getQuoteAuthorization(
        parsed.values.id as Uuid,
      )
      : await session.context.lookupObject(
        raw.quoteAuthorizationId,
        {
          contextLoader: session.context.contextLoader,
          documentLoader: await session.context.getDocumentLoader(
            session.bot,
          ),
          signal,
        },
      );
    return validateQuoteAuthorization(authorization, {
      authorizationId: raw.quoteAuthorizationId,
      quoteId: raw.id,
      targetId: quoteTarget.id,
      targetActorId: quoteTarget.actor.id,
    });
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return false;
  }
}

export function getMessageVisibility(
  toIds: URL[],
  ccIds: URL[],
  actor: Actor,
  mentionedActorIds?: Set<string>,
): MessageVisibility {
  const to = toIds.map((url) => url.href);
  const cc = ccIds.map((url) => url.href);
  const recipients = new Set([...to, ...cc]);
  return to.includes(PUBLIC_COLLECTION.href)
    ? "public"
    : cc.includes(PUBLIC_COLLECTION.href)
    ? "unlisted"
    : actor.followersId != null &&
        (to.includes(actor.followersId.href) ||
          cc.includes(actor.followersId.href))
    ? "followers"
    : recipients.size > 0 &&
        recipients.intersection(mentionedActorIds ?? new Set()).size ===
          recipients.size
    ? "direct"
    : "unknown";
}

export function isQuoteLink(tag: Link): boolean {
  if (tag.rel === "https://misskey-hub.net/ns#_misskey_quote") return true;
  else if (tag.mediaType == null) return false;
  // FIXME: Properly parse the media type
  const parsed = tag.mediaType.split(";");
  const type = parsed[0].trim();
  if (type === "application/activity+json") return true;
  const params: Record<string, string> = {};
  for (let i = 1; i < parsed.length; i++) {
    const param = parsed[i].trim().split("=");
    if (param.length === 2) {
      params[param[0]] = param[1].replace(/"/g, "");
    }
  }
  return type === "application/ld+json" &&
    params.profile === "https://www.w3.org/ns/activitystreams";
}
