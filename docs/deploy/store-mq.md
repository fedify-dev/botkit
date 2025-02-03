---
description: >-
  Learn how to configure and manage key–value stores and message queues for your
  BotKit bot across different deployment environments.
---

Key–value store and message queue 
=================================

BotKit requires two main backend services for operation:

1. A key–value store for persistent data storage
2. A message queue for handling background tasks

This guide covers configuration options for different deployment environments
and provides recommendations for production use.


Key–value stores
----------------

Key–value stores are used to store persistent data for your bot, such as
messages, followers, and followees.  Usually you would want to pair a key–value
store with the main database for your application.

BotKit supports the following key–value store implementations:

### [Deno KV] (Deno Deploy)

[Deno KV] is the simplest option when running on [Deno Deploy]:

~~~~ typescript
import { DenoKvStore } from "@fedify/fedify/x/deno";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "mybot",
  kv: new DenoKvStore(kv),
  // ... other configuration
});
~~~~

> [!NOTE]
> Since [`DenoKvStore`] is provided by [Fedify], you need to install the
> *@fedify/fedify* package to use it.

[Deno KV]: https://deno.land/manual/runtime/kv
[Deno Deploy]: https://deno.com/deploy
[`DenoKvStore`]: https://fedify.dev/manual/kv#denokvstore-deno-only
[Fedify]: https://fedify.dev/

#### Advantages

- Built into Deno runtime
- No additional infrastructure needed
- Automatic replication on Deno Deploy
- ACID transactions support

#### Limitations

- Only available in Deno environments
- Limited querying capabilities
- Size limits per value (64KB on Deno Deploy)

### [Redis] or [Valkey]

[Redis] (or its open source fork [Valkey]) is recommended for production
deployments needing high performance:

~~~~ typescript
import { RedisKvStore } from "@fedify/redis";
import { Redis } from "ioredis";

const redis = new Redis({
  host: Deno.env.get("REDIS_HOST"),
  port: parseInt(Deno.env.get("REDIS_PORT") ?? "6379"),
  password: Deno.env.get("REDIS_PASSWORD"),
  tls: Deno.env.get("REDIS_TLS") === "true",
});

const bot = createBot<void>({
  username: "mybot",
  kv: new RedisKvStore(redis),
});
~~~~

> [!NOTE]
> You need to install the [@fedify/redis] package to use the [`RedisKvStore`].

[Redis]: https://redis.io/
[Valkey]: https://valkey.io/
[@fedify/redis]: https://github.com/fedify-dev/redis
[`RedisKvStore`]: https://fedify.dev/manual/kv#rediskvstore

#### Advantages

- High performance
- Rich data structures
- Clustering support
- Wide hosting options

#### Setup examples

Docker Compose:

~~~~ yaml [compose.yaml]
version: '3'
services:
  valkey:
    image: valkey/valkey:8-alpine
    command: valkey-server --appendonly yes
    volumes:
    - valkey-data:/data
    ports:
    - "6379:6379"

volumes:
  valkey-data:
~~~~

Managed services:

 -  [Upstash] (serverless Redis, works well with Deno Deploy)
 -  [Redis Cloud]
 -  [Amazon ElastiCache]
 -  [Azure Cache for Redis]

[Upstash]: https://upstash.com/
[Redis Cloud]: https://redis.com/redis-enterprise-cloud/overview/
[Amazon ElastiCache]: https://aws.amazon.com/elasticache/
[Azure Cache for Redis]: https://azure.microsoft.com/products/cache

### [PostgreSQL]

[PostgreSQL] is suitable for deployments needing complex queries or
transactions:

~~~~ typescript
import { PostgresKvStore } from "@fedify/postgres";
import postgres from "postgres";

const sql = postgres(Deno.env.get("DATABASE_URL"));

const bot = createBot<void>({
  username: "mybot",
  kv: new PostgresKvStore(sql),
});
~~~~

> [!TIP]
> You need to install the [@fedify/postgres] package to use
> the [`PostgresKvStore`].

[PostgreSQL]: https://www.postgresql.org/
[@fedify/postgres]: https://github.com/fedify-dev/postgres
[`PostgresKvStore`]: https://fedify.dev/manual/kv#postgreskvstore

#### Advantages

 -  ACID compliance
 -  Complex query support
 -  Robust backup solutions
 -  Mature ecosystem

#### Setup examples

Docker Compose:

~~~~ yaml [compose.yaml]
version: '3'
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: botkit
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: botkit
    volumes:
    - postgres-data:/var/lib/postgresql/data
    ports:
    - "5432:5432"

volumes:
  postgres-data:
~~~~

Managed services:

 -  [Neon] (serverless PostgreSQL)
 -  [Amazon RDS]
 -  [Azure Database for PostgreSQL]
 -  [Google Cloud SQL]

[Neon]: https://neon.tech/
[Amazon RDS]: https://aws.amazon.com/rds/postgresql/
[Azure Database for PostgreSQL]: https://azure.microsoft.com/products/postgresql
[Google Cloud SQL]: https://cloud.google.com/sql


Message queues
--------------

Message queues are used to handle background tasks, such as sending messages
and processing incoming activities.  Usually you would want to pair a message
queue with a key–value store for a compact and complete backend solution.

### [Deno KV Queue] (Deno Deploy)

Built on top of [Deno KV], suitable for [Deno Deploy]:

~~~~ typescript
import { DenoKvMessageQueue } from "@fedify/fedify/x/deno";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "mybot",
  kv: new DenoKvStore(kv),
  queue: new DenoKvMessageQueue(kv),
});
~~~~

> [!NOTE]
> Since [`DenoKvMessageQueue`] is provided by [Fedify], you need to install the
> *@fedify/fedify* package to use it.

[Deno KV Queue]: https://docs.deno.com/deploy/kv/manual/queue_overview/
[`DenoKvMessageQueue`]: https://fedify.dev/manual/mq#denokvmessagequeue-deno-only

#### Advantages

 -  No additional infrastructure needed
 -  Works well with Deno Deploy
 -  Automatic scaling on Deno Deploy

#### Limitations

 -  Only available in Deno environments
 -  Limited throughput

### [Redis] or [Valkey]

Recommended for production deployments:

~~~~ typescript
import { RedisMessageQueue } from "@fedify/redis";
import { Redis } from "ioredis";

function getRedis(): Redis {
  return new Redis({
    host: Deno.env.get("REDIS_HOST"),
    port: parseInt(Deno.env.get("REDIS_PORT") ?? "6379"),
    password: Deno.env.get("REDIS_PASSWORD"),
    tls: Deno.env.get("REDIS_TLS") === "true",
  });
}

const bot = createBot<void>({
  username: "mybot",
  kv: new RedisKvStore(getRedis()),
  queue: new RedisMessageQueue(getRedis),
});
~~~~

> [!NOTE]
> You need to install the [@fedify/redis] package to use
> the [`RedisMessageQueue`].

[`RedisMessageQueue`]: https://fedify.dev/manual/mq#redismessagequeue

#### Advantages

 -  High performance
 -  Reliable message delivery
 -  Can be shared with KV store
 -  Good monitoring tools

### [PostgreSQL]

Suitable when already using [PostgreSQL] for storage:

~~~~ typescript
import { PostgresMessageQueue } from "@fedify/postgres";
import postgres from "postgres";

const sql = postgres(Deno.env.get("DATABASE_URL"));

const bot = createBot<void>({
  username: "mybot",
  kv: new PostgresKvStore(sql),
  queue: new PostgresMessageQueue(sql),
});
~~~~

> [!NOTE]
> You need to install the [@fedify/postgres] package to use
> the [`PostgresMessageQueue`].

[`PostgresMessageQueue`]: https://fedify.dev/manual/mq#postgresmessagequeue

#### Advantages

 -  ACID compliance
 -  Can be shared with KV store
 -  Good for long-term persistence
 -  Transaction support

<!-- cSpell: ignore mybot Valkey appendonly -->
