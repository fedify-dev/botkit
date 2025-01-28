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
/** @jsx react-jsx */
/** @jsxImportSource @hono/hono/jsx */
import type { JSX } from "@hono/hono/jsx/jsx-runtime";
import type { BotImpl } from "../bot-impl.ts";

export interface LayoutProps extends JSX.ElementChildrenAttribute {
  readonly bot: BotImpl<unknown>;
  readonly host: string;
  readonly title?: string;
  readonly activityLink?: string | URL;
  readonly feedLink?: string | URL;
}

export function Layout(
  { bot, host, title, activityLink, feedLink, children }: LayoutProps,
) {
  const handle = `@${bot.username}@${host}`;
  const cssFilename = bot.pages.color === "azure"
    ? `pico.min.css`
    : `pico.${bot.pages.color}.min.css`;
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>
          {title != null && `${title} — `}
          {bot.name == null ? handle : `${bot.name} (${handle})`}
        </title>
        {activityLink &&
          (
            <link
              rel="alternate"
              type="application/activity+json"
              href={activityLink.toString()}
              title="ActivityPub"
            />
          )}
        {feedLink && (
          <link
            rel="alternate"
            type="application/atom+xml"
            href={feedLink.toString()}
            title="Atom feed"
          />
        )}
        <link
          rel="stylesheet"
          href={`https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/${cssFilename}`}
        />
        <style>{bot.pages.css}</style>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
