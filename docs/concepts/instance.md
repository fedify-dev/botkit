---
description: >-
  An Instance owns the shared infrastructure and can host multiple bots,
  each with its own actor identity and event handlers.  Learn how to create
  an instance, host static and dynamic bots on it, and migrate an existing
  single-bot deployment.
---

Instance
========

*This API is available since BotKit 0.5.0.*

An `Instance` is a server that can host multiple bots.  It owns the shared
infrastructure: the key–value store, the message queue, the repository, and
HTTP handling.  Each bot hosted on it has its own actor identity, fediverse
handle, collections, and event handlers, while all of them share one
[Fedify federation] under the hood.

If your server hosts a single bot, you don't need this API: `createBot()`
creates a dedicated instance for the bot internally, and everything described
in the [*Bot* concept document](./bot.md) keeps working as before.  Reach for
`createInstance()` when you want several bots, or a whole family of bots
resolved from a database, to share one process and one domain.

[Fedify federation]: https://fedify.dev/manual/federation


Creating an instance
--------------------

You can create an `Instance` by calling the `createInstance()` function:

~~~~ typescript twoslash
import { createInstance } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});
~~~~

The `CreateInstanceOptions` take the infrastructure-related options that
`createBot()` used to take: `~CreateInstanceOptions.kv`,
`~CreateInstanceOptions.repository`, `~CreateInstanceOptions.queue`,
`~CreateInstanceOptions.software`, `~CreateInstanceOptions.behindProxy`, and
`~CreateInstanceOptions.pages`.  It also accepts selected lower-level Fedify
settings through `~CreateInstanceOptions.federationOptions`.  A single
repository stores the data of every bot hosted on the instance, scoped by
their identifiers; see the [*Repository* concept document](./repository.md)
for details.

Two options are specific to multi-bot instances:
`~CreateInstanceOptions.instanceActorIdentifier` overrides the reserved
identifier of [the instance actor](#the-instance-actor), and
`~CreateInstanceOptions.legacyObjectUris` keeps object URIs from an older
single-bot deployment working (see [*Migrating a single-bot
deployment*](#migrating-a-single-bot-deployment)).

### Federation infrastructure options

The `~CreateInstanceOptions.federationOptions` object exposes a deliberately
limited part of Fedify's federation configuration:

`~FederationInfrastructureOptions.allowPrivateAddress`
:   Allows the document loader to fetch private network addresses.  This is
    useful when integration tests run another fediverse server locally.

`~FederationInfrastructureOptions.circuitBreaker`
:   Configures the circuit breaker for queued outgoing activity delivery, or
    disables it when set to `false`.

`~FederationInfrastructureOptions.tracerProvider`
:   Sets the OpenTelemetry tracer provider used for federation operations.

`~FederationInfrastructureOptions.meterProvider`
:   Sets the OpenTelemetry meter provider used for federation metrics.

`~FederationInfrastructureOptions.firstKnock`
:   Selects the HTTP Signatures specification Fedify tries first when it
    encounters an unknown server.

`~FederationInfrastructureOptions.inboxChallengePolicy`
:   Configures `Accept-Signature` challenges on inbox authentication failures.

For example, an integration test can opt into local federation traffic:

~~~~ typescript twoslash
import { createInstance } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";

const instance = createInstance({
  kv: new MemoryKvStore(),
  federationOptions: {
    allowPrivateAddress: true,
  },
});
~~~~

> [!CAUTION]
> Do not enable `allowPrivateAddress` in production.  It disables the document
> loader's protection against requests to loopback, link-local, and private
> network addresses.

BotKit still owns the key–value store, message queue, and user agent passed to
Fedify.  Other Fedify federation options are not accepted here; options that
affect BotKit's lifecycle or delivery behavior need a BotKit-level API.

Like a `Bot`, an `Instance` has a `~Instance.fetch()` method to be connected
to the HTTP server:

~~~~ typescript twoslash
import { createInstance } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});
// ---cut-before---
export default instance;  // Deno
~~~~


Static bots
-----------

The `Instance.createBot()` method creates a bot with a fixed identifier and
profile, hosted on the instance:

~~~~ typescript twoslash
import { createInstance, text } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});
// ---cut-before---
const greetBot = instance.createBot("greet", {
  username: "greetbot",
  name: "Greeting Bot",
});

greetBot.onFollow = async (session, followRequest) => {
  await followRequest.accept();
  await session.publish(text`Welcome, ${followRequest.follower}!`);
};
~~~~

The first argument is the bot's internal identifier, which is used for the
actor URI and *should not* be changed after the bot is federated.  The second
argument is a `BotProfile`, which takes the profile-related options that
`createBot()` used to take: `~BotProfile.username`, `~BotProfile.name`,
`~BotProfile.summary`, `~BotProfile.icon`, `~BotProfile.image`,
`~BotProfile.properties`, `~BotProfile.class`, and
`~BotProfile.followerPolicy`.

Identifiers and usernames must be unique across the instance;
`~Instance.createBot()` throws a `TypeError` on duplicates.

Handler registration works exactly like on a `Bot` created by `createBot()`;
see the [*Events* concept document](./events.md).  Incoming activities are
routed to the bots they are relevant to: a `Follow` reaches the followed bot,
a `Like` reaches the owner of the liked message, a mention reaches the
mentioned bot, and a message from a followed account reaches the bots that
follow its author.


Dynamic bots
------------

Passing a function instead of an identifier to `~Instance.createBot()`
creates a `BotGroup`: a family of bots resolved on demand by
a `BotDispatcher`.  This suits scenarios like “one bot per region,” where
thousands of potential bots are backed by a database rather than declared up
front:

~~~~ typescript twoslash
declare const db: {
  getRegion(code: string): Promise<{ name: string } | null>;
  getWeather(code: string): Promise<string>;
};
import { createInstance, text } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});
// ---cut-before---
const weatherBots = instance.createBot(async (ctx, identifier) => {
  // Return null for identifiers this dispatcher doesn't handle:
  if (!identifier.startsWith("weather_")) return null;
  const region = await db.getRegion(identifier.slice("weather_".length));
  if (region == null) return null;
  return {
    username: identifier,
    name: `${region.name} Weather Bot`,
  };
});

weatherBots.onMention = async (session, message) => {
  // session.bot tells which bot is being mentioned:
  const code = session.bot.identifier.slice("weather_".length);
  const weather = await db.getWeather(code);
  await message.reply(text`Current weather: ${weather}`);
};
~~~~

The dispatcher is invoked whenever an identifier needs to be resolved, e.g.
for serving an actor or routing an incoming activity, so it should be fast.
Resolutions are memoized for the duration of a request, but not across
requests; look profiles up from a database rather than computing them
expensively.

Event handlers registered on the group are shared by every bot it resolves,
and they are read at dispatch time, so the registration order of handlers
and the first resolution of a bot don't matter.

Static bots take precedence over dynamic ones, and when multiple groups are
registered, their dispatchers are probed in the order the groups were
created: a dispatcher that returns `null` passes the identifier on to the
next group, and an identifier no dispatcher recognizes does not resolve at
all.

### Usernames of dynamic bots

By default, BotKit assumes that a dynamic bot's username equals its
identifier, which makes WebFinger lookups (`@weather_kr@your-domain`) work
without extra configuration.  If your usernames differ from your
identifiers, provide a `~CreateBotGroupOptions.mapUsername` callback:

~~~~ typescript twoslash
declare const db: {
  getRegionByName(name: string): Promise<{ code: string } | null>;
};
import { createInstance } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});
declare function dispatcher(ctx: unknown, identifier: string): null;
// ---cut-before---
const weatherBots = instance.createBot(
  async (ctx, identifier) => {
    // …resolve the profile from the identifier…
    return dispatcher(ctx, identifier);
  },
  {
    async mapUsername(ctx, username) {
      const region = await db.getRegionByName(username);
      return region == null ? null : `weather_${region.code}`;
    },
  },
);
~~~~

When both are provided, it is your responsibility to keep the
identifier-to-profile and username-to-identifier mappings consistent.

### Sessions for dynamic bots

Since a group has no single identifier, `BotGroup.getSession()` takes the
identifier of the bot to control:

~~~~ typescript twoslash
declare const dispatcher: import("@fedify/botkit").BotDispatcher<void>;
import { createInstance, text } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});
const weatherBots = instance.createBot(dispatcher);
// ---cut-before---
const session = await weatherBots.getSession(
  "https://mydomain",
  "weather_kr",
);
await session.publish(text`It's sunny in Seoul today!`);
~~~~

It returns a `Promise` since the dispatcher has to resolve the identifier
first, and it rejects with a `TypeError` when the dispatcher doesn't
recognize the identifier.


Multiple bot groups
-------------------

An instance can host several bot groups side by side, each serving
a different kind of bot.  Since a dispatcher that returns `null` passes the
identifier on to the next group, giving each group its own identifier
namespace (e.g. a prefix) is all it takes to keep them apart:

~~~~ typescript twoslash
declare const db: {
  getRegion(code: string): Promise<{ name: string } | null>;
  getWeather(code: string): Promise<string>;
  getTopic(slug: string): Promise<{ name: string } | null>;
  getHeadlines(slug: string): Promise<string>;
};
import { createInstance, text } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});
// ---cut-before---
// A static bot for instance-wide announcements:
const announcements = instance.createBot("announcements", {
  username: "announcements",
  name: "Announcements",
});

// One bot per region, under the weather_ prefix:
const weatherBots = instance.createBot(async (ctx, identifier) => {
  if (!identifier.startsWith("weather_")) return null;
  const region = await db.getRegion(identifier.slice("weather_".length));
  if (region == null) return null;
  return { username: identifier, name: `${region.name} Weather Bot` };
});

// One bot per topic, under the news_ prefix:
const newsBots = instance.createBot(async (ctx, identifier) => {
  if (!identifier.startsWith("news_")) return null;
  const topic = await db.getTopic(identifier.slice("news_".length));
  if (topic == null) return null;
  return { username: identifier, name: `${topic.name} News Bot` };
});

weatherBots.onMention = async (session, message) => {
  const code = session.bot.identifier.slice("weather_".length);
  await message.reply(text`Current weather: ${await db.getWeather(code)}`);
};

newsBots.onMention = async (session, message) => {
  const slug = session.bot.identifier.slice("news_".length);
  await message.reply(text`Today's headlines: ${await db.getHeadlines(slug)}`);
};
~~~~

Resolving the identifier `news_tech` on this instance walks through the
registrations in order: it is not a static bot, `weatherBots` returns `null`
because the prefix doesn't match, and `newsBots` resolves it.  Each group
keeps its own event handlers, so a mention of `@news_tech@your-domain`
reaches `newsBots.onMention` only.

Registering any number of groups is allowed and never an error.  BotKit
cannot tell at registration time whether two arbitrary dispatchers overlap,
so overlaps are resolved by order instead: if two groups would resolve the
same identifier, the group created first wins and the later group's
dispatcher is not even invoked for it.  WebFinger username resolution has
its own order: static bots' usernames win first, then the groups'
`~CreateBotGroupOptions.mapUsername` callbacks are tried in creation order,
and the username-as-identifier fallback for groups without the callback
comes last.  In practice, disjoint namespaces like the prefixes above are
the way to keep group boundaries obvious.


The instance actor
------------------

A multi-bot instance has no single obvious actor whose key should sign
shared-inbox related requests, so it exposes an *instance actor*: an
internal, non-discoverable `Application` actor, similar to Mastodon's
instance actor.  It lives under a reserved identifier, which defaults to
`DEFAULT_INSTANCE_ACTOR_IDENTIFIER` (`__botkit_instance__`).  Bots cannot
take the reserved identifier, whether they are static or resolved by
a dispatcher.

In the unlikely case that the default collides with an identifier you need,
override it through the `~CreateInstanceOptions.instanceActorIdentifier`
option:

~~~~ typescript twoslash
import { createInstance } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";
// ---cut-before---
const instance = createInstance<void>({
  kv: new MemoryKvStore(),
  instanceActorIdentifier: "fetcher",
});
~~~~

Like bot identifiers, the instance actor identifier is used for the actor
URI, so it *should not* be changed after the instance is federated: remote
servers that have seen the instance actor would no longer be able to fetch
its key.

Instances created through the single-bot `createBot()` function keep the
pre-0.5 behavior: the sole bot's key signs shared-inbox requests and no
instance actor is exposed.


Web pages
---------

A multi-bot instance serves a list of its static bots at the web root, and
each bot's pages under a path derived from its username:

 -  `/@{username}`: the bot's profile
 -  `/@{username}/{messageId}`: a message permalink
 -  `/@{username}/followers`: the bot's followers
 -  `/@{username}/tags/{hashtag}`: the bot's messages with a hashtag
 -  `/@{username}/feed.xml`: the bot's Atom feed

Dynamic bots get the same pages once their usernames resolve.  Single-bot
deployments created through `createBot()` keep serving their pages at the
web root as before.


Custom emojis
-------------

Custom emojis belong to the instance and are shared by every bot hosted on
it.  The `Instance.addCustomEmojis()` method works like
[`Bot.addCustomEmojis()`](./text.md#custom-emojis), and emoji names must be
unique across the instance.


Migrating a single-bot deployment
---------------------------------

An existing deployment created with `createBot()` keeps working without any
changes: its data is migrated to the bot-scoped storage layout on startup,
object URIs in the old format are recognized and redirected, and its web
pages stay at the root.

If you later want to move a single-bot deployment onto a multi-bot instance,
two things need to carry over.  First, the repository data: the automatic
migration runs only in the `createBot()` compatibility path, so either run
the deployment once with `createBot()` on BotKit 0.5.0 before switching to
`createInstance()`, or call the repository's `~Repository.migrate()` method
with the bot's identifier yourself.  Second, the object URIs: create the
instance with the `~CreateInstanceOptions.legacyObjectUris` option, so that
object URIs generated by BotKit 0.4 or earlier are still attributed to the
original bot:

~~~~ typescript twoslash
import { createInstance } from "@fedify/botkit";
import { MemoryKvStore } from "@fedify/fedify";
// ---cut-before---
const instance = createInstance<void>({
  kv: new MemoryKvStore(),
  legacyObjectUris: { identifier: "bot" },
});
~~~~

Note that the web page paths change in that case (from `/` to
`/@{username}`), while actor URIs and follower relationships are preserved.
