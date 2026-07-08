---
description: >-
  Learn how to package your BotKit bot as a Docker container and deploy it to
  platforms like Fly.io and Railway.
---

Docker
======

A Docker image gives your bot a consistent runtime you can run anywhere, from
your own host to a container platform like [Fly.io] or [Railway].  BotKit runs
on both Deno and Node.js, so this guide shows a *Dockerfile* for each; pick the
one that matches how you built your bot.

[Fly.io]: https://fly.io/
[Railway]: https://railway.com/


Writing a *Dockerfile*
----------------------

Create a *Dockerfile* in your project root.

::: code-group

~~~~ dockerfile [Deno]
FROM denoland/deno:2.9.1

WORKDIR /app

# Cache dependencies first so this layer is reused when only the source changes
COPY deno.json deno.lock ./
RUN deno install

# Copy the rest of the source
COPY . .

# The bot listens on port 8000
EXPOSE 8000

# A bot uses `export default bot`, so it must be started with `deno serve`
CMD ["deno", "serve", "-A", "--port", "8000", "bot.ts"]
~~~~

~~~~ dockerfile [Node.js]
FROM node:24-bookworm-slim

WORKDIR /app

# Cache dependencies first so this layer is reused when only the source changes
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source
COPY . .

# The bot listens on port 8000
EXPOSE 8000

# Serve the `export default bot` entry through the srvx CLI in production mode
CMD ["node_modules/.bin/srvx", "serve", "--prod", "--port", "8000", "--entry", "bot.ts"]
~~~~

:::

> [!IMPORTANT]
> Start a Deno bot with `deno serve`, not `deno run`.  A bot is defined with
> `export default bot`, and only `deno serve` connects that default export to
> the HTTP server.  `deno run` would evaluate the module and exit without
> serving anything.  See [*Running the bot*](../start.md#running-the-bot) for
> the entrypoint each runtime expects.

The Node.js image runs the bot through the [srvx] CLI, so add *srvx* to your
project's dependencies (`npm add srvx`) and end *bot.ts* with
`export default bot`, exactly as
[*Running the bot*](../start.md#running-the-bot) shows. The CLI executes the
TypeScript entry directly; if you would rather compile to JavaScript ahead of
time, build in the image and point `--entry` at the compiled file.

[srvx]: https://srvx.h3.dev/


Configuration and storage
-------------------------

Pass your bot's configuration, such as its domain and any API tokens, as
environment variables at run time rather than baking them into the image.
That keeps secrets out of the image layers and lets one image run in several
environments.

A container's filesystem is ephemeral: anything written inside it is lost when
the container is replaced.  Do not rely on
[`MemoryKvStore`](../start.md#creating-a-bot) or a SQLite file on the container
filesystem for anything you want to keep.  Point your bot at a managed
key–value store, message queue, and [repository](./store-mq.md) instead, or
mount a persistent volume for the SQLite file.


Deploying to [Fly.io]
---------------------

1.  Install the [Fly.io CLI]

2.  Launch the app, which detects the *Dockerfile* and creates a *fly.toml*:

    ~~~~ bash
    fly launch
    ~~~~

3.  Set your configuration as secrets:

    ~~~~ bash
    fly secrets set SERVER_NAME=your-domain.com
    ~~~~

4.  Deploy:

    ~~~~ bash
    fly deploy
    ~~~~

Fly.io terminates TLS at its edge and forwards requests to your container over
plain HTTP, so turn on
[`behindProxy`](../concepts/bot.md#createbotoptions-behindproxy) in your bot for
BotKit to reconstruct the public HTTPS origin from the forwarded headers.  Make
sure *fly.toml* forwards the public port to the container's port 8000.

[Fly.io CLI]: https://fly.io/docs/flyctl/


Deploying to [Railway]
----------------------

1.  Create a new project on [Railway] and connect your GitHub repository.

2.  Railway builds the *Dockerfile* and deploys the container automatically on
    each push.

3.  Set your configuration under the service's *Variables*, and generate a
    domain (or attach a custom one) under *Settings → Networking*.

Railway also fronts your container with a proxy that terminates TLS, so enable
[`behindProxy`](../concepts/bot.md#createbotoptions-behindproxy) here as well.

<!-- cSpell: ignore denoland bookworm srvx flyctl fly -->
