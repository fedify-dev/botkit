---
description: >-
  Deploy your BotKit bot to Deno Deploy, Deno's serverless platform, from
  a GitHub-connected app backed by a managed Deno KV database.
---

Deno Deploy
===========

[Deno Deploy] is Deno's serverless platform for running JavaScript and
TypeScript in the cloud.  You connect a GitHub repository, and it builds and
runs your bot with no servers to manage.  This guide targets the current Deno
Deploy, whose dashboard lives at [console.deno.com].

> [!IMPORTANT]
> The original Deno Deploy is now called *Deno Deploy Classic* (at
> `dash.deno.com`), and it shuts down on July 20, 2026 along with the
> `deployctl` CLI.  This guide covers the rebuilt Deno Deploy.  If your bot
> still runs on Classic, follow the [migration guide] to move it over.

[Deno Deploy]: https://deno.com/deploy
[console.deno.com]: https://console.deno.com/
[migration guide]: https://docs.deno.com/deploy/migration_guide/


Provisioning a Deno KV database
-------------------------------

BotKit needs a key–value store for Fedify's federation data.  On Deno Deploy,
[Deno KV] provides it, and once a KV database is assigned to your app,
`Deno.openKv()` connects to it automatically with no credentials in your code:

1.  In the [console][console.deno.com], open your organization and click
    *Databases*.
2.  Click *Provision Database*, choose *Deno KV*, name it, and save.
3.  Click *Assign* next to the database and pick your app.

> [!IMPORTANT]
> The rebuilt Deno Deploy does not support Deno KV *queues*, so BotKit cannot
> use `DenoKvMessageQueue` here.  Without a message queue, BotKit processes
> incoming and outgoing activities inline, which is fine for a bot with light to
> moderate traffic.  For background delivery, provision managed PostgreSQL and
> use its queue; see the [*Message queues*](./store-mq.md#message-queues)
> section.

Deno Deploy also offers managed PostgreSQL for when you outgrow Deno KV's 64 KB
per-value limit; see the [*Repositories*](./store-mq.md#repositories) section
for moving the bot's own data onto a dedicated repository.

[Deno KV]: https://docs.deno.com/deploy/reference/deno_kv/


Preparing the entrypoint
------------------------

Deno Deploy runs your entrypoint the way `deno run` does, so the file has to
start an HTTP server itself with [`Deno.serve()`].  Pass the bot's `fetch()`
method as the handler:

~~~~ typescript [bot.ts] twoslash
import { createBot } from "@fedify/botkit";
import { DenoKvStore } from "@fedify/denokv";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "mybot",
  kv: new DenoKvStore(kv),
});

Deno.serve((request) => bot.fetch(request));  // [!code highlight]
~~~~

This differs from the `export default bot` entrypoint that
[*Running the bot*](../concepts/bot.md#running-the-bot) shows, because Deno
Deploy executes the file directly instead of through the `deno serve` command.

The `DenoKvStore` class comes from Fedify's *@fedify/denokv* package:

~~~~ sh
deno add jsr:@fedify/denokv
~~~~

[`Deno.serve()`]: https://docs.deno.com/api/deno/~/Deno.serve


Creating the app
----------------

Sign in to [console.deno.com] and create an organization if you don't have one.
Click *+ New App* and choose the GitHub repository that holds your bot.

> [!NOTE]
> Deno Deploy does not yet support a bot that lives in a subdirectory of
> a monorepo; the repository root has to be the bot itself.

Open *Edit build config* and set the fields that matter for a BotKit bot:

*Framework preset*
:   *No Preset*.

*Install command*
:   `deno install`, to cache the bot's dependencies.

*Build command*
:   Leave it empty; a BotKit bot needs no build step.

*Runtime configuration*
:   *Dynamic*, because the bot is a long-running server.

*Dynamic entrypoint*
:   `bot.ts`, the file that calls `Deno.serve()`.

Confirm the Deno KV database is assigned to the app, then start the first
deployment.  Deno Deploy rebuilds and ships a new version on every push to the
connected branch.


Custom domain and origin
------------------------

Deno Deploy serves each app from a default domain of the form
`app-name.org-name.deno.net`.  A bot's fediverse handle is `@username@domain`,
where `domain` is that hostname, so settle on the final domain before you
announce the bot: changing it later changes the handle and breaks existing
follows.  You can attach a custom domain to the app in the console.

BotKit reads the domain from each incoming request, so most of the bot needs no
configuration.  The exception is code that publishes without a request to derive
the origin from, such as a scheduled post.  There, pass the origin to
[`getSession()`](../concepts/session.md) yourself, usually from an environment
variable:

~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
const bot = {} as unknown as Bot<void>;
// ---cut-before---
const session = bot.getSession(
  Deno.env.get("ORIGIN") ?? "https://mybot.myorg.deno.net",
);
~~~~


Environment variables
---------------------

Set environment variables under the app's settings in the console.  Each
variable is either plain text or a secret, and applies to the *Production*
context (your production domains), the *Development* context (preview and branch
domains), or both.

BotKit reads no environment variables of its own; these names are ones your bot
code chooses.  A common convention is:

 -  `ORIGIN` (or `SERVER_NAME`): the bot's public origin, including the scheme
    (for example, `https://mybot.myorg.deno.net`), read when building a session
    for request-less publishing as shown above.
 -  Any credentials your bot needs, such as API tokens.


Deploying from the command line
-------------------------------

If you would rather not connect a repository, the `deno deploy` subcommand
deploys straight from your machine.  It replaces the old `deployctl`, which
retires together with Deno Deploy Classic.  See the
[Deno Deploy documentation][Deno Deploy docs] for its usage.

[Deno Deploy docs]: https://docs.deno.com/deploy/

<!-- cSpell: ignore deployctl mybot myorg -->
