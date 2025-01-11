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
import {
  mention as mentionPlugin,
  toFullHandle,
} from "@fedify/markdown-it-mention";
import { escape } from "@std/html/entities";
import MarkdownIt from "markdown-it";
import type { Session } from "./session.ts";

/**
 * A tree structure representing a text with formatting.  It does not only
 * render the text but also extract tags (e.g., mentions) from it.
 * @typeParam TContextData The type of the context data.
 */
export interface Text<TType extends "block" | "inline", TContextData> {
  /**
   * The type of the text.  It can be either `"block"` or `"inline"`.
   */
  readonly type: TType;

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
): value is Text<"block" | "inline", TContextData> {
  return typeof value === "object" && value !== null && "getHtml" in value &&
    "getTags" in value && typeof value.getHtml === "function" &&
    typeof value.getTags === "function" && "type" in value &&
    (value.type === "block" || value.type === "inline");
}

/**
 * A text tree that renders a template string with values.  You normally
 * don't need to instantiate this directly; use the {@link text} function
 * instead.
 * @typeParam TContextData The type of the context data.
 */
export class TemplatedText<TContextData>
  implements Text<"block", TContextData> {
  readonly type = "block";
  #strings: TemplateStringsArray;
  #values: Text<"block" | "inline", TContextData>[];

  /**
   * Creates a text tree with a template string and values.
   * @param strings The template strings.
   * @param values The values to interpolate.
   */
  constructor(strings: TemplateStringsArray, ...values: unknown[]) {
    this.#strings = strings;
    this.#values = values.map((v) => {
      if (isText<TContextData>(v)) return v;
      if (v instanceof URL) return link(v);
      if (isActor(v)) return mention(v);
      return new PlainText(String(v));
    });
  }

  async *getHtml(session: Session<TContextData>): AsyncIterable<string> {
    let paraState: "opened" | "closed" = "closed";
    for (let i = 0; i < this.#strings.length; i++) {
      const paragraphs = this.#strings[i].split(/([ \t]*\r?\n){2,}/g);
      let p = 0;
      for (const para of paragraphs) {
        if (p > 0 && paraState === "opened") {
          yield "</p>";
          paraState = "closed";
        }
        const lines = para.split("\n");
        let l = 0;
        for (const line of lines) {
          if (line.trim() === "") continue;
          if (l < 1 && paraState === "closed") {
            yield "<p>";
            paraState = "opened";
          }
          if (l > 0) yield "<br>";
          yield escape(line);
          l++;
        }
        p++;
      }
      if (i < this.#values.length) {
        const value = this.#values[i];
        if (value.type === "block" && paraState === "opened") {
          yield "</p>";
          paraState = "closed";
        } else if (value.type === "inline" && paraState === "closed") {
          yield "<p>";
          paraState = "opened";
        }
        yield* value.getHtml(session);
      }
    }
    if (paraState === "opened") yield "</p>";
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
): Text<"block", TContextData> {
  return new TemplatedText<TContextData>(strings, ...values);
}

/**
 * A text tree that renders a plain text.  You normally don't need to
 * instantiate this directly; use the {@link plainText} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class PlainText<TContextData> implements Text<"inline", TContextData> {
  readonly type = "inline";
  readonly text: string;

  /**
   * Creates a {@link PlainText} tree with a plain text.
   * @param text The plain text.
   */
  constructor(text: string) {
    this.text = text;
  }

  async *getHtml(_session: Session<TContextData>): AsyncIterable<string> {
    let first = true;
    for (const line of this.text.split("\n")) {
      if (!first) yield "<br>";
      yield escape(line);
      first = false;
    }
  }

  async *getTags(_session: Session<TContextData>): AsyncIterable<Link> {
  }

  getCachedObjects(): Object[] {
    return [];
  }
}

/**
 * A function that creates a {@link PlainText} tree.  It only does two simple
 * things:
 *
 * - Escaping the given text so that it can be safely rendered as HTML
 * - Splitting the text by line breaks and rendering them as hard line breaks
 * @typeParam TContextData The type of the context data.
 * @param text The plain text.
 * @returns A {@link PlainText} tree.
 */
export function plainText<TContextData>(
  text: string,
): Text<"inline", TContextData> {
  return new PlainText(text);
}

/**
 * A text tree that renders a mention.  You normally don't need to
 * instantiate this directly; use the {@link mention} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class MentionText<TContextData> implements Text<"inline", TContextData> {
  readonly type = "inline";
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
export function mention<TContextData>(
  handle: string,
): Text<"inline", TContextData>;

/**
 * Mentions an actor.  You can use this function to create a {@link MentionText}
 * from an actor object.  The label of the mention will be the fediverse handle
 * of the actor.
 * @typeParam TContextData The type of the context data.
 * @param actor The actor to mention.
 * @returns A {@link MentionText} tree.
 */
export function mention<TContextData>(
  actor: Actor | URL,
): Text<"inline", TContextData>;

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
): Text<"inline", TContextData>;

export function mention<TContextData>(
  a: string | Actor | URL,
  b?: Actor | URL,
): Text<"inline", TContextData> {
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
export class StrongText<TContextData> implements Text<"inline", TContextData> {
  readonly type = "inline";
  #text: Text<"inline", TContextData>;

  /**
   * Creates a {@link StrongText} tree with a text.
   * @param text The text to render as `<strong>`.
   */
  constructor(text: Text<"inline", TContextData> | string) {
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
  text: Text<"inline", TContextData> | string,
): Text<"inline", TContextData> {
  return new StrongText(text);
}

/**
 * A text tree that renders an `<em>` text.  You normally don't need to
 * instantiate this directly; use the {@link em} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class EmText<TContextData> implements Text<"inline", TContextData> {
  readonly type = "inline";
  #text: Text<"inline", TContextData>;

  constructor(text: Text<"inline", TContextData> | string) {
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
  text: Text<"inline", TContextData> | string,
): Text<"inline", TContextData> {
  return new EmText(text);
}

/**
 * A text tree that renders a link.  You normally don't need to instantiate
 * this directly; use the {@link link} function instead.
 * @typeParam TContextData The type of the context data.
 */
export class LinkText<TContextData> implements Text<"inline", TContextData> {
  readonly type = "inline";
  #label: Text<"inline", TContextData>;
  #href: URL;

  /**
   * Creates a {@link LinkText} tree with a label and a URL.
   * @param label The label of the link.
   * @param href The URL of the link.  It has to be an absolute URL.
   */
  constructor(
    label: Text<"inline", TContextData> | string,
    href: URL | string,
  ) {
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
  label: Text<"inline", TContextData> | string,
  href: URL | string,
): Text<"inline", TContextData>;

/**
 * Creates a link to the given `url` with no label.  You can use this function
 * to create a {@link LinkText} tree.  The label of the link will be the same
 * as the given `url`.
 * @param url The link target.  It has to be an absolute URL.
 * @returns A {@link LinkText} tree.
 */
export function link<TContextData>(
  url: URL | string,
): Text<"inline", TContextData>;

export function link<TContextData>(
  label: Text<"inline", TContextData> | string | URL,
  href?: URL | string,
): Text<"inline", TContextData> {
  return href == null
    ? new LinkText(String(label), label as string)
    : new LinkText(
      isText<TContextData>(label) ? label : label.toString(),
      href,
    );
}

/**
 * A text tree that renders a inline code.  You normally don't need to
 * instantiate this directly; use the {@link code} function instead.
 */
export class CodeText<TContextData> implements Text<"inline", TContextData> {
  readonly type = "inline";
  readonly #code: Text<"inline", TContextData>;

  /**
   * Creates a {@link CodeText} tree with a code.
   * @param code The code to render.
   */
  constructor(code: Text<"inline", TContextData> | string) {
    this.#code = typeof code === "string" ? new PlainText(code) : code;
  }

  async *getHtml(session: Session<TContextData>): AsyncIterable<string> {
    yield "<code>";
    yield* this.#code.getHtml(session);
    yield "</code>";
  }

  getTags(session: Session<TContextData>): AsyncIterable<Link> {
    return this.#code.getTags(session);
  }

  getCachedObjects(): Object[] {
    return [];
  }
}

/**
 * Applies `<code>` tag to a text.  You can use this function to create
 * a {@link CodeText} tree.
 * @param code The code to render.
 * @returns A {@link CodeText} tree.
 */
export function code<TContextData>(
  code: Text<"inline", TContextData> | string,
): Text<"inline", TContextData> {
  return new CodeText(code);
}

/**
 * The options for rendering a Markdown text.
 */
export interface MarkdownTextOptions {
  /**
   * Whether to render mentions in the Markdown text.
   * @default {true}
   */
  readonly mentions?: boolean;

  /**
   * Whether to automatically linkify URLs in the Markdown text.
   * @default {true}
   */
  readonly linkify?: boolean;
}

interface MarkdownEnv {
  mentions: string[];
  actors?: Record<string, string | null>;
}

/**
 * A text tree that renders a Markdown text.  You normally don't need to
 * instantiate this directly; use the {@link markdown} function instead.
 */
export class MarkdownText<TContextData> implements Text<"block", TContextData> {
  readonly type = "block";
  readonly #content: string;
  readonly #markdownIt: typeof MarkdownIt;
  readonly #mentions?: string[];
  #actors?: Record<string, Object>;

  /**
   * Creates a {@link MarkdownText} tree with a Markdown content.
   * @param content The Markdown content.
   * @param options The options for rendering the Markdown content.
   */
  constructor(content: string, options: MarkdownTextOptions = {}) {
    this.#content = content;
    const md = MarkdownIt({
      html: false,
      linkify: options.linkify ?? true,
    });
    if (options.mentions ?? true) {
      md.use(mentionPlugin, {
        link(handle: string, env: MarkdownEnv) {
          if (env.actors == null) return `acct:${handle}`;
          return env.actors[handle] ?? null;
        },
        linkAttributes(_handle: string, _env: MarkdownEnv) {
          return {
            translate: "no",
            class: "h-card u-url mention",
            target: "_blank",
          };
        },
        label: toFullHandle,
      });
      const env: MarkdownEnv = { mentions: [] };
      md.render(content, env);
      this.#mentions = env.mentions;
    }
    this.#markdownIt = md;
  }

  async #getMentionedActors(
    session: Session<TContextData>,
  ): Promise<Record<string, Object>> {
    if (this.#mentions == null) return {};
    if (this.#actors != null) return this.#actors;
    const documentLoader = await session.context.getDocumentLoader(session.bot);
    const objects = await Promise.all(
      this.#mentions.map((m) =>
        session.context.lookupObject(m, { documentLoader })
      ),
    );
    const actors: Record<string, Object> = {};
    for (let i = 0; i < this.#mentions.length; i++) {
      const object = objects[i];
      if (object != null) actors[this.#mentions[i]] = object;
    }
    this.#actors = actors;
    return actors;
  }

  async *getHtml(session: Session<TContextData>): AsyncIterable<string> {
    if (this.#mentions == null) {
      yield this.#markdownIt.render(this.#content);
      return;
    }
    const actors: Record<string, string | null> = globalThis.Object.fromEntries(
      globalThis.Object.entries(
        await this.#getMentionedActors(session),
      ).filter(([_, obj]) => isActor(obj)).map((
        [handle, actor],
      ) =>
        [
          handle,
          (actor.url instanceof Link
            ? actor.url.href?.href
            : actor.url?.href) ?? actor.id?.href ?? null,
        ] satisfies [string, string | null]
      ).filter(([_, url]) => url != null),
    );
    const env: MarkdownEnv = { mentions: [], actors };
    yield this.#markdownIt.render(this.#content, env);
  }

  async *getTags(session: Session<TContextData>): AsyncIterable<Link> {
    if (this.#mentions == null) return;
    const actors = await this.#getMentionedActors(session);
    for (const [handle, object] of globalThis.Object.entries(actors)) {
      if (!isActor(object) || object.id == null) continue;
      yield new Mention({
        name: handle,
        href: object.id,
      });
    }
  }

  getCachedObjects(): Object[] {
    return this.#actors == null ? [] : globalThis.Object.values(this.#actors);
  }
}

/**
 * Renders a Markdown text.  You can use this function to create
 * a {@link MarkdownText} tree.  The mentions in the Markdown text
 * will be rendered as links unless the `mentions` option is set to
 * `false`.
 * @param content The Markdown content.
 * @param options The options for rendering the Markdown content.
 * @returns A {@link MarkdownText} tree.
 */
export function markdown<TContextData>(
  content: string,
  options: MarkdownTextOptions = {},
): Text<"block", TContextData> {
  return new MarkdownText(content, options);
}
