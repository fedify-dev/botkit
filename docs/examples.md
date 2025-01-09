Examples
========

Here are some examples of how to use BotKit.


Greeting bot
------------

The following example shows how to publish messages in various ways using
BotKit.  The bot performs the following actions:

 -  Sends a direct message with an image attachment when someone follows
    the bot.
 -  Sends a direct message when someone unfollows the bot.
 -  Replies to it when someone replies to a message from the bot.
 -  Replies to it when someone mentions the bot.
 -  Publishes a greeting message every minute.
 -  Deletes the greeting message after 30 seconds.

::: code-group

<<< @/../examples/greet.ts [greet.ts]

:::
