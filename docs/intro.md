What is BotKit?
===============

BotKit is a TypeScript framework for creating standalone [ActivityPub] bots
that can interact with Mastodon, Misskey, and other [fediverse] platforms.
Built on top of the robust [Fedify] framework, BotKit simplifies the process
of creating federated bots while handling the underlying ActivityPub
protocol details.

Here's a simple example of what you can build with BotKit:

~~~~ typescript
import { createBot, MemoryKvStore, text } from "@fedify/botkit";

const bot = createBot<void>({
  username: "weatherbot",
  name: "Seoul Weather Bot",
  summary: text`I post daily weather updates for Seoul!`,
  kv: new MemoryKvStore(),
  // ... configuration options
});

// Respond to mentions
bot.onMention = async (session, message) => {
  await message.reply(
    text`Current temperature in Seoul is 18°C with clear skies!`
  );
};

// Post scheduled updates
setInterval(async () => {
  const session = bot.getSession("https://weather.example.com");
  await session.publish(
    text`Good morning! Today's forecast for Seoul:
    🌡️ High: 22°C
    💨 Low: 15°C
    ☀️ Clear skies expected`
  );
}, 1000 * 60 * 60 * 24);  // Daily updates
~~~~

[ActivityPub]: https://activitypub.rocks/
[fediverse]: https://fediverse.info/
[Fedify]: https://fedify.dev/


Key features
------------

### Standalone operation

BotKit allows you to run your bot as a standalone ActivityPub server,
which offers several practical benefits:

 -  No need to create and maintain a Mastodon or Misskey account
 -  Direct control over your bot's database and message queue
  - Freedom to define your own message size limits

Note that while BotKit bots are standalone, they still need to comply with
general fediverse protocols and best practices to ensure reliable federation
with other servers.

### Developer-friendly API

BotKit provides a straightforward API that handles common bot operations:

Event handling
:   Easily respond to mentions, follows, and messages.

    ~~~~ typescript
    bot.onFollow = async (session, follower) => {
      await session.publish(
        text`Thanks for following me, ${follower}!`,
        { visibility: "direct" }
      );
    };
    ~~~~

Rich content
:   Create formatted messages with mentions, hashtags, and media.

    ~~~~ typescript
    await session.publish(
      text`Check out ${link("BotKit docs", "https://botkit.fedify.dev/")}!

        ${hashtag("FediverseBot")}`,
      {
        attachments: [
          new Image({
            mediaType: "image/png",
            url: new URL("https://example.com/chart.png"),
            name: "Daily statistics"
          }),
        ],
      }
    );
    ~~~~

Message management
:   Programmatically update or delete posts.

    ~~~~ typescript
    const msg = await session.publish(text`Initial message`);
    await msg.update(text`Updated content`);
    ~~~~

### Type safety

BotKit is written in TypeScript and provides:

 -  Comprehensive type definitions for all API methods
 -  Compile-time error checking for ActivityPub interactions
 -  Autocomplete support in modern IDEs
 -  Type-safe message formatting utilities

### Deployment options

BotKit currently supports deployment through:

 -  [Deno Deploy] for serverless hosting
 -  Docker containers on platforms like Fly.io and Railway
 -  Self-hosted Node.js or Deno runtime on your own server

[Deno Deploy]: https://deno.com/deploy

### Built on Fedify

BotKit builds upon [Fedify]'s proven ActivityPub implementation:

 -  Robust federation with major fediverse platforms
 -  Built-in retry mechanisms
 -  Support for various storage backends (Redis, PostgreSQL, Deno KV)
 -  Efficient message queue processing


Getting started
---------------

Ready to create your first fediverse bot? Follow our
[step-by-step guide](./start.md) to get your bot up and running in minutes.
