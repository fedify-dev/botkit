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
}

export function Layout(
  { bot, host, title, activityLink, children }: LayoutProps,
) {
  const handle = `@${bot.username}@${host}`;
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>
          {title == null
            ? bot.name == null ? handle : `${bot.name} (${handle})`
            : title}
        </title>
        {activityLink &&
          (
            <link
              rel="alternate"
              type="application/activity+json"
              href={activityLink.toString()}
            />
          )}
        <link rel="stylesheet" href={`/css/pico.${bot.pages.color}.min.css`} />
        <style>{bot.pages.css}</style>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
