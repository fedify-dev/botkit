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
import type { Actor } from "@fedify/fedify/vocab";
import type { FollowRequest } from "./follow.ts";
import type { Message, MessageClass, SharedMessage } from "./message.ts";
import type { Vote } from "./poll.ts";
import type { Like, Reaction } from "./reaction.ts";
import type { Session } from "./session.ts";

/**
 * An event handler for a follow request to the bot.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param followRequest The follow request.
 */
export type FollowEventHandler<TContextData> = (
  session: Session<TContextData>,
  followRequest: FollowRequest,
) => void | Promise<void>;

/**
 * An event handler for an unfollow event from the bot.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param follower The actor who unfollowed the bot.
 */
export type UnfollowEventHandler<TContextData> = (
  session: Session<TContextData>,
  follower: Actor,
) => void | Promise<void>;

/**
 * An event handler invoked when a follow request the bot sent is accepted.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param accepter The actor who accepted the follow request.
 */
export type AcceptEventHandler<TContextData> = (
  session: Session<TContextData>,
  accepter: Actor,
) => void | Promise<void>;

/**
 * An event handler invoked when a follow request the bot sent is rejected.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param rejecter The actor who rejected the follow request.
 */
export type RejectEventHandler<TContextData> = (
  session: Session<TContextData>,
  rejecter: Actor,
) => void | Promise<void>;

/**
 * An event handler for a message mentioned to the bot.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param message The mentioned message.
 */
export type MentionEventHandler<TContextData> = (
  session: Session<TContextData>,
  message: Message<MessageClass, TContextData>,
) => void | Promise<void>;

/**
 * An event handler for a reply to the bot.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param reply The reply message.
 */
export type ReplyEventHandler<TContextData> = (
  session: Session<TContextData>,
  reply: Message<MessageClass, TContextData>,
) => void | Promise<void>;

/**
 * An event handler for a quote of the bot's message.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param quote The message which quotes the bot's message.
 * @since 0.2.0
 */
export type QuoteEventHandler<TContextData> = (
  session: Session<TContextData>,
  quote: Message<MessageClass, TContextData>,
) => void | Promise<void>;

/**
 * An event handler for a message shown to the bot's timeline.  To listen to
 * this event, your bot needs to follow others first.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param message The message shown to the bot's timeline.
 */
export type MessageEventHandler<TContextData> = (
  session: Session<TContextData>,
  message: Message<MessageClass, TContextData>,
) => void | Promise<void>;

/**
 * An event handler for a message shared by the bot.  To listen to this event,
 * your bot needs to follow others first.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param message The shared message to the bot's timeline.
 */
export type SharedMessageEventHandler<TContextData> = (
  session: Session<TContextData>,
  message: SharedMessage<MessageClass, TContextData>,
) => void | Promise<void>;

/**
 * An event handler for a like of a message.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param like The like activity of the message.
 */
export type LikeEventHandler<TContextData> = (
  session: Session<TContextData>,
  like: Like<TContextData>,
) => void | Promise<void>;

/**
 * An event handler for undoing a like of a message.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param like The like activity which is undone.
 */
export type UnlikeEventHandler<TContextData> = (
  session: Session<TContextData>,
  like: Like<TContextData>,
) => void | Promise<void>;

/**
 * An event handler for an emoji reaction to a message.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param reaction The emoji reaction to the message.
 * @since 0.2.0
 */
export type ReactionEventHandler<TContextData> = (
  session: Session<TContextData>,
  reaction: Reaction<TContextData>,
) => void | Promise<void>;

/**
 * An event handler for undoing an emoji reaction to a message.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param reaction The emoji reaction to the message which is undone.
 * @since 0.2.0
 */
export type UndoneReactionEventHandler<TContextData> = (
  session: Session<TContextData>,
  reaction: Reaction<TContextData>,
) => void | Promise<void>;

/**
 * An event handler for a vote in a poll.  This event is only triggered when
 * the bot is the author of the poll, and the vote is made by another actor.
 * Note that if the poll allows multiple selections, this event is triggered
 * multiple times, once for each option selected by the actor.
 * @typeParam TContextData The type of the context data.
 * @param session The session of the bot.
 * @param vote The vote made by another actor in the poll.
 * @since 0.3.0
 */
export type VoteEventHandler<TContextData> = (
  session: Session<TContextData>,
  vote: Vote<TContextData>,
) => void | Promise<void>;
