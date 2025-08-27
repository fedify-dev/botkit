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
/** @jsxImportSource hono/jsx */
import { type Actor, getActorHandle, Link } from "@fedify/fedify/vocab";
import type { Session } from "../session.ts";

export interface FollowerProps {
  readonly actor: Actor;
  readonly session: Session<unknown>;
}

export async function Follower({ actor, session }: FollowerProps) {
  const { context } = session;
  const author = actor;
  const authorIcon = await actor?.getIcon({
    documentLoader: context.documentLoader,
    contextLoader: context.contextLoader,
    suppressError: true,
  });
  const authorHandle = await getActorHandle(author);

  return (
    <article>
      <header>
        {author?.id
          ? (
            <hgroup>
              {authorIcon?.url && (
                <img
                  src={authorIcon.url instanceof Link
                    ? authorIcon.url.href?.href
                    : authorIcon.url.href}
                  width={authorIcon.width ?? undefined}
                  height={authorIcon.height ?? undefined}
                  alt={authorIcon.name?.toString() ?? undefined}
                  style="float: left; margin-right: 1em; height: 64px;"
                />
              )}
              <h3>
                <a href={author.url?.href?.toString() ?? author.id.href}>
                  {author.name}
                </a>
              </h3>{" "}
              <p>
                <span style="user-select: all;">{authorHandle}</span>
              </p>
            </hgroup>
          )
          : <em>(Deleted account)</em>}
      </header>
    </article>
  );
}
