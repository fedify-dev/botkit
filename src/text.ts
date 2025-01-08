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
  getActorHandle,
  isActor,
  Link,
  Mention,
  type Object,
} from "@fedify/fedify";
import { escape } from "@std/html/entities";
import type { Session } from "./session.ts";

/**
 * A tree structure representing a text with formatting.  It does not only
 * render the text but also extract tags (e.g., mentions) from it.
 * @typeParam TContextData The type of the context data.
 */
export interface Text<TContextData> {
  /**
   * Render a text tree as HTML.
   * @param session The bot session.
   * @returns An async iterable of HTML chunks.
   */
  getHtml(session: Session<TContextData>): AsyncIterable<string>;

  /**
   * Extract tags (e.g., mentions) from a text tree.
   * @param session The bot session
   * @returns An async iterable of tags.
   */
  getTags(session: Session<TContextData>): AsyncIterable<Link>;

  /**
   * Gets cached objects. The result of this method depends on
   * whether {@link getHtml} or {@link getTags} has been called before.
   * It's used for optimizing the post rendering process, e.g., reusing
   * once fetched remote objects.
   * @returns The cached objects.  The order of the objects does not matter.
   */
  getCachedObjects(): Object[];
}

/**
 * Checks if a value is a {@link Text} tree.
 * @param value The value to check.
 * @returns `true` if the value is a {@link Text} tree, `false` otherwise.
 * @typeParam TContextData The type of the context data.
 */
export function isText<TContextData>(
  value: unknown,
): value is Text<TContextData> {
  return typeof value === "object" && value !== null && "getHtml" in value &&
    "getTags" in value && typeof value.getHtml === "function" &&
    typeof value.getTags === "function";
}

/**
 * A text tree that renders a template string with values.  You normally
 * don't need to instantiate this directly; use the {@link text} function
 * instead.
 * @typeParam TContextData The type of the context data.
 */
export class TemplatedText<TContextData> implements Text<TContextData> {
  #strings: TemplateStringsArray;
  #values: unknown[];

  /**
   * Creates a text tree with a template string and values.
   * @param strings The template strings.
   * @param values The values to interpolate.
   */
  constructor(strings: TemplateStringsArray, ...values: unknown[]) {
    this.#strings = strings;
    this.#values = values.map((v) => {
      if (isActor(v)) return mention(v);
      return v;
    });
  }

  async *getHtml(session: Session<TContextData>): AsyncIterable<string> {
    let p: "opened" | "closed" = "closed";
    for (let i = 0; i < this.#strings.length; i++) {
      let text = this.#strings[i];
      let m: RegExpMatchArray | null;
      do {
        m = text.match(/([ \t]*\r?\n)+/);
        if (m != null) {
          const prefix = text.substring(0, m.index ?? 0);
          if (prefix.trim() !== "") {
            if (p === "closed") {
              yield "<p>";
              p = "opened";
            }
            yield escape(prefix);
          }
          text = text.substring((m.index ?? 0) + m[0].length);
          if (m[0].match(/([ \t]*\r?\n){2}/)) {
            if (p === "opened") yield "</p><p>";
          } else if (text.trim() !== "") {
            yield "<br>";
          }
        }
      } while (m != null);
      if (p === "closed") {
        yield "<p>";
        p = "opened";
      }
      yield escape(text);
      if (i < this.#values.length) {
        const value = this.#values[i];
        if (isText<TContextData>(value)) {
          yield* value.getHtml(session);
        } else {
          yield escape(String(value));
        }
      }
    }
    if (p === "opened") yield "</p>";
  }

  async *getTags(session: Session<TContextData>): AsyncIterable<Link> {
    for (const value of this.#values) {
      if (!isText<TContextData>(value)) continue;
      yield* value.getTags(session);
    }
  }

  getCachedObjects(): Object[] {
    const objects: Object[] = [];
    for (const value of this.#values) {
      if (!isText<TContextData>(value)) continue;
      objects.push(...value.getCachedObjects());
    }
    return objects;
  }
}

/**
 * A template string tag that creates a {@link Text} tree.
 *
 * Basically, it only interpolates values into the template string and
 * escapes HTML characters, except for line breaks and paragraphs.
 * For example, the below code:
 *
 * ```ts
 * text`Hello, <${em("World")}>!\n\nGoodbye!`
 * ```
 *
 * will be rendered as:
 *
 * ```html
 * <p>Hello, &lt;<em>World</em>&gt;!</p>
 * <p>Goodbye!</p>
 * ```
 *
 * @typeParam TContextData The type of the context data.
 * @param strings The template strings.
 * @param values The values to interpolate.
 * @returns A {@link Text} tree.
 */
export function text<TContextData>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Text<TContextData> {
  return new TemplatedText<TContextData>(strings, ...values);
}

/**
 * A text tree that renders a plain text.  You normally don't need to
 * instantiate this directly; use the {@link plainText} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class PlainText<TContextData> implements Text<TContextData> {
  readonly text: string;

  /**
   * Creates a {@link PlainText} tree with a plain text.
   * @param text The plain text.
   */
  constructor(text: string) {
    this.text = text;
  }

  async *getHtml(_session: Session<TContextData>): AsyncIterable<string> {
    yield escape(this.text);
  }

  async *getTags(_session: Session<TContextData>): AsyncIterable<Link> {
  }

  getCachedObjects(): Object[] {
    return [];
  }
}

/**
 * A function that creates a {@link PlainText} tree.  It only does one simple
 * thing: escaping the given text so that it can be safely rendered as HTML.
 * @typeParam TContextData The type of the context data.
 * @param text The plain text.
 * @returns A {@link PlainText} tree.
 */
export function plainText<TContextData>(text: string): Text<TContextData> {
  return new PlainText(text);
}

/**
 * A text tree that renders a mention.  You normally don't need to
 * instantiate this directly; use the {@link mention} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class MentionText<TContextData> implements Text<TContextData> {
  #label: string | ((session: Session<TContextData>) => Promise<string>);
  #actor: Actor | ((session: Session<TContextData>) => Promise<Object | null>);
  #cachedObject?: Object;
  #labelPromise?: Promise<string>;
  #actorPromise?: Promise<Object | null>;

  /**
   * Creates a {@link MentionText} tree with a label and an actor.
   * @param label The label of the mention.
   * @param actor The actor which the mention refers to.
   */
  constructor(
    label: string | ((session: Session<TContextData>) => Promise<string>),
    actor: Actor | ((session: Session<TContextData>) => Promise<Object | null>),
  ) {
    this.#label = label;
    this.#actor = actor;
    if (isActor(actor)) this.#cachedObject = actor;
  }

  #getLabel(session: Session<TContextData>): Promise<string> {
    if (typeof this.#label === "string") return Promise.resolve(this.#label);
    if (this.#labelPromise != null) return this.#labelPromise;
    return this.#labelPromise = this.#label(session);
  }

  #getActor(session: Session<TContextData>): Promise<Object | null> {
    if (isActor(this.#actor)) return Promise.resolve(this.#actor);
    if (this.#actorPromise != null) return this.#actorPromise;
    return this.#actorPromise = this.#actor(session).then((actor) => {
      if (actor != null) this.#cachedObject = actor;
      return actor;
    });
  }

  async *getHtml(session: Session<TContextData>): AsyncIterable<string> {
    const label = await this.#getLabel(session);
    const actor = await this.#getActor(session);
    const url = !isActor(actor)
      ? null
      : actor.url == null
      ? actor.id
      : actor.url instanceof Link
      ? actor.url.href
      : actor.url;
    if (url == null) {
      yield escape(label);
      return;
    }
    yield '<a href="';
    yield escape(url.href);
    yield '" translate="no" class="h-card u-url mention" target="_blank">';
    if (label.startsWith("@")) {
      yield "@<span>";
      yield escape(label.substring(1));
      yield "</span>";
    } else {
      yield escape(label);
    }
    yield "</a>";
  }

  async *getTags(session: Session<TContextData>): AsyncIterable<Link> {
    const label = await this.#getLabel(session);
    const actor = await this.#getActor(session);
    if (isActor(actor)) {
      yield new Mention({
        name: label,
        href: actor.id,
      });
    }
  }

  getCachedObjects(): Object[] {
    return this.#cachedObject == null ? [] : [this.#cachedObject];
  }
}

/**
 * Mentions an actor by its fediverse handle.  You can use this function
 * to create a {@link MentionText} tree.  The label of the mention will be
 * the same as the handle.
 *
 * If the given handle does not refer to an actor, the returned tree consists
 * of a plain text with the handle without any link.
 * @typeParam TContextData The type of the context data.
 * @param handle The handle of the actor.
 * @returns A {@link MentionText} tree.
 */
export function mention<TContextData>(handle: string): Text<TContextData>;

/**
 * Mentions an actor.  You can use this function to create a {@link MentionText}
 * from an actor object.  The label of the mention will be the fediverse handle
 * of the actor.
 * @typeParam TContextData The type of the context data.
 * @param actor The actor to mention.
 * @returns A {@link MentionText} tree.
 */
export function mention<TContextData>(actor: Actor | URL): Text<TContextData>;

/**
 * Mentions an actor with a custom label.  You can use this function to create
 * a {@link MentionText} tree from an actor object with a custom label.
 *
 * If the given actor is a URL and the URL does not refer to an actor,
 * the returned tree consists of a plain text with the URL without any link.
 * @typeParam TContextData The type of the context data.
 * @param label The label of the mention.
 * @param actor The actor to mention.
 */
export function mention<TContextData>(
  label: string,
  actor: Actor | URL,
): Text<TContextData>;

export function mention<TContextData>(
  a: string | Actor | URL,
  b?: Actor | URL,
): Text<TContextData> {
  if (b != null) {
    return new MentionText<TContextData>(
      a as string,
      isActor(b) ? b : async (session) => {
        const documentLoader = await session.context.getDocumentLoader(
          session.bot,
        );
        return await session.context.lookupObject(b, { documentLoader });
      },
    );
  } else if (typeof a === "string") {
    return new MentionText<TContextData>(
      a,
      async (session) => {
        const documentLoader = await session.context.getDocumentLoader(
          session.bot,
        );
        return await session.context.lookupObject(a, { documentLoader });
      },
    );
  } else if (isActor(a)) {
    return new MentionText<TContextData>(
      (session) => getActorHandle(a, session.context),
      a,
    );
  }
  return new MentionText<TContextData>(
    (session) => getActorHandle(a, session.context),
    async (session) => {
      const documentLoader = await session.context.getDocumentLoader(
        session.bot,
      );
      return await session.context.lookupObject(a, { documentLoader });
    },
  );
}

/**
 * A text tree that renders a `<strong>` text.  You normally don't need to
 * instantiate this directly; use the {@link strong} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class StrongText<TContextData> implements Text<TContextData> {
  #text: Text<TContextData>;

  /**
   * Creates a {@link StrongText} tree with a text.
   * @param text The text to render as `<strong>`.
   */
  constructor(text: Text<TContextData> | string) {
    this.#text = typeof text === "string" ? new PlainText(text) : text;
  }

  async *getHtml(session: Session<TContextData>): AsyncIterable<string> {
    yield "<strong>";
    yield* this.#text.getHtml(session);
    yield "</strong>";
  }

  getTags(session: Session<TContextData>): AsyncIterable<Link> {
    return this.#text.getTags(session);
  }

  getCachedObjects(): Object[] {
    return [];
  }
}

/**
 * Applies `<strong>` tag to a text.  You can use this function to create a
 * {@link StrongText} tree.
 * @typeParam TContextData The type of the context data.
 * @param text The text to render as `<strong>`.  It can be a plain text or
 *             another text tree.
 * @returns A {@link StrongText} tree.
 */
export function strong<TContextData>(
  text: Text<TContextData> | string,
): Text<TContextData> {
  return new StrongText(text);
}

/**
 * A text tree that renders an `<em>` text.  You normally don't need to
 * instantiate this directly; use the {@link em} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class EmText<TContextData> implements Text<TContextData> {
  #text: Text<TContextData>;

  constructor(text: Text<TContextData> | string) {
    this.#text = typeof text === "string" ? new PlainText(text) : text;
  }

  async *getHtml(session: Session<TContextData>): AsyncIterable<string> {
    yield "<em>";
    yield* this.#text.getHtml(session);
    yield "</em>";
  }

  getTags(session: Session<TContextData>): AsyncIterable<Link> {
    return this.#text.getTags(session);
  }

  getCachedObjects(): Object[] {
    return [];
  }
}

/**
 * Applies `<em>` tag to a text.  You can use this function to create an
 * {@link EmText} tree.
 * @typeParam TContextData The type of the context data.
 * @param text The text to render as `<em>`.  It can be a plain text or
 *             another text tree.
 * @returns A {@link EmText} tree.
 */
export function em<TContextData>(
  text: Text<TContextData> | string,
): Text<TContextData> {
  return new EmText(text);
}

/**
 * A text tree that renders a link.  You normally don't need to instantiate
 * this directly; use the {@link link} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class LinkText<TContextData> implements Text<TContextData> {
  #label: Text<TContextData>;
  #href: URL;

  /**
   * Creates a {@link LinkText} tree with a label and a URL.
   * @param label The label of the link.
   * @param href The URL of the link.  It has to be an absolute URL.
   */
  constructor(label: Text<TContextData> | string, href: URL | string) {
    this.#label = typeof label === "string" ? new PlainText(label) : label;
    this.#href = typeof href === "string" ? new URL(href) : href;
  }

  async *getHtml(session: Session<TContextData>): AsyncIterable<string> {
    yield '<a href="';
    yield escape(this.#href.href);
    yield '" target="_blank">';
    yield* this.#label.getHtml(session);
    yield "</a>";
  }

  getTags(session: Session<TContextData>): AsyncIterable<Link> {
    return this.#label.getTags(session);
  }

  getCachedObjects(): Object[] {
    return this.#label.getCachedObjects();
  }
}

/**
 * Creates a link to the given `href` with the `label`.  You can use this
 * function to create a {@link LinkText} tree.
 * @typeParam TContextData The type of the context data.
 * @param label The displayed label of the link.
 * @param href The link target.  It has to be an absolute URL.
 * @returns A {@link LinkText} tree.
 */
export function link<TContextData>(
  label: Text<TContextData> | string,
  href: URL | string,
): Text<TContextData>;

/**
 * Creates a link to the given `url` with no label.  You can use this function
 * to create a {@link LinkText} tree.  The label of the link will be the same
 * as the given `url`.
 * @param url The link target.  It has to be an absolute URL.
 * @returns A {@link LinkText} tree.
 */
export function link<TContextData>(url: URL | string): Text<TContextData>;

export function link<TContextData>(
  label: Text<TContextData> | string | URL,
  href?: URL | string,
): Text<TContextData> {
  return href == null
    ? new LinkText(String(label), label as string)
    : new LinkText(isText(label) ? label : label.toString(), href);
}
