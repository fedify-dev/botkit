---
description: >-
  Learn how to configure the key–value store, message queue, and repository
  that back your BotKit bot, and how to choose backends for production.
---

Storage and message queue
=========================

A BotKit bot relies on three pieces of backing infrastructure, each configured
through an option on [`createBot()`](../concepts/bot.md#instantiation) or
[`createInstance()`](../concepts/instance.md):

[`kv`](../concepts/bot.md#createbotoptions-kv)
:   A key–value store that Fedify uses for federation internals, such as the
    bot's cryptographic keys and caches of remote objects.  This one is
    required.

[`queue`](../concepts/bot.md#createbotoptions-queue)
:   A message queue that processes incoming and outgoing activities in the
    background.  It is optional during development but expected in production,
    where you don't want activity delivery to block HTTP responses.

[`repository`](../concepts/bot.md#createbotoptions-repository)
:   A store for the bot's own data: its posts, followers, followees, sent
    follow requests, and poll votes.  It is optional and, when omitted,
    defaults to a [`KvRepository`](../concepts/repository.md#kvrepository)
    layered on the same key–value store.

This guide covers the choices for each and recommends pairings for production.
For the repository API in full, see the
[*Repository* concept chapter](../concepts/repository.md).


Key–value stores
----------------

Key–value stores are used to store persistent data for your bot, such as
messages, followers, and followees.  Usually you would want to pair a
key–value store with the main database for your application.

BotKit supports the following key–value store implementations:

### [Deno KV] (Deno Deploy)

[Deno KV] is the simplest option when running on [Deno Deploy]. It's built into
the Deno runtime with no additional infrastructure needed, provides automatic
replication on Deno Deploy, and supports ACID transactions.  However, it's only
available in Deno environments, has limited querying capabilities, and size
limits per value (64KB on Deno Deploy).

~~~~ typescript
import { DenoKvStore } from "@fedify/denokv";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "mybot",
  kv: new DenoKvStore(kv),
  // ... other configuration
});
~~~~

Since [`DenoKvStore`] is provided by [Fedify], you need to install the
*@fedify/denokv* package to use it:

~~~~ sh [Deno]
deno add jsr:@fedify/denokv
~~~~

[Deno KV]: https://deno.land/manual/runtime/kv
[Deno Deploy]: https://deno.com/deploy
[`DenoKvStore`]: https://fedify.dev/manual/kv#denokvstore-deno-only
[Fedify]: https://fedify.dev/

### [SQLite]

[SQLite] is a good choice for local development and testing, as well as for
small-scale production deployments.  It's lightweight and easy to set up,
provides ACID compliance and transaction support, making it excellent for
development and testing environments.  However, it's not suitable for
high-concurrency production use and has limited scalability.

~~~~ typescript twoslash
import { createBot } from "@fedify/botkit";
import { SqliteKvStore } from "@fedify/sqlite";
import { DatabaseSync } from "node:sqlite";

const sqlite = new DatabaseSync("bot-data.db");
const bot = createBot<void>({
  username: "mybot",
  kv: new SqliteKvStore(sqlite),
});
~~~~

You need to install the *@fedify/sqlite* package to use the [`SqliteKvStore`]:

::: code-group

~~~~ sh [Deno]
deno add jsr:@fedify/sqlite
~~~~

~~~~ sh [npm]
npm add @fedify/sqlite
~~~~

~~~~ sh [pnpm]
pnpm add @fedify/sqlite
~~~~

~~~~ sh [Yarn]
yarn add @fedify/sqlite
~~~~

:::

[SQLite]: https://www.sqlite.org/
[`SqliteKvStore`]: https://fedify.dev/manual/kv#sqlitekvstore

### [Redis] or [Valkey]

[Redis] (or its open source fork [Valkey]) is recommended for production
deployments needing high performance.  It offers excellent performance,
clustering support, and wide hosting options, making it ideal for scalable
production environments.

::: code-group

~~~~ typescript [Deno] twoslash
import { createBot } from "@fedify/botkit";
import { RedisKvStore } from "@fedify/redis";
import { Redis } from "ioredis";

const redis = new Redis({
  host: Deno.env.get("REDIS_HOST"),
  port: parseInt(Deno.env.get("REDIS_PORT") ?? "6379"),
  password: Deno.env.get("REDIS_PASSWORD"),
  tls: Deno.env.get("REDIS_TLS") === "true" ? {} : undefined,
});

const bot = createBot<void>({
  username: "mybot",
  kv: new RedisKvStore(redis),
});
~~~~

~~~~ typescript [Node.js] twoslash
import { createBot } from "@fedify/botkit";
import { RedisKvStore } from "@fedify/redis";
import { Redis } from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT ?? "6379"),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,
});

const bot = createBot<void>({
  username: "mybot",
  kv: new RedisKvStore(redis),
});
~~~~

:::

You need to install the *@fedify/redis* package to use the [`RedisKvStore`]:

::: code-group

~~~~ sh [Deno]
deno add jsr:@fedify/redis
~~~~

~~~~ sh [npm]
npm add @fedify/redis
~~~~

~~~~ sh [pnpm]
pnpm add @fedify/redis
~~~~

~~~~ sh [Yarn]
yarn add @fedify/redis
~~~~

:::

[Redis]: https://redis.io/
[Valkey]: https://valkey.io/
[`RedisKvStore`]: https://fedify.dev/manual/kv#rediskvstore

### [PostgreSQL]

[PostgreSQL] is suitable for deployments needing complex queries or
transactions. It provides ACID compliance, complex query support, robust backup
solutions, and a mature ecosystem, making it an excellent choice when you need
advanced database features.

::: code-group

~~~~ typescript [Deno] twoslash
import { createBot } from "@fedify/botkit";
import { PostgresKvStore } from "@fedify/postgres";
import postgres from "postgres";

const sql = postgres(Deno.env.get("DATABASE_URL")!);

const bot = createBot<void>({
  username: "mybot",
  kv: new PostgresKvStore(sql),
});
~~~~

~~~~ typescript [Node.js] twoslash
import { createBot } from "@fedify/botkit";
import { PostgresKvStore } from "@fedify/postgres";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const bot = createBot<void>({
  username: "mybot",
  kv: new PostgresKvStore(sql),
});
~~~~

:::

You need to install the *@fedify/postgres* package to use
the [`PostgresKvStore`]:

::: code-group

~~~~ sh [Deno]
deno add jsr:@fedify/postgres
~~~~

~~~~ sh [npm]
npm add @fedify/postgres
~~~~

~~~~ sh [pnpm]
pnpm add @fedify/postgres
~~~~

~~~~ sh [Yarn]
yarn add @fedify/postgres
~~~~

:::

[PostgreSQL]: https://www.postgresql.org/
[`PostgresKvStore`]: https://fedify.dev/manual/kv#postgreskvstore


Message queues
--------------

Message queues are used to handle background tasks, such as sending messages
and processing incoming activities.  Usually you would want to pair a message
queue with a key–value store for a compact and complete backend solution.

### [Deno KV Queue]

Built on top of [Deno KV] and available in Deno runtimes.  It needs no
additional infrastructure and pairs naturally with a `DenoKvStore`, though it
has limited throughput compared to dedicated message queue solutions.

> [!IMPORTANT]
> Deno KV queues work only with a local Deno KV database, such as on a
> self-hosted Deno process.  The rebuilt [Deno Deploy] does not support KV
> queues, so use a dedicated queue (or none) there instead; see the
> [*Deno Deploy*](./deno-deploy.md) guide.

~~~~ typescript
import { DenoKvMessageQueue } from "@fedify/denokv";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "mybot",
  kv: new DenoKvStore(kv),
  queue: new DenoKvMessageQueue(kv),
});
~~~~

Since [`DenoKvMessageQueue`] is provided by [Fedify], you need to install the
*@fedify/denokv* package to use it:

~~~~ sh [Deno]
deno add jsr:@fedify/denokv
~~~~

[Deno KV Queue]: https://docs.deno.com/examples/queues/
[`DenoKvMessageQueue`]: https://fedify.dev/manual/mq#denokvmessagequeue-deno-only

### [Redis] or [Valkey]

Recommended for production deployments, offering high performance,
reliable message delivery, the ability to share infrastructure with your
key–value store, and good monitoring tools.

::: code-group

~~~~ typescript [Deno] twoslash
import { createBot } from "@fedify/botkit";
import { RedisKvStore, RedisMessageQueue } from "@fedify/redis";
import { Redis } from "ioredis";

function getRedis(): Redis {
  return new Redis({
    host: Deno.env.get("REDIS_HOST"),
    port: parseInt(Deno.env.get("REDIS_PORT") ?? "6379"),
    password: Deno.env.get("REDIS_PASSWORD"),
    tls: Deno.env.get("REDIS_TLS") === "true" ? {} : undefined,
  });
}

const bot = createBot<void>({
  username: "mybot",
  kv: new RedisKvStore(getRedis()),
  queue: new RedisMessageQueue(getRedis),
});
~~~~

~~~~ typescript [Node.js] twoslash
import { createBot } from "@fedify/botkit";
import { RedisKvStore, RedisMessageQueue } from "@fedify/redis";
import { Redis } from "ioredis";

function getRedis(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT ?? "6379"),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  });
}

const bot = createBot<void>({
  username: "mybot",
  kv: new RedisKvStore(getRedis()),
  queue: new RedisMessageQueue(getRedis),
});
~~~~

:::

You need to install the *@fedify/redis* package to use
the [`RedisMessageQueue`]:

::: code-group

~~~~ sh [Deno]
deno add jsr:@fedify/redis
~~~~

~~~~ sh [npm]
npm add @fedify/redis
~~~~

~~~~ sh [pnpm]
pnpm add @fedify/redis
~~~~

~~~~ sh [Yarn]
yarn add @fedify/redis
~~~~

:::

[`RedisMessageQueue`]: https://fedify.dev/manual/mq#redismessagequeue

### [PostgreSQL]

Suitable when already using [PostgreSQL] for storage.  It provides ACID
compliance, can share infrastructure with your key–value store,
offers good long-term persistence, and supports transactions, making it ideal
when you want to consolidate your backend infrastructure.

::: code-group

~~~~ typescript [Deno] twoslash
import { createBot } from "@fedify/botkit";
import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
import postgres from "postgres";

const sql = postgres(Deno.env.get("DATABASE_URL")!);

const bot = createBot<void>({
  username: "mybot",
  kv: new PostgresKvStore(sql),
  queue: new PostgresMessageQueue(sql),
});
~~~~

~~~~ typescript [Node.js] twoslash
import { createBot } from "@fedify/botkit";
import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const bot = createBot<void>({
  username: "mybot",
  kv: new PostgresKvStore(sql),
  queue: new PostgresMessageQueue(sql),
});
~~~~

:::

You need to install the *@fedify/postgres* package to use
the [`PostgresMessageQueue`]:

::: code-group

~~~~ sh [Deno]
deno add jsr:@fedify/postgres
~~~~

~~~~ sh [npm]
npm add @fedify/postgres
~~~~

~~~~ sh [pnpm]
pnpm add @fedify/postgres
~~~~

~~~~ sh [Yarn]
yarn add @fedify/postgres
~~~~

:::

[`PostgresMessageQueue`]: https://fedify.dev/manual/mq#postgresmessagequeue


Repositories
------------

The key–value store and message queue back Fedify's federation layer.  BotKit
keeps its own data, the bot's posts, followers, followees, sent follow
requests, and poll votes, in a *repository*.  When you omit the
[`repository`](../concepts/bot.md#createbotoptions-repository) option, BotKit
wraps your key–value store in a
[`KvRepository`](../concepts/repository.md#kvrepository), so the default
persists exactly as durably as the `kv` backend you chose above.  You only need
to set `repository` explicitly when you want a different trade-off.

> [!NOTE]
> Choosing a dedicated repository does not remove the need for a key–value
> store.  Fedify still uses `kv` for federation internals, so it stays required
> whichever repository you run.

The [*Repository* concept chapter](../concepts/repository.md) documents every
class and its options.  For deployment, the practical question is which one to
run:

[`KvRepository`](../concepts/repository.md#kvrepository) (default)
:   Stores everything through the key–value store you already configured.  When
    that store is durable, such as Deno KV, Redis, or PostgreSQL, this needs no
    extra setup and is a sound production choice.

[`SqliteRepository`](../concepts/repository.md#sqliterepository)
:   Keeps bot data in a local SQLite file with write-ahead logging.  It suits
    a single-machine deployment where you would rather not run a separate
    database server.  Provided by the *@fedify/botkit-sqlite* package.

[`PostgresRepository`](../concepts/repository.md#postgresrepository)
:   Stores bot data in PostgreSQL tables under a dedicated schema (named
    `botkit` by default).  Reach for it when several bot processes share one
    persistent store, or when you already operate PostgreSQL.  Provided by the
    *@fedify/botkit-postgres* package.

[`RedisRepository`](../concepts/repository.md#redisrepository)
:   Stores bot data directly in Redis data structures.  Like
    `PostgresRepository`, it fits deployments that span several processes, and
    it is convenient when Redis is already part of your stack.  Provided by the
    *@fedify/botkit-redis* package.

A fourth class,
[`MemoryCachedRepository`](../concepts/repository.md#memorycachedrepository),
wraps any of the above with an in-memory cache that trades memory for lower
read latency.  It changes performance, not durability.

For a single-machine bot, SQLite can cover both roles without an external
service.  Point the key–value store and the repository at separate files so
they don't contend for the same database lock:

~~~~ typescript twoslash
import { createBot } from "@fedify/botkit";
import { SqliteKvStore } from "@fedify/sqlite";
import { SqliteRepository } from "@fedify/botkit-sqlite";
import { DatabaseSync } from "node:sqlite";

const bot = createBot<void>({
  username: "mybot",
  kv: new SqliteKvStore(new DatabaseSync("federation.db")),
  repository: new SqliteRepository({ path: "bot-data.db" }),
});
~~~~

Install the package for whichever repository you choose.  For the SQLite
example above:

::: code-group

~~~~ sh [Deno]
deno add jsr:@fedify/botkit-sqlite
~~~~

~~~~ sh [npm]
npm add @fedify/botkit-sqlite
~~~~

~~~~ sh [pnpm]
pnpm add @fedify/botkit-sqlite
~~~~

~~~~ sh [Yarn]
yarn add @fedify/botkit-sqlite
~~~~

:::

<!-- cSpell: ignore mybot Valkey appendonly -->
