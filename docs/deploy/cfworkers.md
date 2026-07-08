---
description: >-
  Deploy your BotKit bot to Cloudflare Workers with Workers KV and Cloudflare
  Queues, using Fedify's Cloudflare Workers adapter.
---

Cloudflare Workers
==================

[Cloudflare Workers] can run BotKit bots at the edge.  BotKit itself stays the
same: the Worker supplies Fedify's Cloudflare-specific key-value store and
message queue adapters from [@fedify/cfworkers], then passes each request to
`bot.fetch()`.

Workers do not give your code long-lived process state or a startup hook with
bindings, so create the bot from the `env` object inside each handler.  Fedify's
dispatchers are registered quickly, while keys and bot data live in Workers KV.

[Cloudflare Workers]: https://developers.cloudflare.com/workers/
[@fedify/cfworkers]: https://jsr.io/@fedify/cfworkers


Installing dependencies
-----------------------

Install BotKit, Fedify's Cloudflare Workers adapter, and [Wrangler]:

::: code-group

~~~~ bash [npm]
npm add @fedify/botkit @fedify/cfworkers
npm add -D wrangler @cloudflare/workers-types typescript
~~~~

~~~~ bash [pnpm]
pnpm add @fedify/botkit @fedify/cfworkers
pnpm add -D wrangler @cloudflare/workers-types typescript
~~~~

~~~~ bash [Yarn]
yarn add @fedify/botkit @fedify/cfworkers
yarn add -D wrangler @cloudflare/workers-types typescript
~~~~

:::

If your project uses TypeScript, use Workers types without the DOM library to
avoid duplicate global declarations:

~~~~ json [tsconfig.json]
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types"]
  }
}
~~~~

[Wrangler]: https://developers.cloudflare.com/workers/wrangler/


Configuring Wrangler
--------------------

Create a [Workers KV] namespace for Fedify and a [Cloudflare Queues] queue for
background activity delivery:

~~~~ bash
npx wrangler kv namespace create botkit
npx wrangler queues create botkit
~~~~

Copy the KV namespace ID printed by Wrangler into `wrangler.jsonc`:

~~~~ jsonc [wrangler.jsonc]
{
  "name": "my-bot",
  "main": "src/worker.ts",
  "compatibility_date": "2026-07-08",
  "compatibility_flags": ["nodejs_compat"],
  "kv_namespaces": [
    {
      "binding": "BOTKIT_KV",
      "id": "paste-your-kv-namespace-id-here"
    }
  ],
  "queues": {
    "producers": [
      {
        "binding": "BOTKIT_QUEUE",
        "queue": "botkit"
      }
    ],
    "consumers": [
      {
        "queue": "botkit",
        "max_retries": 3
      }
    ]
  }
}
~~~~

The `nodejs_compat` flag is required because BotKit and its dependencies use
[Node.js compatibility] when bundled for Workers.

[Workers KV]: https://developers.cloudflare.com/kv/
[Cloudflare Queues]: https://developers.cloudflare.com/queues/
[Node.js compatibility]: https://developers.cloudflare.com/workers/runtime-apis/nodejs/


Writing the Worker
------------------

Create the bot from the Worker bindings.  Pass the `env` object as BotKit's
context data so request handlers and queue tasks see the same bindings:

~~~~ typescript [src/worker.ts]
import { WorkersKvStore, WorkersMessageQueue } from "@fedify/cfworkers";
import { createBot, text } from "@fedify/botkit";
import type { MessageBatch } from "@cloudflare/workers-types";

interface Env {
  readonly BOTKIT_KV: KVNamespace;
  readonly BOTKIT_QUEUE: Queue;
}

function createWorkerBot(env: Env) {
  const queue = new WorkersMessageQueue(env.BOTKIT_QUEUE, {
    orderingKv: env.BOTKIT_KV,
  });
  const bot = createBot<Env>({
    username: "mybot",
    kv: new WorkersKvStore(env.BOTKIT_KV),
    queue,
  });

  bot.onMention = async (_session, message) => {
    await message.reply(text`Hello from Cloudflare Workers!`);
  };

  return { bot, queue };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { bot } = createWorkerBot(env);
    return bot.fetch(request, env);
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const { bot, queue } = createWorkerBot(env);
    for (const message of batch.messages) {
      const result = await queue.processMessage(message.body);
      if (!result.shouldProcess) {
        message.retry();
        continue;
      }
      try {
        await bot.federation.processQueuedTask(env, result.message);
        message.ack();
      } catch {
        message.retry();
      } finally {
        await result.release?.();
      }
    }
  },
};
~~~~

Cloudflare Queues deliver messages to the Worker's `queue()` handler, not to
Fedify's usual long-running queue listener.
`WorkersMessageQueue.processMessage()` unwraps Fedify's message and handles
ordering-key locks before `processQueuedTask()` runs the task.


Deploying
---------

Deploy the Worker with Wrangler:

~~~~ bash
npx wrangler deploy
~~~~

Your bot is reachable at the Worker domain, for example
`https://my-bot.your-subdomain.workers.dev/`.  The fediverse handle includes
that hostname, so choose the final domain before you announce the bot.  You can
attach a custom domain in the Cloudflare dashboard or with Wrangler.

BotKit derives its public origin from incoming requests.  For code that
publishes without an incoming request, pass the origin explicitly:

~~~~ typescript
const session = bot.getSession(
  env.ORIGIN ?? "https://my-bot.example.com",
  env,
);
~~~~

Add `ORIGIN` to the `Env` interface and configure it as a Worker variable if
your bot publishes on a schedule or from another request-less trigger.


Operational notes
-----------------

Workers KV has eventual consistency and does not support atomic compare-and-set
operations.  This is fine for small bots, but high-traffic bots may need a
repository backed by another service once BotKit has a Workers-compatible
repository backend for that store.

The web pages and BotKit stylesheet work on Workers because BotKit bundles
those assets into the package.  Custom emoji images registered from local files
do not work on Workers, because there is no normal file system; use URL-backed
custom emoji images instead.

If you enable Cloudflare security products in front of the Worker, make sure
ActivityPub JSON requests are not challenged.  Other fediverse servers must be
able to fetch actor documents, send inbox deliveries, and resolve WebFinger
without a browser.

<!-- cSpell: ignore mybot -->
