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

<!-- hongdown-disable -->

::: code-group

<<< @/../examples/greet/greet.ts [greet.ts]

:::

<!-- hongdown-enable -->


One-time passcode authentication bot
------------------------------------

This example demonstrates how to implement an emoji-based one-time passcode
authentication system using BotKit's poll functionality.  The bot provides
a simple two-factor authentication mechanism through the fediverse.

The authentication flow works as follows:

1.  *Initial setup*: The user visits the web interface and enters their fediverse
    handle (e.g., `@username@server.com`).

2.  *Challenge generation*: The system generates a random set of emojis and sends
    a direct message containing a poll with all available emoji options to
    the user's fediverse account.

3.  *Web interface display*: The correct emoji sequence is displayed on the
    web page.

4.  *User response*: The user votes for the matching emojis in the poll they
    received via direct message.

5.  *Verification*: The system verifies that the user selected exactly
    the same emojis shown on the web page.

6.  *Authentication result*: If the emoji selection matches, authentication is
    successful.

Key features:

 -  Uses BotKit's [poll functionality](./concepts/message.md#polls) for secure
    voting
 -  Implements a 15-minute expiration for both the challenge and authentication
    attempts
 -  Provides a clean web interface using [Hono] framework and [Pico CSS]
 -  Stores temporary data using [Deno KV] for session management
 -  Supports both direct message delivery and real-time vote tracking

This example showcases how to combine ActivityPub's social features with web
authentication, demonstrating BotKit's capability to bridge fediverse
interactions with traditional web applications.

<!-- hongdown-disable -->

::: code-group

<<< @/../examples/otp/otp.tsx [otp.tsx]

:::

<!-- hongdown-enable -->

[Hono]: https://hono.dev/
[Pico CSS]: https://picocss.com/
[Deno KV]: https://deno.com/kv


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
