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
/** @jsxImportSource hono/jsx */
import "../temporal.ts";
import { LanguageString } from "@fedify/vocab-runtime";
import { Document, Emoji, getActorHandle, Image, Link } from "@fedify/vocab";
import { htmlXss } from "../message-impl.ts";
import type { MessageClass } from "../message.ts";
import type { Session } from "../session.ts";

export interface MessageProps {
  readonly message: MessageClass;
  readonly session: Session<unknown>;
}

export async function Message({ session, message }: MessageProps) {
  const { context } = session;
  const author = message.attributionId?.href === session.actorId?.href
    ? await session.getActor()
    : await message.getAttribution({
      documentLoader: context.documentLoader,
      contextLoader: context.contextLoader,
      suppressError: true,
    });
  const authorIcon = await author?.getIcon({
    documentLoader: context.documentLoader,
    contextLoader: context.contextLoader,
    suppressError: true,
  });
  const authorHandle = author == null ? null : await getActorHandle(author);
  const attachments = await Array.fromAsync(message.getAttachments());
  const tags = await Array.fromAsync(message.getTags());
  const customEmojis: Record<string, string> = {};
  for (const tag of tags) {
    if (!(tag instanceof Emoji) || tag.name == null) continue;
    const icon = await tag.getIcon();
    if (icon?.url == null) continue;
    const url = icon.url instanceof Link ? icon.url.href?.href : icon.url.href;
    if (url == null) continue;
    customEmojis[tag.name.toString()] = url;
  }
  const permalink = message.url?.href?.toString() ?? message.id?.href;
  const authorLink = author?.url?.href?.toString() ?? author?.id?.href;
  const authorIconUrl = authorIcon?.url == null
    ? null
    : authorIcon.url instanceof Link
    ? authorIcon.url.href?.href
    : authorIcon.url.href;
  const images = attachments
    .filter((a) => a instanceof Image || a instanceof Document)
    .filter((a) => a.mediaType?.startsWith("image/") && a.url != null);
  // On a bot's own profile every post is by that bot, so the author is only
  // worth showing when it differs (e.g. a boosted post from someone else).
  const isSelf = author?.id?.href != null &&
    author.id.href === session.actorId?.href;
  return (
    <article class="bk-post">
      {!isSelf && (
        <div class="bk-repost">
          <BoostIcon />
          Reposted
        </div>
      )}
      {!isSelf && (
        <div class="bk-post__author">
          {author?.id
            ? (
              <>
                {authorIconUrl && (
                  <img
                    src={authorIconUrl}
                    alt={authorIcon?.name?.toString() ?? undefined}
                    loading="lazy"
                  />
                )}
                <div>
                  <div class="bk-post__author-name">
                    <a href={authorLink}>{author.name?.toString()}</a>
                  </div>
                  <div class="bk-post__author-handle">{authorHandle}</div>
                </div>
              </>
            )
            : <em class="bk-post__author-handle">Deleted account</em>}
        </div>
      )}
      <div
        class="bk-prose"
        dangerouslySetInnerHTML={{
          __html: renderCustomEmojis(
            htmlXss.process(message.content?.toString() ?? ""),
            customEmojis,
          ),
        }}
        lang={message.content instanceof LanguageString
          ? message.content.locale.toString()
          : undefined}
      />
      {images.length > 0 && (
        <div class="bk-attachments">
          {images.map((a, index) => {
            const name = a.name?.toString();
            return (
              <figure class="bk-attachment" key={a.id?.href ?? index}>
                <img
                  src={a.url instanceof Link ? a.url.href?.href : a.url!.href}
                  width={a.width ?? undefined}
                  height={a.height ?? undefined}
                  alt={name ?? undefined}
                  loading="lazy"
                />
                {name && <figcaption>{name}</figcaption>}
              </figure>
            );
          })}
        </div>
      )}
      {message.published && (
        <div class="bk-post__foot">
          <a class="bk-post__date" href={permalink}>
            <time dateTime={message.published.toString()}>
              {formatDate(message.published)}
            </time>
          </a>
        </div>
      )}
    </article>
  );
}

/** A repost/boost glyph: two arrows forming a loop. */
function BoostIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 5.5h6.5A1.5 1.5 0 0 1 12.5 7v1.5"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
      />
      <path
        d="M6 3.5 4 5.5l2 2"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M11.5 10.5H5A1.5 1.5 0 0 1 3.5 9V7.5"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
      />
      <path
        d="M10 12.5 12 10.5l-2-2"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Formats an instant as a friendly, readable date and time. */
function formatDate(published: Temporal.Instant): string {
  return published.toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const HTML_ELEMENT_REGEXP = /<\/?[^>]+>/g;
const CUSTOM_EMOJI_REGEXP = /:([a-z0-9_-]+):/gi;

export function renderCustomEmojis(
  html: string,
  emojis: Record<string, string>,
): string {
  let result = "";
  let index = 0;
  for (const match of html.matchAll(HTML_ELEMENT_REGEXP)) {
    result += replaceEmojis(html.substring(index, match.index));
    result += match[0];
    index = match.index + match[0].length;
  }
  result += replaceEmojis(html.substring(index));
  return result;

  function replaceEmojis(html: string): string {
    return html.replaceAll(CUSTOM_EMOJI_REGEXP, (match) => {
      const emoji = emojis[match] ?? emojis[match.replace(/^:|:$/g, "")];
      if (emoji == null) return match;
      return `<img src="${emoji}" alt="${match}" class="emoji">`;
    });
  }
}
