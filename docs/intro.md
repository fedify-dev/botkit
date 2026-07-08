What is BotKit?
===============

BotKit is a TypeScript framework for building [ActivityPub] bots that belong
to your application.

A BotKit bot is not a script driving an account on someone else's Mastodon or
Misskey server.  It is an ActivityPub actor served by your app, on your domain,
backed by your storage, your queue, and your code.  It can still talk to
Mastodon, Misskey, and the wider [fediverse], but you do not have to provision a
social account for every bot identity you want to run.

That model matters once a bot becomes part of a product.  You may want one bot
per project, one bot per region, one bot per workspace, one bot per customer,
or a family of bots created from rows in your database.  BotKit gives those bots
fediverse identities without turning each one into a manually managed account.

BotKit is built on [Fedify], which handles the lower-level federation work:
actors, ActivityPub objects, WebFinger discovery, signatures, inboxes,
outboxes, delivery, queues, and compatibility with other fediverse software.
You write bot behavior in TypeScript.  BotKit and Fedify handle the protocol
machinery.

Here is a small weather bot:

~~~~ typescript twoslash
import { createBot, MemoryKvStore, text } from "@fedify/botkit";

const bot = createBot<void>({
  username: "weatherbot",
  name: "Seoul Weather Bot",
  summary: text`I post daily weather updates for Seoul!`,
  kv: new MemoryKvStore(),
});

bot.onMention = async (session, message) => {
  await message.reply(
    text`Current temperature in Seoul is 18°C with clear skies!`
  );
};

setInterval(async () => {
  const session = bot.getSession("https://weather.example.com");
  await session.publish(
    text`Good morning! Today's forecast for Seoul:
    🌡️ High: 22°C
    💨 Low: 15°C
    ☀️ Clear skies expected`
  );
}, 1000 * 60 * 60 * 24);
~~~~

[ActivityPub]: https://activitypub.rocks/
[fediverse]: https://fediverse.info/
[Fedify]: https://fedify.dev/


From account automation to bot applications
-------------------------------------------

The Mastodon and Misskey APIs are good tools when you want to automate one
account.  Create the account, get an access token, post updates, reply to
mentions.  For a personal bot or a small integration, that may be the right
shape.

BotKit starts where that shape gets tight.

If bots are part of your app, you often need to create, configure, route, store,
and remove bot identities from application code.  A workspace might need its own
announcement bot.  A monitoring service might expose one fediverse actor per
system or region.  A project hosting service might create a bot for every
repository.  In those cases, a bot is not really “an account somewhere.”  It is
one of your application resources.

BotKit lets you model it that way.


Standalone operation
--------------------

BotKit runs your bot as a standalone ActivityPub server.  That gives you direct
control over the parts that account automation usually leaves inside someone
else's platform:

 -  the actor URL and fediverse handle;
 -  the database or repository that stores bot state;
 -  the message queue used for delivery and incoming activities;
 -  the deployment target;
 -  the message size limits and other product rules.

The bot still has to follow fediverse protocols and good federation behavior.
Standalone does not mean isolated.  It means the bot is served by your
application instead of being hosted as an account on another server.


One application, many bots
--------------------------

A BotKit `Instance` can host several bots on one domain.  Each bot has its own
actor identity, handle, collections, profile, and event handlers.  The instance
owns the shared infrastructure: the key–value store, repository, message queue,
and HTTP handling.

You can declare static bots up front:

~~~~ typescript twoslash
import { createInstance, MemoryKvStore } from "@fedify/botkit";

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});

const greetBot = instance.createBot("greet", {
  username: "greetbot",
  name: "Greeting Bot",
});

const echoBot = instance.createBot("echo", {
  username: "echobot",
  name: "Echo Bot",
});

export default instance;
~~~~

You can also use dynamic bot groups, where BotKit resolves a bot on demand from
your database.  That is the model for “one bot per region,” “one bot per
project,” or “one bot per customer” without declaring every possible bot in
source code.

~~~~ typescript twoslash
import { createInstance, MemoryKvStore, text } from "@fedify/botkit";

declare const db: {
  findCity(code: string): Promise<{ name: string } | null>;
};
// ---cut-before---
const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});

const weatherBots = instance.createBot(async (_ctx, identifier) => {
  if (!identifier.startsWith("weather_")) return null;
  const city = await db.findCity(identifier.slice("weather_".length));
  if (city == null) return null;
  return {
    username: identifier,
    name: `${city.name} Weather Bot`,
  };
});

weatherBots.onMention = async (session, message) => {
  const code = session.bot.identifier.slice("weather_".length);
  await message.reply(text`Weather for ${code}: sunny`);
};
~~~~

See [*Instance*](./concepts/instance.md) for the full model.


Events as TypeScript handlers
-----------------------------

BotKit turns fediverse activity into TypeScript callbacks.  You can handle
mentions, replies, follows, unfollows, direct messages, quotes, quote requests,
poll votes, and emoji reactions without writing ActivityPub routing code by
hand.

~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
import { text } from "@fedify/botkit";

declare const bot: Bot<void>;
// ---cut-before---
bot.onFollow = async (session, follower) => {
  await session.publish(
    text`Thanks for following me, ${follower}!`,
    { visibility: "direct" },
  );
};

bot.onReact = async (session, reaction) => {
  await reaction.message.reply(
    text`Thanks for reacting with ${reaction.emoji}!`,
  );
};
~~~~

Handlers receive typed objects, not raw JSON blobs.  The protocol details still
matter, but they do not have to dominate your bot code.

See [*Events*](./concepts/events.md) for the available handlers.


TypeScript all the way down
---------------------------

BotKit is written for TypeScript applications.  Event handlers receive typed
objects, message builders expose typed options, and sessions carry the context
type you choose for your bots.

That does not mean TypeScript can prove that every remote server will accept a
message or support every fediverse feature.  Federation still happens at
runtime, across different implementations.  What the types do give you is a
firmer boundary inside your own app: bot behavior, message composition,
session context, and multi-bot routing can be checked before the code runs.

~~~~ typescript twoslash
import type { Session } from "@fedify/botkit";
import { createBot, MemoryKvStore, text } from "@fedify/botkit";

interface AppContext {
  readonly tenantId: string;
}

const bot = createBot<AppContext>({
  username: "support",
  name: "Support Bot",
  kv: new MemoryKvStore(),
});

async function postWelcome(session: Session<AppContext>) {
  await session.publish(text`Welcome to ${session.actorHandle}!`);
}

bot.onFollow = async (session) => {
  await postWelcome(session);
};

const session = bot.getSession(
  "https://support.example",
  { tenantId: "acme" },
);
await postWelcome(session);
~~~~


Messages with fediverse features
--------------------------------

BotKit messages are built with the `text` template tag, which escapes HTML and
knows how to include mentions, hashtags, links, and custom emoji.  You can
attach media, update or delete posts, set visibility, open polls, send emoji
reactions, and publish quote posts.

Quotes include both Misskey-style quote posts and consent-respecting quote
policies based on [FEP-044f].  That matters because fediverse software does not
all treat quotes the same way.  BotKit gives you APIs for the feature while
keeping quote permission part of the model.

~~~~ typescript twoslash
import type { Session } from "@fedify/botkit";
import { hashtag, Image, text } from "@fedify/botkit";

declare const session: Session<void>;
declare const url: URL;
// ---cut-before---
await session.publish(
  text`New chart is up! ${hashtag("BotKit")}`,
  {
    attachments: [new Image({ url, mediaType: "image/png" })],
    visibility: "public",
  },
);
~~~~

See [*Message*](./concepts/message.md) for publishing, editing, polls,
reactions, and quotes.

[FEP-044f]: https://w3id.org/fep/044f


Your storage, your queue, your deployment
-----------------------------------------

BotKit is meant to fit inside your infrastructure.  It can use Deno KV, SQLite,
Redis or Valkey, PostgreSQL, and custom backends through its repository and
queue abstractions.  A multi-bot instance can store data for all hosted bots in
one repository while keeping each bot's data scoped by identifier.

That makes bot state part of the same operational world as the rest of your
app: backups, migrations, admin tools, logs, and deployment rules.  You are not
coordinating with an external social account from the outside.  You are running
federated actors as part of your own system.

BotKit supports Deno, Node.js, Cloudflare Workers, Deno Deploy, Docker-based
deployments, and self-hosted servers.

See [*Repository*](./concepts/repository.md),
[*Store and message queue*](./deploy/store-mq.md), and
[*Deploy*](./deploy/deno-deploy.md) for details.


When BotKit fits
----------------

Use BotKit when your bot is more than a single account automation script.  It
fits best when bot identities come from your app, when several bots should
share one deployment, or when storage and delivery need to live under your
control.

For a personal bot that posts occasional updates from one Mastodon account, the
Mastodon API may be enough.  For a fediverse bot product, a multi-tenant
service, or an app that needs actors of its own, BotKit gives you the more
direct model: ActivityPub bots as application resources.
