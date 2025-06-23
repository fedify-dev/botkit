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
import assert from "node:assert";
import { test } from "node:test";
import type { BotImpl } from "./bot-impl.ts";
import { createBot } from "./bot.ts";
import type { FollowRequest } from "./follow.ts";
import type { Message, MessageClass, SharedMessage } from "./message.ts";
import type { Like } from "./reaction.ts";
import type { Session } from "./session.ts";

test("createBot()", async () => {
  const kv = new MemoryKvStore();
  const bot = createBot<void>({ kv, identifier: "bot-id", username: "bot" });
  const { impl } = bot as unknown as { impl: BotImpl<void> };
  const _federation = bot.federation;
  assert.strictEqual(bot.identifier, "bot-id");
  const session = bot.getSession("https://example.com");
  assert.strictEqual(session.actorHandle, "@bot@example.com");

  function onFollow(_session: Session<void>, _followRequest: FollowRequest) {}
  bot.onFollow = onFollow;
  assert.strictEqual(bot.onFollow, onFollow);
  assert.strictEqual(impl.onFollow, onFollow);

  function onUnfollow(_session: Session<void>, _follower: Actor) {}
  bot.onUnfollow = onUnfollow;
  assert.strictEqual(bot.onUnfollow, onUnfollow);
  assert.strictEqual(impl.onUnfollow, onUnfollow);

  function onAcceptFollow(_session: Session<void>, _accepter: Actor) {}
  bot.onAcceptFollow = onAcceptFollow;
  assert.strictEqual(bot.onAcceptFollow, onAcceptFollow);
  assert.strictEqual(impl.onAcceptFollow, onAcceptFollow);

  function onRejectFollow(_session: Session<void>, _rejecter: Actor) {}
  bot.onRejectFollow = onRejectFollow;
  assert.strictEqual(bot.onRejectFollow, onRejectFollow);
  assert.strictEqual(impl.onRejectFollow, onRejectFollow);

  function onMention(
    _session: Session<void>,
    _message: Message<MessageClass, void>,
  ) {}
  bot.onMention = onMention;
  assert.strictEqual(bot.onMention, onMention);
  assert.strictEqual(impl.onMention, onMention);

  function onReply(
    _session: Session<void>,
    _message: Message<MessageClass, void>,
  ) {}
  bot.onReply = onReply;
  assert.strictEqual(bot.onReply, onReply);
  assert.strictEqual(impl.onReply, onReply);

  function onMessage(
    _session: Session<void>,
    _message: Message<MessageClass, void>,
  ) {}
  bot.onMessage = onMessage;
  assert.strictEqual(bot.onMessage, onMessage);
  assert.strictEqual(impl.onMessage, onMessage);

  function onSharedMessage(
    _session: Session<void>,
    _message: SharedMessage<MessageClass, void>,
  ) {}
  bot.onSharedMessage = onSharedMessage;
  assert.strictEqual(bot.onSharedMessage, onSharedMessage);
  assert.strictEqual(impl.onSharedMessage, onSharedMessage);

  function onLike(_session: Session<void>, _like: Like<void>) {}
  bot.onLike = onLike;
  assert.strictEqual(bot.onLike, onLike);
  assert.strictEqual(impl.onLike, onLike);

  function onUnlike(_session: Session<void>, _like: Like<void>) {}
  bot.onUnlike = onUnlike;
  assert.strictEqual(bot.onUnlike, onUnlike);
  assert.strictEqual(impl.onUnlike, onUnlike);

  const response = await bot.fetch(
    new Request(
      "https://example.com/.well-known/webfinger?resource=acct:bot@example.com",
    ),
  );
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), {
    aliases: [
      "https://example.com/ap/actor/bot-id",
    ],
    links: [
      {
        href: "https://example.com/ap/actor/bot-id",
        rel: "self",
        type: "application/activity+json",
      },
      {
        href: "https://example.com/",
        rel: "http://webfinger.net/rel/profile-page",
      },
    ],
    subject: "acct:bot@example.com",
  });
});
