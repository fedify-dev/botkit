---
description: >-
  BotKit provides a way to handle events that are emitted from the fediverse.
  Learn how to handle events and what kinds of events are available.
---

Events
======

BotKit provides a way to handle events that are emitted from the fediverse.
You can handle events by setting event handlers on the bot instance.  Event
handlers are properties of the `Bot` instance with the `on` prefix followed by
the event name.  For example, to handle a mention event, you can set the
`~Bot.onMention` property of the bot instance:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onMention = async (session, message) => {
  await message.reply(text`Hi, ${message.actor}!`);
};
~~~~

Every event handler receives a [session](./session.md) object as the first
argument, and the event-specific object as the second argument.

The following is a list of events that BotKit supports:


Follow
------

The `~Bot.onFollow` event handler is called when someone follows your bot.
It receives an `FollowRequest` object, which allows you to
`~FollowRequest.accept()` or `~FollowRequest.reject()` the follow request,
as the second argument.

The following is an example of a follow event handler that accepts all follow
requests and sends a direct message to new followers:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onFollow = async (session, followRequest) => {
  await followRequest.accept();
  await session.publish(
    text`Thanks for following me, ${followRequest.follower}!`,
    { visibility: "direct" },
  );
};
~~~~

> [!TIP]
> The manual invocation of `~FollowRequest.accept()` or
> `~FollowRequest.reject()` is preceded by
> the [`followerPolicy`](./bot.md#createbotoptions-followerpolicy) option.
> Even if your bot has configured the `followerPolicy` option to
> `"accept"` or `"reject"`, you can still manually `~FollowRequest.accept()`
> or `~FollowRequest.reject()` in the `~Bot.onFollow` event handler,
> and the configured policy is ignored for the specific follow request.

> [!TIP]
> The passed `FollowRequest` object can outlive the event handler if your bot
> is configured the [`followerPolicy`](./bot.md#createbotoptions-followerpolicy)
> option to `"manual"`.  The following example shows how to accept a follow
> request after an hour:
>
> ~~~~ typescript {2-4} twoslash
> import { type Bot, text } from "@fedify/botkit";
> const bot = {} as unknown as Bot<void>;
> // ---cut-before---
> bot.onFollow = async (session, followRequest) => {
>   setTimeout(async () => {
>     await followRequest.accept();
>   }, 1000 * 60 * 60);
> };
> ~~~~


Unfollow
--------

The `~Bot.onUnfollow` event handler is called when some follower unfollows
your bot.  It receives an `Actor` object, who just unfollowed your bot,
as the second argument.

The following is an example of an unfollow event handler that sends a direct
message when someone unfollows your bot:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onUnfollow = async (session, follower) => {
  await session.publish(text`Goodbye, ${follower}!`, {
    visibility: "direct",
  });
};
~~~~


Accept follow
-------------

The `~Bot.onAcceptFollow` event handler is called when someone accepts your
bot's follow request.  It receives an `Actor` object, who just accepted your
bot's follow request, as the second argument.

The following is an example of an accept event handler that sends a direct
message when someone accepts your bot's follow request:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onAcceptFollow = async (session, accepter) => {
  await session.publish(
    text`Thanks for accepting my follow request, ${accepter}!`,
    { visibility: "direct" },
  );
};
~~~~


Reject follow
-------------

The `~Bot.onRejectFollow` event handler is called when someone rejects your
bot's follow request.  It receives an `Actor` object, who just rejected your
bot's follow request, as the second argument.

The following is an example of a reject event handler that sends a direct
message when someone rejects your bot's follow request:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onRejectFollow = async (session, rejecter) => {
  await session.publish(
    text`I'm sorry to hear that you rejected my follow request, ${rejecter}.`,
    { visibility: "direct" },
  );
};
~~~~


Mention
-------

The `~Bot.onMention` event handler is called when someone mentions your bot.
It receives a `Message` object, which represents the message that mentions
your bot, as the second argument.

The following is an example of a mention event handler that replies to
a message that mentions your bot:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onMention = async (session, message) => {
  await message.reply(text`You called me, ${message.actor}?`);
};
~~~~


Reply
-----

The `~Bot.onReply` event handler is called when someone replies to your bot's
message.  It receives a `Message` object, which represents the reply message,
as the second argument.

The following is an example of a reply event handler that sends a second reply
message when someone replies to your bot's message:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onReply = async (session, reply) => {
  await reply.reply(text`Thanks for your reply, ${reply.actor}!`);
};
~~~~

If you want to get the parent message of a reply message, you can use the
`~Message.replyTarget` property.  See also the [*Traversing the conversation*
section](./message.md#traversing-the-conversation) in the *Message* concept
document.

> [!CAUTION]
> In many ActivityPub implementations including Mastodon, reply messages
> often contain the mention of the original author.  In such cases, both
> `~Bot.onMention` and `~Bot.onReply` event handlers are called.  You should
> be careful not to perform unexpected actions.
>
> The below example shows how to avoid the `~Bot.onMention` event handler from
> being called when a reply message is received:
>
> ~~~~ typescript twoslash
> import { type Bot, text } from "@fedify/botkit";
> const bot = {} as unknown as Bot<void>;
> // ---cut-before---
> bot.onReply = async (session, reply) => {
>   await reply.reply(text`Thanks for your reply, ${reply.actor}!`);
> };
>
> bot.onMention = async (session, message) => {
>   if (message.replyTarget == null) {  // [!code highlight]
>     await message.reply(text`You called me, ${message.actor}?`);
>   }
> };
> ~~~~
>
> Or the other way around, you can avoid the `~Bot.onReply` event handler from
> being called when a reply message mentioning the bot is received:
>
> ~~~~ typescript {6} twoslash
> import { type Bot, text } from "@fedify/botkit";
> const bot = {} as unknown as Bot<void>;
> // ---cut-before---
> bot.onMention = async (session, message) => {
>   await message.reply(text`You called me, ${message.actor}?`);
> };
>
> bot.onReply = async (session, reply) => {
>   if (!reply.mentions.some(m => m.id?.href === session.actorId.href)) {
>     await reply.reply(text`Thanks for your reply, ${reply.actor}!`);
>   }
> };


Quote
-----

*This API is available since BotKit 0.2.0.*

The `~Bot.onQuote` event handler is called when someone quotes one of your bot's
messages. It receives a `Message` object, which represents the message that
quotes your bot's message, as the second argument.

The following is an example of a quote event handler that responds to a message
that quotes one of your bot's posts:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onQuote = async (session, quote) => {
  await quote.reply(text`I see you quoted my post, ${quote.actor}!`);
};
~~~~

If you want to get the quoted message, you can use the `~Message.quoteTarget`
property.  See also the [*Quotes* section](./message.md#quotes) in the *Message*
concept document.


Message
-------

The `~Bot.onMessage` event handler is called when any message is received by
your bot, which includes normal messages on the bot's timeline, mentions,
replies, direct messages, and so on.  It receives a `Message` object, which
represents the received message, as the second argument.

The following is an example of a message event handler that replies to a
message that contains the word *BotKit*:

~~~~ typescript twoslash
import { type Bot, em, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onMessage = async (session, message) => {
  if (message.text.match(/\bbotkit\b/i)) {
    await message.reply(text`You mentioned ${em("BotKit")}!`);
  }
};
~~~~

> [!NOTE]
> If your bot does not follow anyone, the `~Bot.onMessage` event handler is
> called only when your bot receives mentions, replies, and direct messages.
>
> To learn more about following others, see the [*Following an actor*
> section](./session.md#following-an-actor) in the *Session* concept document.

> [!CAUTION]
> The `~Bot.onMessage` event handler is called for every message that your
> bot receives, which includes mentions, replies, and quotes.  If your bot
> listens to the `~Bot.onMention` or `~Bot.onReply` or `~Bot.onQuote` events
> with the `~Bot.onMessage` event handler, the `~Bot.onMention` or
> `~Bot.onReply` or `~Bot.onQuote` event handlers are called first.
> You should be careful not to perform unexpected actions.
>
> The below example shows how to avoid the `~Bot.onMessage` event handler from
> being called when a mention message is received:
>
> ~~~~ typescript {6-8} twoslash
> import { type Bot, em, text } from "@fedify/botkit";
> const bot = {} as unknown as Bot<void>;
> // ---cut-before---
> bot.onMention = async (session, message) => {
>   await message.reply(text`You called me, ${message.actor}?`);
> };
>
> bot.onMessage = async (session, message) => {
>   if (message.mentions.some(m => m.id?.href === session.actorId.href)) {
>     return;
>   }
>   if (message.text.match(/\bbotkit\b/i)) {
>     await message.reply(text`You mentioned ${em("BotKit")}!`);
>   }
> };
> ~~~~


Shared message
--------------

The `~Bot.onSharedMessage` event handler is called when someone shares (i.e.,
boosts) a message on your bot.  It receives a `SharedMessage` object,
which represents the shared message, as the second argument.

The following is an example of a shared message event handler that re-shares
the shared message:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onSharedMessage = async (session, sharedMessage) => {
  await sharedMessage.original.share();
};
~~~~

> [!TIP]
> The `~Bot.onSharedMessage` event handler can be called when someone your
> bot does not follow shares a message on your bot.


Like
----

The `~Bot.onLike` event handler is called when someone likes messages on your
bot or actors your bot follows.  It receives a `Like` object, which represents
the like activity, as the second argument.

The following is an example of a like event handler that sends a direct message
when someone likes a message on your bot:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onLike = async (session, like) => {
  if (like.message.actor.id?.href !== session.actorId.href) return;
  await session.publish(
    text`Thanks for liking my message, ${like.actor}!`,
    { visibility: "direct" },
  );
};
~~~~


Unlike
------

The `~Bot.onUnlike` event handler is called when someone undoes a `Like`
activity on messages on your bot or actors your bot follows.  It receives
a `Like` object, which represents the `Like` activity which was undone,
as the second argument.

The following is an example of an unlike event handler that sends a direct
message when someone undoes a like activity on a message on your bot:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onUnlike = async (session, like) => {
  if (like.message.actor.id?.href !== session.actorId.href) return;
  await session.publish(
    text`I'm sorry to hear that you unliked my message, ${like.actor}.`,
    { visibility: "direct" },
  );
};
~~~~


Emoji reaction
--------------

*This API is available since BotKit 0.2.0.*

The `~Bot.onReact` event handler is called when someone reacts with an emoji to
messages on your bot or actors your bot follows.  It receives a `Reaction`
object, which represents the reaction activity, as the second argument.

The following is an example of a reaction event handler that sends a direct
message when someone reacts with an emoji to a message on your bot:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onReact = async (session, reaction) => {
  if (reaction.message.actor.id?.href !== session.actorId.href) return;
  await session.publish(
    text`Thanks for reacting with ${reaction.emoji} to my message, ${reaction.actor}!`,
    { visibility: "direct" },
  );
};
~~~~


Undoing emoji reaction
----------------------

*This API is available since BotKit 0.2.0.*

The `~Bot.onUnreact` event handler is called when someone removes an emoji
reaction from messages on your bot or actors your bot follows.  It receives
a `Reaction` object, which represents the emoji reaction activity which was
undone, as the second argument.

The following is an example of an unreact event handler that sends a direct
message when someone removes a heart reaction from a message on your bot:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onUnreact = async (session, reaction) => {
  if (reaction.message.actor.id?.href !== session.actorId.href) return;
  if (reaction.emoji === "❤️") {
    await session.publish(
      text`I see you took back your heart reaction, ${reaction.actor}.`,
      { visibility: "direct" },
    );
  }
};
~~~~


Vote
----

*This API is available since BotKit 0.3.0.*

The `~Bot.onVote` event handler is called when someone votes on a poll created
by your bot.  It receives a `Vote` object, which represents the vote activity,
as the second argument.

The following is an example of a vote event handler that sends a direct message
when someone votes on your bot's poll:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onVote = async (session, vote) => {
  await session.publish(
    text`Thanks for voting "${vote.option}" on my poll, ${vote.actor}!`,
    { visibility: "direct" },
  );
};
~~~~

The `Vote` object contains the following properties:

`~Vote.actor`
:   The actor who voted.

`~Vote.option`
:   The option that was voted for (as a string).

`~Vote.poll`
:   Information about the poll including whether it allows `~Poll.multiple`
    choices, all available `~Poll.options`, and the `~Poll.endTime`.

`~Vote.message`
:   The poll message that was voted on.

> [!TIP]
> You can check if a poll allows multiple selections by accessing the
> `vote.poll.multiple` property:
>
> ~~~~ typescript twoslash
> import { type Bot, text } from "@fedify/botkit";
> const bot = {} as unknown as Bot<void>;
> // ---cut-before---
> bot.onVote = async (session, vote) => {
>   if (vote.poll.multiple) {
>     await vote.message.reply(
>       text`${vote.actor} selected "${vote.option}" in the multiple choice poll!`
>     );
>   } else {
>     await vote.message.reply(
>       text`${vote.actor} voted for "${vote.option}"!`
>     );
>   }
> };
> ~~~~

> [!NOTE]
> The `~Bot.onVote` event handler is only called for votes on polls created by
> your bot. Votes on polls created by others will not trigger this event.

> [!NOTE]
> The bot author cannot vote on their own polls—such votes  are automatically
> ignored and will not trigger the `~Bot.onVote` event handler.

> [!NOTE]
> On a poll with multiple options, each selection creates a separate `Vote`
> object, even if the same user selects multiple options. This means that if
> a user selects multiple options in a multiple-choice poll, the `~Bot.onVote`
> event handler will be called multiple times, once for each selected option.
