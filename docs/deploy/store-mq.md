---
description: >-
  Learn how to configure and manage key–value stores and message queues for your
  BotKit bot across different deployment environments.
---

Key–value store and message queue
=================================

BotKit requires two main backend services for operation:

1.  A key–value store for persistent data storage
2.  A message queue for handling background tasks

This guide covers configuration options for different deployment environments
and provides recommendations for production use.


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
import { DenoKvStore } from "@fedify/fedify/x/deno";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "mybot",
  kv: new DenoKvStore(kv),
  // ... other configuration
});
~~~~

Since [`DenoKvStore`] is provided by [Fedify], you need to install the
*@fedify/fedify* package to use it:

~~~~ sh [Deno]
deno add jsr:@fedify/fedify
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

### [Deno KV Queue] (Deno Deploy)

Built on top of [Deno KV], suitable for [Deno Deploy].  It requires no
additional infrastructure, works seamlessly with Deno Deploy,
and provides automatic scaling.  However, it's only available in Deno
environments and has limited throughput compared to dedicated message queue
solutions.

~~~~ typescript
import { DenoKvMessageQueue } from "@fedify/fedify/x/deno";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "mybot",
  kv: new DenoKvStore(kv),
  queue: new DenoKvMessageQueue(kv),
});

bot.federation.startQueue();
~~~~

Since [`DenoKvMessageQueue`] is provided by [Fedify], you need to install the
*@fedify/fedify* package to use it:

~~~~ sh [Deno]
deno add jsr:@fedify/fedify
~~~~

[Deno KV Queue]: https://docs.deno.com/deploy/kv/manual/queue_overview/
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

<!-- cSpell: ignore mybot Valkey appendonly -->
