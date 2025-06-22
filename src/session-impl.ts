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
  LanguageString,
  Mention,
  Note,
  type Object,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import { Follow, Link, Undo } from "@fedify/fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { escape } from "@std/html/entities";
import { v7 as uuidv7 } from "uuid";
import type { BotImpl } from "./bot-impl.ts";
import { createMessage, isMessageObject } from "./message-impl.ts";
import type { AuthorizedMessage, Message, MessageClass } from "./message.ts";
import type { Uuid } from "./repository.ts";
import type {
  Session,
  SessionGetOutboxOptions,
  SessionPublishOptions,
  SessionPublishOptionsWithClass,
} from "./session.ts";
import type { Text } from "./text.ts";

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
      id: this.context.getObjectUri(Follow, { id }),
      actor: this.context.getActorUri(this.bot.identifier),
      object: actor.id,
      to: actor.id,
    });
    await this.bot.repository.addSentFollow(id, follow);
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
        { excludeBaseUris: [new URL(this.context.origin)] },
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
        if (!isActor(object)) {
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
    const id = uuidv7({ msecs: +published }) as Uuid;
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
    if (options.quoteTarget != null) {
      let url = options.quoteTarget.raw.url ?? options.quoteTarget.id;
      if (url instanceof Link) url = url.href ?? options.quoteTarget.id;
      contentHtml += `\n\n<p class="quote-inline"><br>RE: <a href="${
        escape(url.href)
      }">${escape(url.href)}</a></p>`;
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
    const msg = new cls({
      id: this.context.getObjectUri<MessageClass>(cls, { id }),
      contents: options.language == null
        ? [contentHtml]
        : [new LanguageString(contentHtml, options.language), contentHtml],
      replyTarget: options.replyTarget?.id,
      quoteUrl: options.quoteTarget?.id,
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
      url: new URL(`/message/${id}`, this.context.origin),
    });
    const activity = new Create({
      id: this.context.getObjectUri(Create, { id }),
      actors: msg.attributionIds,
      tos: msg.toIds,
      ccs: msg.ccIds,
      object: msg,
      published: published.toTemporalInstant(),
    });
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
    for (const cachedObject of content.getCachedObjects()) {
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
      const message = await createMessage(object, this, {});
      yield message;
    }
  }
}
