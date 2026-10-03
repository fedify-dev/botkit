---
description: >-
  The Session object is a short-lived object that actively communicates with
  the fediverse.  Learn how to create a session and publish messages to the
  fediverse.
---

Session
=======

The `Session` object is a short-lived object that actively communicates with
the fediverse.  It can be [created by yourself](#creating-a-session),
or you can get it when an event handler is called.


Creating a session
------------------

You can create a session by calling the `Bot.getSession()` method:

~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
const session = bot.getSession("https://mydomain");
~~~~

It takes a single argument, the origin of the server to which your bot belongs.
In practice, you would have an environment variable that contains the hostname
of your server, and you would pass it to the `~Bot.getSession()` method:

::: code-group

~~~~ typescript [Deno] twoslash
import type { Bot } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
const SERVER_NAME = Deno.env.get("SERVER_NAME");
if (SERVER_NAME == null) {
  console.error("The SERVER_NAME environment variable is not set.");
  Deno.exit(1);
}

const session = bot.getSession(`https://${SERVER_NAME}`);  // [!code highlight]
~~~~

~~~~ typescript [Node.js] twoslash
import type { Bot } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
const SERVER_NAME = process.env.SERVER_NAME;
if (SERVER_NAME == null) {
  console.error("The SERVER_NAME environment variable is not set.");
  Deno.exit(1);
}

const session = bot.getSession(`https://${SERVER_NAME}`);  // [!code highlight]
~~~~

:::

> [!NOTE]
> A dynamic [bot group](./instance.md#dynamic-bots) hosts many bots, so
> `BotGroup.getSession()` additionally takes the identifier of the bot to
> control and returns a `Promise`:
>
> ~~~~ typescript twoslash
> import type { BotGroup } from "@fedify/botkit";
> const weatherBots = {} as unknown as BotGroup<void>;
> // ---cut-before---
> const session = await weatherBots.getSession(
>   "https://mydomain",
>   "weather_kr",
> );
> ~~~~


Getting a session from an event handler
---------------------------------------

When an event handler is called, you can get a session from the `Session`
object that is passed as the first argument:

~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onMention = async (session, message) => {
  // `session` is a `Session` object
};
~~~~

To learn more about event handlers, see the [*Events* section](./events.md).


Determining which bot the session belongs to
--------------------------------------------

The `Session.bot` property is a `ReadonlyBot`: a read-only view of the bot's
identity and profile, including its `~ReadonlyBot.identifier`,
`~ReadonlyBot.username`, and `~ReadonlyBot.name`.  It is particularly useful
in handlers registered on a [dynamic bot group](./instance.md#dynamic-bots),
where the same handler runs for many bots:

~~~~ typescript twoslash
import type { BotGroup } from "@fedify/botkit";
const weatherBots = {} as unknown as BotGroup<void>;
// ---cut-before---
weatherBots.onMention = async (session, message) => {
  const identifier = session.bot.identifier;
  // …look up the data this particular bot serves…
};
~~~~

> [!NOTE]
> Before BotKit 0.5.0, this property was typed as `Bot`, so event handlers
> could be reassigned through it.  It is now a `ReadonlyBot`, which exposes
> the identity and profile only.  If you need the full `Bot`, hold on to
> the object returned by `createBot()` instead.


Determining the actor URI of the bot
------------------------------------

The `Session` object has an `actorId` property that contains the URI of the bot
actor.  You can use this URI to refer to the bot in messages:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onFollow = async (session, actor) => {
  await session.publish(
    text`Hi, ${actor}! I'm ${session.actorId}. Thanks for following me!`
  );
};
~~~~


Determining the fediverse handle of the bot
-------------------------------------------

The `Session` object has an `actorHandle` property that contains the fediverse
handle of the bot.  It looks like an email address except that it starts with
an `@` symbol: `@myBot@myDomain`.  You can use this handle to refer to the bot
in messages:

~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
import { markdown } from "@fedify/botkit/text";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onFollow = async (session, actor) => {
  await session.publish(
    markdown(`I'm ${session.actorHandle}. Thanks for following me!`)
  );
};
~~~~


Getting the bot's `Actor` object
--------------------------------

The `Session` object has a `~Session.getActor()` method that returns the `Actor`
object of the bot:

~~~~ typescript twoslash
import type { Actor, Session } from "@fedify/botkit";
const session = {} as unknown as Session<void>;
// ---cut-before---
const actor: Actor = await session.getActor();
~~~~


Republishing the bot profile
----------------------------

If you change the bot's profile metadata, such as the display name, bio,
avatar, header image, or account aliases, remote servers may keep showing
the old cached profile until they refresh it themselves.  You can explicitly
notify your
followers by calling the `~Session.republishProfile()` method:

~~~~ typescript twoslash
import type { Session } from "@fedify/botkit";
const session = {} as unknown as Session<void>;
// ---cut-before---
await session.republishProfile();
~~~~

This sends an ActivityPub `Update` activity for the bot actor to the bot's
followers.  Call it after your application updates the bot profile and you want
the change to propagate without waiting for the next post.


Moving the bot to another actor
-------------------------------

*This API is available since BotKit 0.6.0.*

Call `~Session.move()` to move the bot's followers to another BotKit bot or
an account on a different server.  First configure the destination to list
this bot's *actor URI* in its `alsoKnownAs` aliases.  For a BotKit destination,
use [`aliases`](./bot.md#createbotoptions-aliases) and deploy it before starting
the move.  The URI is `session.actorId`, rather than the bot's profile page URL.

~~~~ typescript twoslash
import type { Session } from "@fedify/botkit";
declare const session: Session<void>;
// ---cut-before---
await session.move("@mybot@new.example");
~~~~

The target can also be an actor `URL`, a URI string, or an `Actor` object.
BotKit fetches its current actor document and verifies that its aliases contain
this bot's actor URI.  It rejects the bot itself, targets without an inbox,
and targets that have already moved.

BotKit stores the successor, publishes an actor `Update` carrying `movedTo`,
then sends a push-mode [FEP-7628] `Move` to the old followers.  This includes
followers on the same instance.  Only followers move: posts, followed accounts,
and other data stay on the old server.  Keep that server running while remote
servers process the migration.  A successful call means the notifications were
submitted, rather than that every follower has already moved.

The moved state survives a restart when the repository is persistent.  The
old actor's `successorId` points to the destination, its profile shows a link,
and it rejects incoming follow requests without invoking `onFollow`, regardless
of `followerPolicy`.  `Session.publish()`, `Message.reply()`, and
`Message.share()` throw `TypeError` on a moved bot.  Existing posts remain
accessible, and their editing and deletion remain available.

Other event handlers still run.  Deploy a moved-state check in handlers that
publish or reply *before* starting the move:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
declare const bot: Bot<void>;
// ---cut-before---
bot.onMention = async (session, message) => {
  if ((await session.getActor()).successorId != null) return;
  await message.reply(text`Thanks for mentioning me!`);
};
~~~~

Without this check, a reply attempt throws from the handler and fails the
incoming activity's processing; a configured queue may retry it.  Pending
follow requests retained before the move also cannot be accepted afterwards,
but can still be rejected.  There is no API to undo a move or change its
stored destination.

[FEP-7628]: https://w3id.org/fep/7628

### Recovering notification failures

A storage or delivery failure can occur after the successor has been stored.
BotKit keeps the moved state because some servers may already have processed
the migration.  It attempts the `Move` even if submitting the `Update` fails.
Post-commit notification failures throw `AggregateError`; a storage error can
also leave the write's outcome uncertain.  On any error, check
`(await session.getActor()).successorId` before choosing how to retry.

Calling `move()` on a moved bot throws `TypeError`.  Use
`~Session.republishMove()` to revalidate the stored successor's alias and
resend both notifications to the remaining followers:

~~~~ typescript twoslash
import type { Session } from "@fedify/botkit";
declare const session: Session<void>;
// ---cut-before---
if ((await session.getActor()).successorId != null) {
  await session.republishMove();
}
~~~~

This also reaches followers whose acceptance was already in progress when the
bot moved.  It does not change the successor.  The destination must still list
the old actor as an alias, even if it has since moved again.  With a configured
queue, Fedify retries delivery of notifications it has accepted; without a
queue, delivery happens during the call and can partially fail.

Both methods accept `{ signal: AbortSignal }`.  `move()` honours cancellation
until successor storage commits, then continues both notifications.
`republishMove()` honours cancellation during preparation, including the
follower snapshot, then continues both notifications once submission starts.


Publishing a message
--------------------

See the [*Publishing a message* section](./message.md#publishing-a-message)
in the *Message* concept document.


Getting published messages
--------------------------

See the [*Getting published messages*
section](./message.md#getting-published-messages) in the *Message* concept
document.


Following an actor
------------------

Your bot can follow an actor by calling the `Session.follow()` method.
The following example shows how to get the `bot` follow back all of its
followers:

~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onFollow = async (session, followRequest) => {
  await followRequest.accept();
  await session.follow(followRequest.follower);
};
~~~~

> [!CAUTION]
> The `~Session.follow()` method just sends a follow request to the actor,
> but it does not guarantee that the actor will accept the follow request.
> The actor may reject the follow request, and your bot will not be able to
> follow the actor.
>
> If you want to know whether the actor has accepted or rejected the follow
> request, you need to register
> the [`Bot.onAcceptFollow`](./events.md#accept-follow) and
> [`Bot.onRejectFollow`](./events.md#reject-follow) event handlers.

> [!TIP]
> It takes several kinds of objects as an argument, such as `Actor`, `string`,
> and `URL`:
>
> `Actor`
> :   The actor to follow.
>
> `URL`
> :   The URI of the actor to follow.
>     E.g., `new URL("https://example.com/users/alice")`.
>
> `string`
> :   The URI or the fediverse handle of the actor to follow.
>     E.g., `"https://example.com/users/alice"` or `"@alice@example.com"`.

> [!NOTE]
> If you try to follow an actor that is already followed, the method will just
> do nothing.

When an account the bot follows moves to another account, BotKit automatically
submits a follow request to the verified target and unfollows the old account.
See [the followee move event](./events.md#followee-move) for validation rules,
request timing, and the `onFolloweeMove` callback.


Unfollowing an actor
--------------------

Likewise, your bot can unfollow an actor by calling the `Session.unfollow()`
method.  The following example shows how to make the `bot` unfollow if any of
its followers unfollow it:

~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onUnfollow = async (session, actor) => {
  await session.unfollow(actor);
};
~~~~

> [!TIP]
> Like the `~Session.follow()` method, the `~Session.unfollow()` method takes
> several kinds of objects as an argument, such as `Actor`, `string`, and `URL`.

> [!NOTE]
> If you try to unfollow an actor that is not followed, the method will just
> do nothing.


Checking if the bot follows an actor
------------------------------------

The `Session` object has a `~Session.follows()` method that returns a boolean
value indicating whether your bot follows a given actor.  The following example
shows how to check if your bot follows an actor and respond accordingly:

~~~~ typescript twoslash
import { type Bot, text } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
bot.onMention = async (session, message) => {
  const follows = await session.follows(message.actor);
  await session.publish(
    follows
      ? text`Hi ${message.actor}, I'm already following you!`
      : text`Hi ${message.actor}, I don't follow you yet.`
  );
};
~~~~

> [!TIP]
> Like other methods, `~Session.follows()` accepts several types of arguments
> such as `Actor`, `string`, and `URL`.

> [!NOTE]
> This method returns `false` if the given actor doesn't exist or is
> inaccessible.
