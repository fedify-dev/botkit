<img src="./logo.svg" alt="BotKit by Fedify" width="203" height="165">

BotKit by Fedify
================

> [!NOTE]
> BotKit is still in early development.  The API may change in the future.
> Although it currently supports only Deno, it will support Node.js and Bun
> later.

BotKit is a framework for creating [ActivityPub] bots.  It is powered by
[Fedify], a lower-level library for creating ActivityPub server applications.
Unlike Mastodon bots, BotKit is designed to create a standalone ActivityPub bot,
which is a complete ActivityPub server in itself and not limited to Mastodon's
capabilities (such as the 500-character limit per post).

BotKit's API is so simple and easy to use that you can create a complete bot in
a single TypeScript file.  Here's an example of a simple bot that just greets:

~~~~ typescript
import { createBot, mention, text } from "@fedify/botkit";
import { RedisKvStore } from "@fedify/redis";
import { Redis } from "ioredis";

// Create a bot instance:
const bot = createBot<void>({
  // The bot will have fediverse handle "@greetbot@mydomain":
  username: "greetbot",
  // Set the display name:
  name: "Greet Bot",
  // Set the profile icon (avatar):
  icon: new URL("https://mydomain/icon.png"),
  // Set the bio:
  summary: text`Hi, there! I'm a simple fediverse bot created by ${
    mention("@hongminhee@hollo.social")}.`,
  // Use Redis as a key-value store:
  kv: new RedisKvStore(new Redis()),
  // Use Redis as a message queue:
  queue: new RedisMessageQueue(() => new Redis()),
});

// A bot can respond to a mention:
bot.onMention(/hi|hello|what'?s\s+up/i, async (message) => {
  await message.reply(text`Hi, ${ctx.actor}!`);
});

// Or, a bot also can actively publish a post:
const session = bot.getSession(new URL("https://mydomain/"));
setInterval(async () => {
  await session.publish(text`Hi, forks! It's an hourly greeting.`);
}, 1000 * 60 * 60);

export default bot;
~~~~

[ActivityPub]: https://activitypub.rocks/
[Fedify]: https://fedify.dev/

<!-- cSpell: ignore greetbot mydomain -->
