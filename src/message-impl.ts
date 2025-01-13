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
import type { KvKey } from "@fedify/fedify/federation";
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
  type Link,
  Mention,
  Note,
  type Object,
  PUBLIC_COLLECTION,
  Question,
  Tombstone,
  Undo,
} from "@fedify/fedify/vocab";
import type { LanguageTag } from "@phensley/language-tag";
import { unescape } from "@std/html/entities";
import { generate as uuidv7 } from "@std/uuid/unstable-v7";
import { FilterXSS } from "xss";
import type {
  Message,
  MessageClass,
  MessageShareOptions,
  MessageVisibility,
  SharedMessage,
} from "./message.ts";
import type { SessionImpl } from "./session-impl.ts";
import type {
  SessionPublishOptions,
  SessionPublishOptionsWithClass,
} from "./session.ts";
import type { Text } from "./text.ts";

export const messageClasses = [Article, ChatMessage, Note, Question];

export class MessageImpl<T extends MessageClass, TContextData>
  implements Message<T, TContextData> {
  readonly session: SessionImpl<TContextData>;
  readonly raw: T;
  readonly id: URL;
  readonly actor: Actor;
  readonly visibility: MessageVisibility;
  readonly language?: LanguageTag | undefined;
  readonly text: string;
  readonly html: string;
  readonly replyTarget?: Message<MessageClass, TContextData> | undefined;
  readonly mentions: readonly Actor[];
  readonly hashtags: readonly Hashtag[];
  readonly attachments: readonly Document[];
  readonly published?: Temporal.Instant;
  readonly updated?: Temporal.Instant;

  constructor(
    session: SessionImpl<TContextData>,
    message: Omit<Message<T, TContextData>, "delete" | "reply" | "share">,
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

  async delete(): Promise<void> {
    const parsed = this.session.context.parseUri(this.id);
    if (
      parsed?.type !== "object" ||
      !messageClasses.some((cls) => parsed.class === cls)
    ) {
      return;
    }
    const { id } = parsed.values;
    const kv = this.session.bot.kv;
    const listKey: KvKey = this.session.bot.kvPrefixes.messages;
    const lockKey: KvKey = [...listKey, "lock"];
    const lockId = `${id}:delete`;
    do {
      await kv.set(lockKey, lockId);
      const set = new Set(await kv.get<string[]>(listKey) ?? []);
      set.delete(id);
      const list = [...set];
      list.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      await kv.set(listKey, list);
    } while (await kv.get(lockKey) !== lockId);
    const messageKey: KvKey = [...listKey, id];
    const createJson = await kv.get(messageKey);
    if (createJson == null) return;
    await kv.delete(messageKey);
    const create = await Create.fromJsonLd(createJson, this.session.context);
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
    for (const actor of mentionedActors) {
      await this.session.context.sendActivity(
        this.session.bot,
        actor,
        activity,
        { preferSharedInbox: true, excludeBaseUris },
      );
    }
  }

  reply(
    text: Text<"block", TContextData>,
    options?: SessionPublishOptions,
  ): Promise<Message<Note, TContextData>>;
  reply<T extends MessageClass>(
    text: Text<"block", TContextData>,
    options?: SessionPublishOptionsWithClass<T> | undefined,
  ): Promise<Message<T, TContextData>>;
  reply(
    text: Text<"block", TContextData>,
    options?:
      | SessionPublishOptions
      | SessionPublishOptionsWithClass<MessageClass>,
  ): Promise<Message<MessageClass, TContextData>> {
    return this.session.publish(text, {
      visibility: this.visibility === "unknown" ? "direct" : this.visibility,
      ...options,
      replyTarget: this,
    });
  }

  async share(
    options: MessageShareOptions = {},
  ): Promise<SharedMessage<TContextData>> {
    const published = new Date();
    const id = uuidv7(+published);
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
    const kv = this.session.bot.kv;
    const listKey: KvKey = this.session.bot.kvPrefixes.messages;
    const messageKey: KvKey = [...listKey, id];
    await kv.set(messageKey, await announce.toJsonLd(this.session.context));
    const lockKey: KvKey = [...listKey, "lock"];
    do {
      await kv.set(lockKey, id);
      const set = new Set(await kv.get<string[]>(listKey) ?? []);
      set.add(id);
      const list = [...set];
      list.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      await kv.set(listKey, list);
    } while (await kv.get(lockKey) !== id);
    await this.session.context.sendActivity(
      this.session.bot,
      "followers",
      announce,
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(this.session.context.origin)],
      },
    );
    const actor = await announce.getActor(this.session.context);
    if (actor == null) throw new TypeError("The actor is required.");
    return {
      raw: announce,
      id: uri,
      actor,
      visibility,
      original: this,
      unshare: async () => {
        const lockId = `${id}:delete`;
        do {
          await kv.set(lockKey, lockId);
          const set = new Set(await kv.get<string[]>(listKey) ?? []);
          set.delete(id);
          const list = [...set];
          list.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
          await kv.set(listKey, list);
        } while (await kv.get(lockKey) !== lockId);
        await kv.delete(messageKey);
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
}

const htmlXss = new FilterXSS();
const textXss = new FilterXSS({
  allowList: {},
  stripIgnoreTag: true,
});

export async function createMessage<T extends MessageClass, TContextData>(
  raw: T,
  session: SessionImpl<TContextData>,
  replyTarget?: Message<MessageClass, TContextData>,
): Promise<Message<T, TContextData>> {
  if (raw.id == null) throw new TypeError(`The raw.id is required.`);
  else if (raw.content == null) {
    throw new TypeError(`The raw.content is required.`);
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
    throw new TypeError(`The raw.attributionId is required.`);
  }
  const content = raw.content.toString();
  const text = textXss.process(content);
  const html = htmlXss.process(content);
  const to = raw.toIds.map((uri) => uri.href);
  const cc = raw.ccIds.map((uri) => uri.href);
  const recipients = new Set([...to, ...cc]);
  const mentions: Actor[] = [];
  const mentionedActorIds = new Set<string>();
  const hashtags: Hashtag[] = [];
  for await (const tag of raw.getTags(options)) {
    if (tag instanceof Mention && tag.href != null) {
      const obj = await session.context.lookupObject(tag.href, options);
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
      rt = await session.bot.dispatchMessage(
        // @ts-ignore: The `class` property satisfies the `MessageClass` type.
        parsed.class,
        session.context,
        parsed.values.id,
      );
    } else rt = await raw.getReplyTarget(options);
    if (
      rt instanceof Article || rt instanceof ChatMessage ||
      rt instanceof Note || rt instanceof Question
    ) {
      replyTarget = await createMessage(rt, session);
    }
  }
  return new MessageImpl(session, {
    raw,
    id: raw.id,
    actor,
    visibility: to.includes(PUBLIC_COLLECTION.href)
      ? "public"
      : cc.includes(PUBLIC_COLLECTION.href)
      ? "unlisted"
      : actor.followersId != null &&
          (to.includes(actor.followersId.href) ||
            cc.includes(actor.followersId.href))
      ? "followers"
      : recipients.size > 0 &&
          recipients.intersection(mentionedActorIds).size === recipients.size
      ? "direct"
      : "unknown",
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
