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
  type Actor,
  type Context,
  Create,
  isActor,
  type KvKey,
  LanguageString,
  Mention,
  Note,
  type Object,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import { Follow, Undo } from "@fedify/fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { generate as uuidv7 } from "@std/uuid/unstable-v7";
import type { BotImpl } from "./bot-impl.ts";
import { createMessage } from "./message-impl.ts";
import type { AuthorizedMessage, Message, MessageClass } from "./message.ts";
import type {
  Session,
  SessionPublishOptions,
  SessionPublishOptionsWithClass,
} from "./session.ts";
import type { Text } from "./text.ts";

const logger = getLogger(["botkit", "session"]);

export interface SessionImplPublishOptions<TContextData>
  extends SessionPublishOptions {
  replyTarget?: Message<MessageClass, TContextData>;
}

export interface SessionImplPublishOptionsWithClass<
  T extends MessageClass,
  TContextData,
> extends
  SessionPublishOptionsWithClass<T>,
  SessionImplPublishOptions<TContextData> {
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
      const documentLoader = await this.context.getDocumentLoader(this.bot);
      const object = await this.context.lookupObject(actor, { documentLoader });
      if (!isActor(object)) {
        throw new TypeError("The resolved object is not an Actor.");
      }
      actor = object;
    }
    if (actor.id == null) {
      throw new TypeError("The actor does not have an ID.");
    }
    const followee = await this.bot.kv.get([
      ...this.bot.kvPrefixes.followees,
      actor.id.href,
    ]);
    if (followee != null) {
      logger.warn(
        "The bot is already following the actor {actor}.",
        { actor: actor.id.href },
      );
      return;
    }
    const id = uuidv7();
    const follow = new Follow({
      id: this.context.getObjectUri(Follow, { id }),
      actor: this.context.getActorUri(this.bot.identifier),
      object: actor.id,
      to: actor.id,
    });
    await this.bot.kv.set(
      [...this.bot.kvPrefixes.follows, id],
      await follow.toJsonLd({
        format: "compact",
        contextLoader: this.context.contextLoader,
      }),
    );
    await this.context.sendActivity(
      this.bot,
      actor,
      follow,
      { excludeBaseUris: [new URL(this.context.origin)] },
    );
  }

  async unfollow(actor: Actor | URL | string): Promise<void> {
    const documentLoader = await this.context.getDocumentLoader(this.bot);
    if (actor instanceof URL || typeof actor === "string") {
      const object = await this.context.lookupObject(actor, { documentLoader });
      if (!isActor(object)) {
        throw new TypeError("The resolved object is not an Actor.");
      }
      actor = object;
    }
    if (actor.id == null) {
      throw new TypeError("The actor does not have an ID.");
    }
    const followJson = await this.bot.kv.get(
      [...this.bot.kvPrefixes.followees, actor.id.href],
    );
    if (followJson == null) {
      logger.warn(
        "The bot is not following the actor {actor}.",
        { actor: actor.id.href },
      );
      return;
    }
    let follow: Follow;
    try {
      follow = await Follow.fromJsonLd(followJson, {
        contextLoader: this.context.contextLoader,
        documentLoader,
      });
    } catch {
      return;
    } finally {
      await this.bot.kv.delete([
        ...this.bot.kvPrefixes.followees,
        actor.id.href,
      ]);
    }
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
        { excludeBaseUris: [new URL(this.context.origin)] },
      );
    }
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
    options:
      | SessionImplPublishOptions<TContextData>
      | SessionImplPublishOptionsWithClass<MessageClass, TContextData> = {},
  ): Promise<AuthorizedMessage<MessageClass, TContextData>> {
    const published = new Date();
    const id = uuidv7(+published);
    const cls = "class" in options ? options.class : Note;
    const visibility = options.visibility ?? "public";
    let contentHtml = "";
    for await (const chunk of content.getHtml(this)) {
      contentHtml += chunk;
    }
    const tags = await Array.fromAsync(content.getTags(this));
    const mentionedActorIds: URL[] = [];
    for (const tag of tags) {
      if (tag instanceof Mention && tag.href != null) {
        mentionedActorIds.push(tag.href);
      }
    }
    const msg = new cls({
      id: this.context.getObjectUri<MessageClass>(cls, { id }),
      contents: options.language == null
        ? [contentHtml]
        : [new LanguageString(contentHtml, options.language), contentHtml],
      replyTarget: options.replyTarget?.id,
      tags,
      attribution: this.context.getActorUri(this.bot.identifier),
      attachments: options.attachments ?? [],
      tos: visibility === "public"
        ? [PUBLIC_COLLECTION, ...mentionedActorIds]
        : visibility === "unlisted" || visibility === "followers"
        ? [
          this.context.getFollowersUri(this.bot.identifier),
          ...mentionedActorIds,
        ]
        : mentionedActorIds,
      ccs: visibility === "public"
        ? [this.context.getFollowersUri(this.bot.identifier)]
        : visibility === "unlisted"
        ? [PUBLIC_COLLECTION]
        : [],
      published: published.toTemporalInstant(),
    });
    const activity = new Create({
      id: this.context.getObjectUri(Create, { id }),
      actors: msg.attributionIds,
      tos: msg.toIds,
      ccs: msg.ccIds,
      object: msg,
      published: published.toTemporalInstant(),
    });
    const kv = this.bot.kv;
    const messageKey: KvKey = [...this.bot.kvPrefixes.messages, id];
    await kv.set(
      messageKey,
      await activity.toJsonLd({
        format: "compact",
        contextLoader: this.context.contextLoader,
      }),
    );
    const lockKey: KvKey = [...this.bot.kvPrefixes.messages, "lock"];
    const listKey: KvKey = this.bot.kvPrefixes.messages;
    do {
      await kv.set(lockKey, id);
      const set = new Set(await kv.get<string[]>(listKey) ?? []);
      set.add(id);
      const list = [...set];
      list.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      await kv.set(listKey, list);
    } while (await kv.get(lockKey) !== id);
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
    if (mentionedActorIds.length > 0) {
      const cachedObjects: Record<string, Object> = {};
      for (const cachedObject of content.getCachedObjects()) {
        if (cachedObject.id == null) continue;
        cachedObjects[cachedObject.id.href] = cachedObject;
      }
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
    return await createMessage(msg, this, options.replyTarget, true);
  }
}
