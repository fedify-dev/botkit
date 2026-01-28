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
  Context,
  Federation,
  KvStore,
  MessageQueue,
} from "@fedify/fedify/federation";
import type { Software } from "@fedify/fedify/nodeinfo";
import type { Bot, BotProfile, PagesOptions } from "./bot.ts";
import { InstanceImpl } from "./instance-impl.ts";
import type { Repository } from "./repository.ts";

/**
 * A function that dispatches a bot profile for a given identifier.
 * Used for creating dynamic bots that are resolved on-demand.
 *
 * @param ctx The Fedify context.
 * @param identifier The identifier to resolve.
 * @returns The bot profile if the identifier matches, or `null` otherwise.
 * @since 0.4.0
 */
export type BotDispatcher<TContextData> = (
  ctx: Context<TContextData>,
  identifier: string,
) => BotProfile<TContextData> | null | Promise<BotProfile<TContextData> | null>;

/**
 * A server instance that can host multiple bots.  An instance manages
 * shared infrastructure (KV store, message queue, HTTP handling) while
 * allowing multiple bots to be registered and managed independently.
 *
 * @since 0.4.0
 */
export interface Instance<TContextData> {
  /**
   * An internal Fedify federation instance.  Normally you don't need to access
   * this directly.
   */
  readonly federation: Federation<TContextData>;

  /**
   * Creates a static bot with a fixed identifier and profile.
   *
   * @example
   * ```typescript
   * const greetBot = instance.createBot("greet", {
   *   username: "greetbot",
   *   name: "Greeting Bot",
   * });
   *
   * greetBot.onFollow = async (session, { follower, followRequest }) => {
   *   await followRequest.accept();
   *   await session.publish(text`Welcome, ${follower}!`);
   * };
   * ```
   *
   * @param identifier The internal identifier for the bot (used in actor URI).
   * @param profile The profile configuration for the bot.
   * @returns The created bot.
   */
  createBot(
    identifier: string,
    profile: BotProfile<TContextData>,
  ): Bot<TContextData>;

  /**
   * Creates dynamic bots using a dispatcher function.  The dispatcher is
   * called when an identifier needs to be resolved, allowing for on-demand
   * bot creation from a database or other data source.
   *
   * @example
   * ```typescript
   * const weatherBots = instance.createBot(async (ctx, identifier) => {
   *   // Return null for identifiers this dispatcher doesn't handle
   *   if (!identifier.startsWith("weather_")) return null;
   *
   *   // Look up the region from the database
   *   const regionCode = identifier.slice("weather_".length);
   *   const region = await db.getRegion(regionCode);
   *   if (region == null) return null;
   *
   *   // Return the bot profile
   *   return {
   *     username: identifier,
   *     name: `${region.name} Weather Bot`,
   *   };
   * });
   *
   * weatherBots.onMention = async (session, { message }) => {
   *   const regionCode = session.botInfo.identifier.slice("weather_".length);
   *   const weather = await fetchWeather(regionCode);
   *   await session.publish(text`Current weather: ${weather}`);
   * };
   * ```
   *
   * @param dispatcher A function that returns a bot profile for a given
   *                   identifier, or `null` if the identifier doesn't match.
   * @returns A bot handle for registering event handlers.  The handlers
   *          will be invoked for any bot resolved by this dispatcher.
   */
  createBot(dispatcher: BotDispatcher<TContextData>): Bot<TContextData>;

  /**
   * The fetch API for handling HTTP requests.  You can pass this to an HTTP
   * server (e.g., `Deno.serve()`, `Bun.serve()`) to handle incoming requests.
   *
   * @param request The request to handle.
   * @param contextData The context data to pass to the federation.
   * @returns The response to the request.
   */
  fetch(request: Request, contextData: TContextData): Promise<Response>;
}

/**
 * A specialized {@link Instance} type that doesn't require context data.
 * @since 0.4.0
 */
export interface InstanceWithVoidContextData extends Instance<void> {
  /**
   * The fetch API for handling HTTP requests.  You can pass this to an HTTP
   * server (e.g., `Deno.serve()`, `Bun.serve()`) to handle incoming requests.
   *
   * @param request The request to handle.
   * @returns The response to the request.
   */
  fetch(request: Request): Promise<Response>;
}

/**
 * Options for creating an instance.
 * @since 0.4.0
 */
export interface CreateInstanceOptions<TContextData> {
  /**
   * The underlying key-value store to use for storing data.
   */
  readonly kv: KvStore;

  /**
   * The underlying repository to use for storing data.  If omitted,
   * {@link KvRepository} will be used with bot-scoped prefixes.
   */
  readonly repository?: Repository;

  /**
   * The underlying message queue to use for handling incoming and outgoing
   * activities.  If omitted, incoming activities are processed immediately,
   * and outgoing activities are sent immediately.
   */
  readonly queue?: MessageQueue;

  /**
   * The software information of the instance.  If omitted, the NodeInfo
   * protocol will be unimplemented.
   */
  readonly software?: Software;

  /**
   * Whether to trust `X-Forwarded-*` headers.  If your instance is
   * behind an L7 reverse proxy, turn it on.
   *
   * Turned off by default.
   * @default `false`
   */
  readonly behindProxy?: boolean;

  /**
   * The options for the web pages of the bots.  If omitted, the default
   * options will be used.
   */
  readonly pages?: PagesOptions;
}

/**
 * Creates an {@link Instance} that can host multiple bots.
 *
 * @example
 * ```typescript
 * import { createInstance, text } from "@fedify/botkit";
 *
 * const instance = createInstance<void>({ kv: new DenoKvStore(kv) });
 *
 * const greetBot = instance.createBot("greet", {
 *   username: "greetbot",
 *   name: "Greeting Bot",
 * });
 *
 * greetBot.onFollow = async (session, { follower, followRequest }) => {
 *   await followRequest.accept();
 *   await session.publish(text`Welcome, ${follower}!`);
 * };
 *
 * export default instance;
 * ```
 *
 * @param options The options for creating the instance.
 * @returns The created instance.
 * @since 0.4.0
 */
export function createInstance<TContextData = void>(
  options: CreateInstanceOptions<TContextData>,
): TContextData extends void ? InstanceWithVoidContextData
  : Instance<TContextData> {
  const instance = new InstanceImpl<TContextData>(options);
  // Since `deno serve` does not recognize a class instance having fetch(),
  // we wrap an InstanceImpl instance with a plain object.
  // See also https://github.com/denoland/deno/issues/24062
  const wrapper = {
    get federation() {
      return instance.federation;
    },
    createBot(
      identifierOrDispatcher: string | BotDispatcher<TContextData>,
      profile?: BotProfile<TContextData>,
    ): Bot<TContextData> {
      return instance.createBot(identifierOrDispatcher, profile);
    },
    fetch(request: Request, contextData: TContextData): Promise<Response> {
      return instance.fetch(request, contextData);
    },
  } satisfies Instance<TContextData>;
  // @ts-ignore: the wrapper implements InstanceWithVoidContextData
  return wrapper;
}
