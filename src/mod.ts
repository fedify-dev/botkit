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
export {
  InProcessMessageQueue,
  type InProcessMessageQueueOptions,
  MemoryKvStore,
  ParallelMessageQueue,
} from "@fedify/fedify/federation";
export {
  Application,
  type Bot,
  type BotWithVoidContextData,
  createBot,
  type CreateBotOptions,
  Image,
  type PagesOptions,
  parseSemVer,
  type SemVer,
  Service,
  type Software,
} from "./bot.ts";
export type * from "./events.ts";
export type { FollowRequest } from "./follow.ts";
export {
  Article,
  Audio,
  ChatMessage,
  Document,
  Hashtag,
  isActor,
  LanguageTag,
  Note,
  parseLanguageTag,
  Question,
  Video,
} from "./message.ts";
export type {
  Actor,
  AuthorizedMessage,
  AuthorizedSharedMessage,
  Message,
  MessageClass,
  MessageShareOptions,
  MessageVisibility,
  SharedMessage,
} from "./message.ts";
export { type AuthorizedLike, type Like, RawLike } from "./reaction.ts";
export {
  Announce,
  Create,
  KvRepository,
  MemoryRepository,
  type Repository,
} from "./repository.ts";
export type {
  Session,
  SessionPublishOptions,
  SessionPublishOptionsWithClass,
} from "./session.ts";
export {
  em,
  hashtag,
  link,
  mention,
  plainText,
  strong,
  type Text,
  text,
} from "./text.ts";
