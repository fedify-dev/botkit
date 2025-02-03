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


FediChatBot
-----------

<img src="https://raw.githubusercontent.com/fedify-dev/fedichatbot/refs/heads/main/logo.png" width="128" height="128">

[FediChatBot] is an LLM-powered chatbot for fediverse, of course, built on top
of BotKit.  It consists of about 350 lines of code, and it's a good example of
how to build a chatbot with BotKit.  You can find the source code at:
<https://github.com/fedify-dev/fedichatbot>.

If you want to try FediChatBot, follow [@FediChatBot@fedichatbot.deno.dev] on
your fediverse instance.  You can mention it or send a direct message to it.

[FediChatBot]: https://github.com/fedify-dev/fedichatbot
[@FediChatBot@fedichatbot.deno.dev]: https://fedichatbot.deno.dev/
