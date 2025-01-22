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

~~~~ typescript
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

~~~~ typescript
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


Unfollow
--------

The `~Bot.onUnfollow` event handler is called when some follower unfollows
your bot.  It receives an `Actor` object, who just unfollowed your bot,
as the second argument.

The following is an example of an unfollow event handler that sends a direct
message when someone unfollows your bot:

~~~~ typescript
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

~~~~ typescript
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

~~~~ typescript
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

~~~~ typescript
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

~~~~ typescript
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
> ~~~~ typescript
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
> ~~~~ typescript {6}
> bot.onMention = async (session, message) => {
>   await message.reply(text`You called me, ${message.actor}?`);
> };
>
> bot.onReply = async (session, reply) => {
>   if (!reply.mentions.some(m => m.href.href === session.actorId.href)) {
>     await reply.reply(text`Thanks for your reply, ${reply.actor}!`);
>   }
> };


Message
-------

The `~Bot.onMessage` event handler is called when any message is received by
your bot, which includes normal messages on the bot's timeline, mentions,
replies, direct messages, and so on.  It receives a `Message` object, which
represents the received message, as the second argument.

The following is an example of a message event handler that replies to a
message that contains the word *BotKit*:

~~~~ typescript
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
> bot receives, which includes mentions and replies.  If your bot listens to
> the `~Bot.onMention` or `~Bot.onReply` event with the `~Bot.onMessage` event
> handler, the `~Bot.onMention` or `~Bot.onReply` event handler is called
> first.  You should be careful not to perform unexpected actions.
>
> The below example shows how to avoid the `~Bot.onMessage` event handler from
> being called when a mention message is received:
>
> ~~~~ typescript {6-8}
> bot.onMention = async (session, message) => {
>   await message.reply(text`You called me, ${message.actor}?`);
> };
>
> bot.onMessage = async (session, message) => {
>   if (message.mentions.some(m => m.href.href === session.actorId.href)) {
>     return;
>   }
>   if (message.text.match(/\bbotkit\b/i)) {
>     await message.reply(text`You mentioned ${em("BotKit")}!`);
>   }
> };
> ~~~~
