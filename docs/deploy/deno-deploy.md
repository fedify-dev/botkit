---
description: >-
  Learn how to deploy your BotKit bot to Deno Deploy, a serverless hosting
  platform for Deno applications.
---

Deno Deploy
===========

[Deno Deploy] is a serverless hosting platform for Deno applications.  It allows
you to deploy your bot without managing servers or infrastructure.  This guide
shows you how to deploy your BotKit bot to Deno Deploy.

[Deno Deploy]: https://deno.com/deploy


Prerequisites
-------------

1.  [Create a Deno Deploy account][1]

2.  [Install the Deno CLI][2] if you haven't already

3.  [Install `deployctl`][3]:

    ~~~~ sh
    deno install -gArf jsr:@deno/deployctl
    ~~~~

4.  Install the [Fedify] package to your bot project:

    ~~~~ sh
    deno add jsr:@fedify/fedify
    ~~~~

5.  Configure your bot to use Deno KV for storage and message queue:

    ~~~~ typescript
    import { createBot } from "@fedify/botkit";
    import { DenoKvMessageQueue, DenoKvStore } from "@fedify/fedify/x/deno";

    const kv = await Deno.openKv();

    const bot = createBot<void>({
      username: "mybot",
      kv: new DenoKvStore(kv),
      queue: new DenoKvMessageQueue(kv),
      // ... other configuration
    });
    ~~~~

[Fedify]: https://fedify.dev/
[1]: https://dash.deno.com/login
[2]: https://docs.deno.com/runtime/getting_started/installation/
[3]: https://docs.deno.com/deploy/manual/deployctl/#install-deployctl


Deploying your bot
------------------

1.  Navigate to your project directory

2.  Deploy your bot:

    ~~~~ sh
    deployctl deploy
    ~~~~

    On the first deployment, `deployctl` will:

     -  Guess the project name from your Git repo or directory name
     -  Create the project automatically if it doesn't exist
     -  Look for common entrypoint files like *main.ts* or *src/main.ts*

    You can also specify these explicitly:

    ~~~~ sh
    deployctl deploy --project=mybot --entrypoint=bot.ts
    ~~~~

3.  Set up your custom domain in the Deno Deploy dashboard (optional)


Environment variables
---------------------

You can set environment variables in multiple ways:

 -  During deployment using the `--env` flag:

    ~~~~ sh
    deployctl deploy --env=SERVER_NAME=mybot.deno.dev
    ~~~~

 -  Using an environment file:

    ~~~~ sh
    deployctl deploy --env-file=.env
    ~~~~

 -  Or configure them in the Deno Deploy dashboard for project-wide settings

Common variables include:

 -  `SERVER_NAME`: Your bot's domain (e.g., `mybot.deno.dev`)
 -  Other bot-specific configuration variables

<!-- cSpell: ignore deployctl mybot -->
