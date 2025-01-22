---
description: >-
  The recipes section contains a list of recipes that demonstrate how to
  implement common tasks with BotKit.
---

Recipes
=======

The recipes section contains a list of recipes that demonstrate how to implement
common tasks with BotKit.


Sending a direct message
------------------------

It is very simple to send a direct message to a user: set
the [`visibility`](./concepts/message.md#visibility) option to `"direct"`
when calling the [`Session.publish()`](./concepts/message.md#publishing-a-message)
method:

~~~~ typescript
bot.onMention = async (session, message) => {
  await session.publish(
    text`Hi, ${message.actor}!`,
    { visibility: "direct" },
  );
};
~~~~

> [!CAUTION]
> You need to mention at least one actor in the message to send a direct
> message.  Otherwise, the message won't be read by anyone.


Following back
--------------

To let your bot follow back all of its followers, you can use
the [`onFollow`](./concepts/events.md#follow) event with
the [`Session.follow()`](./concepts//session.md#following-an-actor) method
together:

~~~~ typescript
bot.onFollow = async (session, followRequest) => {
  await followRequest.accept();
  await session.follow(followRequest.follower);
};
~~~~

> [!NOTE]
> It is not guaranteed that the follow request will be accepted.
> The actor may reject your bot's follow request.


Automatically deleting old messages
-----------------------------------

To automatically delete old messages after a certain period, you can use
[`Session.getOutbox()`](./concepts/message.md#getting-published-messages) method,
[`AuthorizedMessage.delete()`](./concepts/message.md#deleting-a-message) method,
and the [`setInterval()`] function together.  The following example shows how to
delete all messages older than a week:

~~~~ typescript
async function deleteOldPosts(session: Session): Promise<void> {
  const now = Temporal.Now.instant();
  const oneWeekAgo = now.subtract({ hours: 7 * 24 });
  const oldPosts = session.getOutbox({ until: oneWeekAgo });
  for await (const post of oldPosts) {
    await post.delete();
  }
}

setInterval(
  deleteOldPosts,
  1000 * 60 * 60,
  bot.getSession("https://yourdomain")
);
~~~~

[`setInterval()`]: https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setInterval


Scheduled messages
------------------

You can use the [`setInterval()`] function to send messages at regular
intervals:

~~~~ typescript
setInterval(async () => {
  const session = bot.getSession("https://yourdomain");
  await session.publish(text`Hello, world!`);
}, 1000 * 60 * 60);
~~~~

Or if you use non-standard APIs like [`Deno.cron()`], you can use it to send
messages at specific times:

~~~~ typescript
Deno.cron("scheduled messages", "0 0 12 * * *", async () => {
  const session = bot.getSession("https://yourdomain");
  await session.publish(text`Hello, world!`);
});
~~~~

[`Deno.cron()`]: https://docs.deno.com/api/deno/~/Deno.cron


Automatically replying to mentions
----------------------------------

It is simple to automatically reply to mentions of your bot.  You can use the
[`onMention`](./concepts/events.md#mention) event handler and
the [`Message.reply()`](./concepts/message.md#replying-to-a-message) method
together:

~~~~ typescript
bot.onMention = async (session, message) => {
  await message.reply(text`You mentioned me, ${message.actor}!`);
};
~~~~


Thread creation
---------------

Although BotKit has no limitation on characters in a message, sometimes you may
want to create a thread for storytelling or to make audience engagement easier.
You can use the [`Message.reply()`](./concepts/message.md#replying-to-a-message)
method to your own messages too:

~~~~ typescript
async function *createThread<TContextData>(
  session: Session,
  messages: Text<"block", TContextData>[]
): AsyncIterable<AuthorizedMessage<Note, TContextData>> {
  let parent = await session.publish(messages[0]);
  yield parent;
  for (let i = 1; i < messages.length; i++) {
    parent = await parent.reply(messages[i]);
    yield parent;
  }
}

const messages = [
  text`Once upon a time, there was a bot named BotKit.`,
  text`BotKit was created by a developer who wanted to make a bot.`,
  text`The developer used BotKit to create a bot that could do anything.`,
  text`The bot was so powerful that it could even create other bots.`,
  text`And so, BotKit lived happily ever after.`,
];
const session = bot.getSession("https://yourdomain");
for await (const message of createThread(session, messages)) {
  console.debug(`Created message ${message.id}`);
}
~~~~


Thread traversal
----------------

Suppose your bot is an LLM-based chatbot and you want to give your LLM model
the previous messages in a thread as context.  You can achieve this by
recursively traversing
the [`Message.replyTarget`](./concepts/message.md#traversing-the-conversation)
property:

~~~~ typescript
async function traverseThread<TContextData>(
  session: Session,
  message: Message<MessageClass, TContextData>
): Promise<Message<MessageClass, TContextData>[]> {
  const thread: Message<MessageClass, TContextData>[] = [];
  let m: Message<MessageClass, TContextData> | undefined = message;
  while (m != null) {
    thread.push(m);
    m = m.replyTarget;
  }
  thread.reverse();
  return thread;
}
~~~~
