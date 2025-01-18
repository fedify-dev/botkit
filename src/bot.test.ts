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
import { MemoryKvStore } from "@fedify/fedify/federation";
import type { Actor } from "@fedify/fedify/vocab";
import { assertEquals } from "@std/assert/equals";
import { createBot } from "./bot.ts";
import type { Message, MessageClass } from "./message.ts";
import type { Session } from "./session.ts";

Deno.test("createBot()", async () => {
  const kv = new MemoryKvStore();
  const bot = createBot({ kv, identifier: "bot-id", username: "bot" });
  const _federation = bot.federation;
  assertEquals(bot.identifier, "bot-id");
  const session = bot.getSession("https://example.com");
  assertEquals(session.actorHandle, "@bot@example.com");

  function onFollow(_session: Session<void>, _follower: Actor) {}
  bot.onFollow = onFollow;
  assertEquals(bot.onFollow, onFollow);

  function onUnfollow(_session: Session<void>, _follower: Actor) {}
  bot.onUnfollow = onUnfollow;
  assertEquals(bot.onUnfollow, onUnfollow);

  function onMention(
    _session: Session<void>,
    _message: Message<MessageClass, void>,
  ) {}
  bot.onMention = onMention;
  assertEquals(bot.onMention, onMention);

  function onReply(
    _session: Session<void>,
    _message: Message<MessageClass, void>,
  ) {}
  bot.onReply = onReply;
  assertEquals(bot.onReply, onReply);

  const response = await bot.fetch(
    new Request(
      "https://example.com/.well-known/webfinger?resource=acct:bot@example.com",
    ),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    aliases: [
      "https://example.com/ap/actor/bot-id",
    ],
    links: [
      {
        href: "https://example.com/ap/actor/bot-id",
        rel: "self",
        type: "application/activity+json",
      },
    ],
    subject: "acct:bot@example.com",
  });
});
