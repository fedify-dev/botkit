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
export {
  InProcessMessageQueue,
  type InProcessMessageQueueOptions,
  MemoryKvStore,
  ParallelMessageQueue,
} from "@fedify/fedify/federation";
export {
  Application,
  type Bot,
  type BotEventHandlers,
  type BotWithVoidContextData,
  createBot,
  type CreateBotOptions,
  Image,
  type PagesOptions,
  type ReadonlyBot,
  Service,
  type Software,
} from "./bot.ts";
export {
  type BotDispatcher,
  type BotGroup,
  type BotProfile,
  type CreateBotGroupOptions,
  createInstance,
  type CreateInstanceOptions,
  DEFAULT_INSTANCE_ACTOR_IDENTIFIER,
  type Instance,
  type InstanceWithVoidContextData,
} from "./instance.ts";
export {
  type CustomEmoji,
  type DeferredCustomEmoji,
  type Emoji,
  emoji,
  isEmoji,
} from "./emoji.ts";
export type * from "./events.ts";
export type {
  CircuitBreakerOptions,
  FederationInfrastructureOptions,
  HttpMessageSignaturesSpec,
  InboxChallengePolicy,
} from "./federation.ts";
export type { FollowRequest } from "./follow.ts";
export {
  Article,
  Audio,
  ChatMessage,
  Document,
  Hashtag,
  isActor,
  Note,
  Question,
  Video,
} from "./message.ts";
export type {
  Actor,
  AuthorizedMessage,
  AuthorizedMessageUpdateOptions,
  AuthorizedSharedMessage,
  Message,
  MessageClass,
  MessageShareOptions,
  MessageVisibility,
  SharedMessage,
} from "./message.ts";
export type { Poll, Vote } from "./poll.ts";
export type {
  QuoteAcceptance,
  QuotePolicy,
  QuotePolicyOption,
  QuoteRequest,
} from "./quote.ts";
export { normalizeQuotePolicy } from "./quote.ts";
export {
  type AuthorizedLike,
  type AuthorizedReaction,
  EmojiReact,
  type Like,
  RawLike,
  type Reaction,
} from "./reaction.ts";
export {
  ActorScopedRepository,
  Announce,
  Create,
  KvRepository,
  type KvRepositoryOptions,
  MemoryCachedRepository,
  MemoryRepository,
  type Repository,
} from "./repository.ts";
export type {
  Session,
  SessionGetOutboxOptions,
  SessionPublishOptions,
  SessionPublishOptionsWithClass,
} from "./session.ts";
export {
  customEmoji,
  em,
  hashtag,
  inline,
  link,
  mention,
  plainText,
  strong,
  type Text,
  text,
} from "./text.ts";
