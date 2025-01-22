---
description: >-
  The Bot object is the main component of the library.  It is used to register
  event handlers, and provides the entry point of the bot.  Learn how to
  instantiate a Bot object, customize it for your needs, and expose your bot
  to the fediverse.
---

Bot
===

The `Bot` object is the main component of the library.  It is used to register
event handlers, and provides the entry point of the bot—the `~Bot.fetch()`
method to be connected to the HTTP server.


Instantiation
-------------

You can instantiate a `Bot` instance by calling the `createBot()` function:

~~~~ typescript
import { createBot } from "@fedify/bot";
import { MemoryKvStore } from "@fedify/fedify";

const bot = createBot<void>({
  username: "my_bot",
  kv: new MemoryKvStore(kv),
});
~~~~

It takes a type parameter [`TContextData`] which is the type of
the [Fedify context data]. Usually, you don't have to mind this type parameter
and can just use `void` as shown in the example above, unless you are familiar
with Fedify and want to use the context data.

It takes a `CreateBotOptions` object with the following required properties:

[`TContextData`]: https://fedify.dev/manual/federation#tcontextdata
[Fedify context data]: https://fedify.dev/manual/context

### `~CreateBotOptions.username`

The username of the bot actor.  This is used to be a part of the bot's fediverse
handle.  For example, if the username is `my_bot`, the bot's handle will be
`@my_bot@your-domain`.

> [!TIP]
> Although it is not recommended, you can change
> the `~CreateBotOptions.username` after you have once deployed your bot.
> However, in practice, as people would be confused about the username change,
> it is recommended to stick with one good username forever.

### `~CreateBotOptions.kv`

The key–value store to be used by the bot.  There are several drivers
available.  See also the [related section][1] of the Fedify docs.

During local development, you probably want to use
the [`MemoryKvStore`], which stores data in memory.

On production, you probably want to use one of the following drivers:

 -  [`DenoKvStore`] (Deno only)
 -  [`RedisKvStore`]
 -  [`PostgresKvStore`]

Or if you want to implement your own custom key–value store,
[that is also possible!][2]

[1]: https://fedify.dev/manual/kv
[`MemoryKvStore`]: https://fedify.dev/manual/kv#memorykvstore
[`DenoKvStore`]: https://fedify.dev/manual/kv#denokvstore-deno-only
[`RedisKvStore`]: https://fedify.dev/manual/kv#rediskvstore
[`PostgresKvStore`]: https://fedify.dev/manual/kv#postgreskvstore
[2]: https://fedify.dev/manual/kv#implementing-a-custom-kvstore


Additional options
------------------

There are other options to customize your `Bot` instance:

### `~CreateBotOptions.identifier`

The internal identifier of the bot actor.  It is used for the URI of the bot
actor, which is the unique identifier of ActivityPub objects.

By default, it is just a `"bot"`.

> [!CAUTION]
> Unlike [`username`](#createbotoptions-username),
> the `~CreateBotOptions.identifier` *must not* be changed after once your
> bot is deployed.  If you change the identifier of your bot, other fediverse
> software will not recognize your bot as the existing one but it will be
> practically another distinct actor.

### `~CreateBotOptions.class`

The type of the bot actor.  It can be either `Application` or `Service`.

`Service` by default.

> [!NOTE]
> Since BotKit is a framework for creating bots, it does not support
> `Person` or `Group` or `Organization`.

### `~CreateBotOptions.name`

The display name of the bot.  It can be changed after the bot is
federated.

### `~CreateBotOptions.summary`

The description of the bot.  It will be displayed in the bio field
of the profile.  It can be changed after the bot is federated.

Note that it does not take a string, but a `Text` object.
See also the [*Text* chapter](./text.md).

### `~CreateBotOptions.icon`

The avatar URL of the bot.  It can be changed after the bot is federated.

> [!NOTE]
> BotKit does not perform any modifications (cropping or resampling) on
> the avatar image.  The image as it is will be used.  If you want to adjust
> the avatar image so that it looks fine on the most fediverse platforms,
> you need to change the image file itself.

### `~CreateBotOptions.image`

The header image URL of the bot.  It can be changed after the bot is federated.

> [!NOTE]
> BotKit does not perform any modifications (cropping or resampling) on
> the header image.  The image as it is will be used.  If you want to adjust
> the header image so that it looks fine on the most fediverse platforms,
> you need to change the image file itself.

### `~CreateBotOptions.properties`

The custom properties of the bot. Usually you would like to put some metadata
about the bot like the website URL, the source code repository URL, etc. here.
Note that the property names should be human-readable and property values are of
the `Text` type (see also the [*Text* chapter](./text.md)):

~~~~ typescript
import { createBot, link, mention } from "@fedify/botkit";

const bot = createBot<void>({
  // Omitted other options for brevity
  properties: {
    Website: link("https://botkit.fedify.dev/"),
    Repository: link("https://github.com/dahlia/botkit"),
    Creator: mention("@hongminhee@hollo.social"),
  },
});
~~~~

It can be changed after the bot is federated.

### `~CreateBotOptions.followerPolicy`

How to handle incoming follow requests.  Possible values are:

`"accept"` (default)
:   Automatically accept all incoming follow requests.

`"reject"`
:   Automatically reject all incoming follow requests.

`"manual"`
:   Require manual handling of incoming follow requests.  You can manually
    `~FollowRequest.accept()` or `~FollowRequest.reject()` in the
    [`Bot.onFollow`](./events.md#follow) event handler.

It can be changed after the bot is federated.

> [!TIP]
> This behavior can be overridden by manually invoking `FollowRequest.accept()`
> or `FollowRequest.reject()` in the [`Bot.onFollow`](./events.md#follow) event
> handler.

### `~CreateBotOptions.queue`

The message queue for handling incoming and outgoing activities.  If omitted,
incoming activities are processed immediately, and outgoing activities are sent
immediately.

There are several drivers available.  See also the [related section][3] of the
Fedify docs.

During local development, you probably want to use
the [`InProcessMessageQueue`], which processes messages in the same process.

On production, you probably want to use one of the following drivers:

 -  [`DenoKvMessageQueue`] (Deno only)
 -  [`RedisMessageQueue`]
 -  [`PostgresMessageQueue`]

Or if you want to implement your own custom message queue,
[that is also possible!][4]

> [!NOTE]
> Although it can be unset for local development, in production, we highly
> recommend to configure the `~CreateBotOptions.queue` to make your bot
> performant and scalable.

[3]: https://fedify.dev/manual/mq
[`InProcessMessageQueue`]: https://fedify.dev/manual/mq#inprocessmessagequeue
[`DenoKvMessageQueue`]: https://fedify.dev/manual/mq#denokvmessagequeue-deno-only
[`RedisMessageQueue`]: https://fedify.dev/manual/mq#redismessagequeue
[`PostgresMessageQueue`]: https://fedify.dev/manual/mq#postgresmessagequeue
[4]: https://fedify.dev/manual/mq#implementing-a-custom-messagequeue

### `~CreateBotOptions.software`

The metadata about the bot server.  It is used for the NodeInfo protocol.
It consists of the following properties:

`name` (required)
:   The canonical name of the bot software.  This must comply with pattern
    `/^[a-z0-9-]+$/`, i.e., it must consist of Latin lowercase letters, digits,
    and hyphens.

`version` (required)
:   The version of the bot software.  It should be a `SemVer` object.
    You can create a `SemVer` object using the `parseSemVer()` function:

    ~~~~ typescript
    import { createBot, parseSemVer } from "@fedify/botkit";

    const bot = createBot<void>({
      // Omitted other options for brevity
      software: {
        name: "my-bot",
        version: parseSemVer("1.0.0"),  // [!code highlight]
      }
    });
    ~~~~

`repository` (optional)
:   The [`URL`] of the source code repository of the bot software.

`homepage` (optional)
:   the [`URL`] of the homepage of the bot software.

[`URL`]: https://developer.mozilla.org/en-US/docs/Web/API/URL

### `~CreateBotOptions.behindProxy`

Whether to trust `X-Forwarded-*` headers.  If the bot is behind an L7 reverse
proxy (e.g., nginx, Caddy), you should turn it on.

Turned off by default.

> [!TIP]
> During local development, if you use tunneling services like
> [`fedify tunnel`], [ngrok], [Tailscale Funnel], etc., you should turn it on.
> These tunneling services practically act as an L7 reverse proxy.

[`fedify tunnel`]: https://fedify.dev/cli#fedify-tunnel-exposing-a-local-http-server-to-the-public-internet
[ngrok]: https://ngrok.com/
[Tailscale Funnel]: https://tailscale.com/kb/1223/funnel


Running the bot
---------------

After you have instantiated a `Bot` object, you need to connect it to
the HTTP server to run it.  The `Bot` object comply with the [`fetch()`] API,
so you can use it as a request handler for the [`deno serve`] command.

For example, if you have a `Bot` object named `bot`, and `export` it as
a default export:

~~~~ typescript [bot.ts]
import { createBot } from "@fedify/bot";

const bot = createBot<void>({
  // Omitted other options for brevity
});

export default bot;  // [!code highlight]
~~~~

You can run the following command to expose the bot to the fediverse:

~~~~ bash
deno serve -A ./bot.ts
~~~~

Then, it will show the following message:

~~~~
deno serve: Listening on http://0.0.0.0:8000/
~~~~

And your bot will be available at <http://localhost:8000/>.

> [!TIP]
> You can change the listening port by specifying the `--port` option:
>
> ~~~~ bash
> deno serve -A --port=3000 ./bot.ts
> ~~~~

[`fetch()`]: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
[`deno serve`]: https://docs.deno.com/runtime/reference/cli/serve/

### Exposing the bot to the public internet

During local development, you probably want to use a tunneling service like
[`fedify tunnel`], [ngrok], [Tailscale Funnel], etc. to expose your bot to
the public internet so that other fediverse servers can interact with your bot.

In such a case, you should turn on
the [`behindProxy`](#createbotoptions-behindproxy) option to trust
`X-Forwarded-*` headers from the tunneling service and recognize the public
hostname of the server.

It is recommended to have an environment variable to control
the [`behindProxy`](#createbotoptions-behindproxy) option so that you can
easily switch between local development and production:

~~~~ typescript [bot.ts] {3-4,8}
import { createBot } from "@fedify/bot";

const BEHIND_PROXY =
  Deno.env.get("BEHIND_PROXY")?.trim()?.toLowerCase() === "true";

const bot = createBot<void>({
  // Omitted other options for brevity
  behindProxy: BEHIND_PROXY,
});

export default bot;
~~~~

Then, you can use the following command to run the bot with the `BEHIND_PROXY`
environment variable set to `true`:

~~~~ bash
BEHIND_PROXY=true deno serve -A --port 8000 ./bot.ts
~~~~

Then, you can use the tunneling service to expose your bot to the public
internet, for example, with [`fedify tunnel`]:[^1]

~~~~ bash
fedify tunnel 8000
~~~~

The above command will show a temporary public hostname that your bot can be
accessed from the fediverse:[^2]

~~~~
✔ Your local server at 8000 is now publicly accessible:

https://8eba96f5416581.lhr.life/

Press ^C to close the tunnel.
~~~~

[^1]: You need to install the `fedify` command first.  [There are multiple ways
      to install it.][5]
[^2]: The hostname will be different in your case.

[5]: https://fedify.dev/cli#installation
