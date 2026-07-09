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

1.  *Initial setup*: The user visits the web interface and enters their
    fediverse handle (e.g., `@username@server.com`).

2.  *Challenge generation*: The system generates a random set of emojis and
    sends a direct message containing a poll with all available emoji options
    to the user's fediverse account.

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

[Hono]: https://hono.dev/
[Pico CSS]: https://picocss.com/
[Deno KV]: https://deno.com/kv

<!-- hongdown-disable -->

::: code-group

<<< @/../examples/otp/otp.tsx [otp.tsx]

:::

<!-- hongdown-enable -->


Multiple bots on one server
---------------------------

The following example shows how to host two independent bots on a single
server using `createInstance()`.  The two bots have distinct handles and
event handlers, but share the same infrastructure (key–value store and message
queue):

 -  *@greetbot* sends a welcome direct message to every new follower and
    replies with a greeting when mentioned.
 -  *@echobot* echoes back the plain text of every mention.

<!-- hongdown-disable -->

::: code-group

<<< @/../examples/multiple-bots/multiple-bots.ts [multiple-bots.ts]

:::

<!-- hongdown-enable -->


On-demand bots
--------------

The following example shows how to create a group of bots that are resolved
on demand from a dispatcher function.  Each bot has the handle
`@lang_<code>@your-domain`, where `<code>` is one of the supported BCP 47
language codes (`en`, `ko`, `ja`, `es`, `fr`).  The dispatcher returns the
bot profile when the code is recognized and `null` otherwise, so only a
handful of handles resolve while the rest return 404.

<!-- hongdown-disable -->

::: code-group

<<< @/../examples/dynamic-bots/on-demand-bots.ts [on-demand-bots.ts]

:::

<!-- hongdown-enable -->


Static and dynamic bots
-----------------------

The following example combines a static bot and a group of dynamic bots on
the same instance.  Static bots take precedence over dynamic ones, and
multiple bot groups are probed in the order they were created.

 -  *@announce* is a static bot that rebroadcasts every mention as a public
    post, effectively acting as an announcement channel.
 -  *@lang\_en*, *@lang\_ko*, and *@lang\_ja* are dynamic bots that greet
    followers and mentions in the respective language.

<!-- hongdown-disable -->

::: code-group

<<< @/../examples/static-and-dynamic-bots/static-and-dynamic-bots.ts [static-and-dynamic-bots.ts]

:::

<!-- hongdown-enable -->


RSS/Atom feed bot
-----------------

The following example shows a bot that polls an RSS, Atom, or RDF feed on
an interval and publishes new entries to the fediverse, replies to
mentions with its status, and persists both its own state and BotKit's
data across restarts using SQLite.  It's covered in depth, file by file,
in the [*Building an RSS bot*](./tutorial/rss-bot.md) tutorial, which also
grows it into a `createInstance()`-based instance hosting one bot per
feed, registered by mentioning the instance with a feed's URL, and ends
with a self-hosted deployment.

<!-- hongdown-disable -->

::: code-group

<<< @/../examples/rss-bot/feed.ts [feed.ts]

<<< @/../examples/rss-bot/db.ts [db.ts]

<<< @/../examples/rss-bot/instance.ts [instance.ts]

:::

<!-- hongdown-enable -->


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
