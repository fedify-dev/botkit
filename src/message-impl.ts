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
import { LanguageString } from "@fedify/fedify/runtime";
import {
  type Actor,
  Announce,
  Article,
  ChatMessage,
  Create,
  Delete,
  Document,
  Hashtag,
  isActor,
  Like as RawLike,
  type Link,
  Mention,
  Note,
  type Object,
  PUBLIC_COLLECTION,
  Question,
  Tombstone,
  Undo,
  Update,
} from "@fedify/fedify/vocab";
import type { LanguageTag } from "@phensley/language-tag";
import { unescape } from "@std/html/entities";
import { generate as uuidv7 } from "@std/uuid/unstable-v7";
import { FilterXSS, getDefaultWhiteList } from "xss";
import type {
  AuthorizedMessage,
  AuthorizedSharedMessage,
  Message,
  MessageClass,
  MessageShareOptions,
  MessageVisibility,
} from "./message.ts";
import type { AuthorizedLike } from "./reaction.ts";
import type { Uuid } from "./repository.ts";
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
  readonly language?: LanguageTag | undefined;
  text: string;
  html: string;
  readonly replyTarget?: Message<MessageClass, TContextData> | undefined;
  mentions: readonly Actor[];
  hashtags: readonly Hashtag[];
  readonly attachments: readonly Document[];
  readonly published?: Temporal.Instant;
  updated?: Temporal.Instant;

  constructor(
    session: SessionImpl<TContextData>,
    message: Omit<
      Message<T, TContextData>,
      "delete" | "reply" | "share" | "like"
    >,
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
    this.mentions = message.mentions;
    this.hashtags = message.hashtags;
    this.attachments = message.attachments;
    this.published = message.published;
    this.updated = message.updated;
  }

  reply(
    text: Text<"block", TContextData>,
    options?: SessionPublishOptions,
  ): Promise<AuthorizedMessage<Note, TContextData>>;
  reply<T extends MessageClass>(
    text: Text<"block", TContextData>,
    options?: SessionPublishOptionsWithClass<T> | undefined,
  ): Promise<AuthorizedMessage<T, TContextData>>;
  reply(
    text: Text<"block", TContextData>,
    options?:
      | SessionPublishOptions
      | SessionPublishOptionsWithClass<MessageClass>,
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
    const id = uuidv7(+published) as Uuid;
    const visibility = options.visibility ?? this.visibility;
    const originalActor = this.actor.id == null ? [] : [this.actor.id];
    const uri = this.session.context.getObjectUri(Announce, { id });
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
        await this.session.context.sendActivity(
          this.session.bot,
          "followers",
          new Undo({
            id: new URL("#delete", uri),
            actor: this.session.context.getActorUri(
              this.session.bot.identifier,
            ),
            tos: announce.toIds,
            ccs: announce.ccIds,
            object: announce,
          }),
          {
            preferSharedInbox: true,
            excludeBaseUris: [new URL(this.session.context.origin)],
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
          },
        );
      },
    };
  }
}

export class AuthorizedMessageImpl<T extends MessageClass, TContextData>
  extends MessageImpl<T, TContextData>
  implements AuthorizedMessage<T, TContextData> {
  async update(text: Text<"block", TContextData>): Promise<void> {
    const parsed = this.session.context.parseUri(this.id);
    if (
      parsed?.type !== "object" ||
      !messageClasses.some((cls) => parsed.class === cls)
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
        this.text = unescape(textXss.process(contentHtml));
        existingMentions = this.mentions;
        this.mentions = mentionedActors;
        this.hashtags = hashtags;
        const updated = Temporal.Now.instant();
        this.updated = updated;
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
            ]
            : mentionedActorIds,
          ccs: this.visibility === "public"
            ? [
              this.session.context.getFollowersUri(this.session.bot.identifier),
            ]
            : this.visibility === "unlisted"
            ? [PUBLIC_COLLECTION]
            : [],
          updated,
        });
        this.raw = newMessage as T;
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
            this.session.context.getObjectUri(Create, { id }),
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
  }

  async delete(): Promise<void> {
    const parsed = this.session.context.parseUri(this.id);
    if (
      parsed?.type !== "object" ||
      !messageClasses.some((cls) => parsed.class === cls)
    ) {
      return;
    }
    const { id } = parsed.values;
    const create = await this.session.bot.repository.removeMessage(id as Uuid);
    if (create == null) return;
    const message = await create.getObject(this.session.context);
    if (message == null) return;
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
  }
}

const allowList = getDefaultWhiteList();
const htmlXss = new FilterXSS({
  allowList: {
    ...allowList,
    a: [...allowList.a ?? [], "class", "translate"],
  },
});
export const textXss = new FilterXSS({
  allowList: {},
  stripIgnoreTag: true,
});

export async function createMessage<T extends MessageClass, TContextData>(
  raw: T,
  session: SessionImpl<TContextData>,
  cachedObjects: Record<string, Object>,
  replyTarget?: Message<MessageClass, TContextData>,
  authorized?: true,
): Promise<AuthorizedMessage<T, TContextData>>;
export async function createMessage<T extends MessageClass, TContextData>(
  raw: T,
  session: SessionImpl<TContextData>,
  cachedObjects: Record<string, Object>,
  replyTarget?: Message<MessageClass, TContextData>,
  authorized?: boolean,
): Promise<Message<T, TContextData>>;
export async function createMessage<T extends MessageClass, TContextData>(
  raw: T,
  session: SessionImpl<TContextData>,
  cachedObjects: Record<string, Object>,
  replyTarget?: Message<MessageClass, TContextData>,
  authorized: boolean = false,
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
  };
  const actor = raw.attributionId?.href === session.actorId?.href
    ? await session.getActor()
    : await raw.getAttribution(options);
  if (actor == null) {
    throw new TypeError("The raw.attributionId is required.");
  }
  const content = raw.content.toString();
  const text = textXss.process(content);
  const html = htmlXss.process(content);
  const mentions: Actor[] = [];
  const mentionedActorIds = new Set<string>();
  const hashtags: Hashtag[] = [];
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
    }
  }
  const attachments: Document[] = [];
  for await (const attachment of raw.getAttachments(options)) {
    if (attachment instanceof Document) attachments.push(attachment);
  }
  if (replyTarget == null) {
    let rt: Link | Object | null;
    const parsed = session.context.parseUri(raw.replyTargetId);
    // @ts-ignore: The `class` property satisfies the `MessageClass` type.
    if (parsed?.type === "object" && messageClasses.includes(parsed.class)) {
      // @ts-ignore: The `class` property satisfies the `MessageClass` type.
      // deno-lint-ignore no-explicit-any
      const cls: new (values: any) => T = parsed.class;
      rt = await session.bot.dispatchMessage(
        cls,
        session.context,
        parsed.values.id,
      );
    } else rt = await raw.getReplyTarget(options);
    if (
      rt instanceof Article || rt instanceof ChatMessage ||
      rt instanceof Note || rt instanceof Question
    ) {
      replyTarget = await createMessage(rt, session, cachedObjects);
    }
  }
  return new (authorized ? AuthorizedMessageImpl : MessageImpl)(session, {
    raw,
    id: raw.id,
    actor,
    visibility: getMessageVisibility(
      raw.toIds,
      raw.ccIds,
      actor,
      mentionedActorIds,
    ),
    language: raw.content instanceof LanguageString
      ? raw.content.language
      : undefined,
    text: unescape(text),
    html,
    replyTarget,
    mentions,
    hashtags,
    attachments,
    published: raw.published ?? undefined,
    updated: raw.updated ?? undefined,
  });
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
