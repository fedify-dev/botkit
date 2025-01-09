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
import type {
  Application,
  Context,
  Federation,
  KvKey,
  KvStore,
  MessageQueue,
  Service,
} from "@fedify/fedify";
import type { Software } from "@fedify/fedify/nodeinfo";
import { BotImpl } from "./bot-impl.ts";
import type { MentionEventHandler } from "./events.ts";
import type { Session } from "./session.ts";
import type { Text } from "./text.ts";
export {
  parseSemVer,
  type SemVer,
  type Software,
} from "@fedify/fedify/nodeinfo";
export { Application, Service } from "@fedify/fedify/vocab";

/**
 * A bot that can interact with the ActivityPub network.
 */
export interface Bot<TContextData> {
  /**
   * An internal Fedify federation instance.  Normally you don't need to access
   * this directly.
   */
  readonly federation: Federation<TContextData>;

  /**
   * The internal identifier for the bot actor.  It is used for the actor URI.
   */
  readonly identifier: string;

  /**
   * Gets a new session to control the bot for a specific origin and context
   * data.
   * @param origin The origin of the session.  Even if a URL with some path or
   *               query is passed, only the origin part will be used.
   * @param contextData The context data to pass to the federation.
   * @returns The session for the origin and context data.
   */
  getSession(
    origin: string | URL,
    contextData: TContextData,
  ): Session<TContextData>;

  /**
   * Gets a new session to control bot for a specific Fedify context.
   * @param context The Fedify context of the session.
   * @returns The session for the Fedify context.
   */
  getSession(context: Context<TContextData>): Session<TContextData>;

  /**
   * The fetch API for handling HTTP requests.  You can pass this to an HTTP
   * server (e.g., `Deno.serve()`, `Bun.serve()`) to handle incoming requests.
   * @param request The request to handle.
   * @param contextData The context data to pass to the federation.
   * @returns The response to the request.
   */
  fetch(request: Request, contextData: TContextData): Promise<Response>;

  /**
   * An event handler for a message mentioned to the bot.
   */
  onMention?: MentionEventHandler<TContextData>;
}

/**
 * A specialized {@link Bot} tpe that doesn't require context data.
 */
export interface BotWithVoidContextData extends Bot<void> {
  /**
   * Gets a new session to control the bot for a specific origin and context
   * data.
   * @param origin The origin of the session.  Even if a URL with some path or
   *               query is passed, only the origin part will be used.
   * @param contextData The context data to pass to the federation.
   * @returns The session for the origin and context data.
   */
  getSession(
    origin: string | URL,
    contextData: void,
  ): Session<void>;

  /**
   * Gets a new session to control bot for a specific Fedify context.
   * @param context The Fedify context of the session.
   * @returns The session for the Fedify context.
   */
  getSession(context: Context<void>): Session<void>;

  /**
   * Gets a new session to control the bot for a specific origin and context
   * data.
   * @param origin The origin of the session.  Even if a URL with some path or
   *               query is passed, only the origin part will be used.
   */
  getSession(origin: string | URL): Session<void>;

  /**
   * The fetch API for handling HTTP requests.  You can pass this to an HTTP
   * server (e.g., `Deno.serve()`, `Bun.serve()`) to handle incoming requests.
   * @param request The request to handle.
   * @returns The response to the request.
   */
  fetch(request: Request): Promise<Response>;
}

/**
 * Options for creating a bot.
 */
export interface CreateBotOptions<TContextData> {
  /**
   * The internal identifier of the bot.  Since it is used for the actor URI,
   * it *should not* be changed after the bot is federated.
   *
   * If omitted, `"bot"` will be used.
   * @default `"bot"`
   */
  readonly identifier?: string;

  /**
   * The type of the bot actor.  It should be either `Service` or `Application`.
   *
   * If omitted, `Service` will be used.
   * @default `Service`
   */
  readonly class?: typeof Service | typeof Application;

  /**
   * The username of the bot.  It will be a part of the fediverse handle.
   * It can be changed after the bot is federated.
   */
  readonly username: string;

  /**
   * The display name of the bot.  It can be changed after the bot is federated.
   */
  readonly name?: string;

  /**
   * The description of the bot.  It can be changed after the bot is federated.
   */
  readonly summary?: Text<TContextData>;

  /**
   * The avatar URL of the bot.  It can be changed after the bot is federated.
   */
  readonly icon?: URL;

  /**
   * The header image URL of the bot.  It can be changed after the bot is
   * federated.
   */
  readonly image?: URL;

  /**
   * The underlying key-value store to use for storing data.
   */
  readonly kv: KvStore;

  /**
   * The prefixes for key-value store keys used by the bot.
   *
   * @default `{ message: ["_botkit", "message"] }`
   */
  readonly kvPrefixes?: BotKvPrefixes;

  /**
   * The underlying message queue to use for handling incoming and outgoing
   * activities.  If omitted, incoming activities are processed immediately,
   * and outgoing activities are sent immediately.
   */
  readonly queue?: MessageQueue;

  /**
   * The software information of the bot.  If omitted, the NodeInfo protocol
   * will be unimplemented.
   */
  readonly software?: Software;

  /**
   * Whether to trust `X-Forwarded-*` headers.  If your bot application is
   * behind an L7 reverse proxy, turn it on.
   *
   * Turned off by default.
   * @default `false`
   */
  readonly behindProxy?: boolean;
}

/**
 * The prefixes for key-value store keys used by the bot.
 */
export interface BotKvPrefixes {
  /**
   * The key prefix used for storing the key pairs of the bot actor.
   */
  readonly keyPairs: KvKey;

  /**
   * The key prefix used for storing published messages.
   */
  readonly messages: KvKey;

  /**
   * The key prefix used for storing followers.
   */
  readonly followers: KvKey;

  /**
   * The key prefix used for storing follow requests.
   */
  readonly followRequests: KvKey;
}

/**
 * Creates a {@link Bot} instance.
 * @param options The options for creating the bot.
 * @returns The created bot instance.
 */
export function createBot<TContextData = void>(
  options: CreateBotOptions<TContextData>,
): TContextData extends void ? BotWithVoidContextData : Bot<TContextData> {
  const bot = new BotImpl<TContextData>(options);
  // Since `deno serve` does not recognize a class instance having fetch(),
  // we wrap a BotImpl instance with a plain object.
  // See also https://github.com/denoland/deno/issues/24062
  const wrapper = {
    get federation() {
      return bot.federation;
    },
    get identifier() {
      return bot.identifier;
    },
    getSession(a, b?) {
      // @ts-ignore: BotImpl.getSession() implements Bot.getSession()
      return bot.getSession(a, b);
    },
    fetch(request, contextData) {
      return bot.fetch(request, contextData);
    },
    get onMention() {
      return bot.onMention;
    },
    set onMention(value) {
      bot.onMention = value;
    },
  } satisfies Bot<TContextData>;
  // @ts-ignore: the wrapper implements BotWithVoidContextData
  return wrapper;
}
