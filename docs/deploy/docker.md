---
description: >-
  Learn how to deploy your BotKit bot using Docker containers on platforms like
  Fly.io and Railway.
---

Docker
======

Docker containers provide a consistent deployment environment and can be hosted
on various platforms like [Fly.io], [Railway], or any container hosting service.

[Fly.io]: https://fly.io/
[Railway]: https://railway.com/


Creating a *Dockerfile*
-----------------------

Create a *Dockerfile* in your project root:

~~~~ dockerfile [Dockerfile]
FROM denoland/deno:2.1.9

WORKDIR /app

# Cache dependencies
COPY deno.json deno.json
COPY deno.lock deno.lock
RUN deno install

# Copy source code
COPY . .

# The bot needs network access and environment variables
ENV SERVER_NAME=your-domain.com

# Run the bot
CMD ["deno", "run", "-A", "bot.ts"]
~~~~


Deploying to [Fly.io]
---------------------

 1. Install the [Fly.io CLI]

 2. Initialize your Fly.io app:

    ~~~~ bash
    fly launch
    ~~~~

 3. Configure environment variables:

    ~~~~ bash
    fly secrets set SERVER_NAME=your-domain.com
    ~~~~

 4. Deploy your app:

    ~~~~ bash
    fly deploy
    ~~~~

[Fly.io CLI]: https://fly.io/docs/flyctl/


Deploying to [Railway]
----------------------

 1. Create a new project on [Railway]

 2. Connect your GitHub repository

 3. Configure environment variables in the Railway dashboard

 4. Railway will automatically build and deploy your container

<!-- cSpell: ignore denoland -->
