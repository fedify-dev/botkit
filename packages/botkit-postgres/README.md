@fedify/botkit-postgres
=======================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]

This package is a [PostgreSQL]-based repository implementation for [BotKit].
It provides persistent shared storage for bots running on either [Deno] or
[Node.js], supports connection pooling through [Postgres.js], and stores BotKit
repository data in ordinary PostgreSQL tables under a dedicated schema.

[JSR badge]: https://jsr.io/badges/@fedify/botkit-postgres
[JSR]: https://jsr.io/@fedify/botkit-postgres
[npm badge]: https://img.shields.io/npm/v/@fedify/botkit-postgres?logo=npm
[npm]: https://www.npmjs.com/package/@fedify/botkit-postgres
[GitHub Actions badge]: https://github.com/fedify-dev/botkit/actions/workflows/main.yaml/badge.svg
[GitHub Actions]: https://github.com/fedify-dev/botkit/actions/workflows/main.yaml
[PostgreSQL]: https://www.postgresql.org/
[BotKit]: https://botkit.fedify.dev/
[Deno]: https://deno.land/
[Node.js]: https://nodejs.org/
[Postgres.js]: https://github.com/porsager/postgres


Installation
------------

~~~~ sh
deno add jsr:@fedify/botkit-postgres
npm  add     @fedify/botkit-postgres
pnpm add     @fedify/botkit-postgres
yarn add     @fedify/botkit-postgres
~~~~


Usage
-----

The `PostgresRepository` can be used as a drop-in repository implementation for
BotKit:

~~~~ typescript
import { createBot } from "@fedify/botkit";
import { PostgresRepository } from "@fedify/botkit-postgres";

const bot = createBot({
  username: "mybot",
  repository: new PostgresRepository({
    url: "postgresql://localhost/botkit",
    schema: "botkit",
    maxConnections: 10,
  }),
});
~~~~

You can also inject an existing [Postgres.js] client.  In that case the
repository does not own the client and `close()` will not shut it down:

~~~~ typescript
import postgres from "postgres";
import { PostgresRepository } from "@fedify/botkit-postgres";

const sql = postgres("postgresql://localhost/botkit");
const repository = new PostgresRepository({
  sql,
  schema: "botkit",
});
~~~~


Options
-------

The `PostgresRepository` constructor accepts the following options:

 -  **`sql`**: An existing [Postgres.js] client to use.

 -  **`url`**: A PostgreSQL connection string for an internally managed
    connection pool.

 -  **`schema`** (optional): The PostgreSQL schema name used for BotKit tables.
    Defaults to `"botkit"`.

 -  **`maxConnections`** (optional): Maximum number of connections for an
    internally managed pool created from `url`.

 -  **`prepare`** (optional): Whether to use prepared statements for queries.
    Defaults to `true`.

The options are mutually exclusive: use either `sql` or `url`.  The
`maxConnections` option is only valid together with `url`.


Schema setup
------------

The repository creates its schema and tables automatically on first use.
If you want to provision them explicitly ahead of time, use the exported
`initializePostgresRepositorySchema()` helper:

~~~~ typescript
import postgres from "postgres";
import { initializePostgresRepositorySchema } from "@fedify/botkit-postgres";

const sql = postgres("postgresql://localhost/botkit");
await initializePostgresRepositorySchema(sql, "botkit");
~~~~

If you disable prepared statements, pass `false` as the third argument so
schema initialization uses the same setting.


Features
--------

 -  **Cross-runtime**: Works with both Deno and Node.js using [Postgres.js]

 -  **Shared persistent storage**: Suitable for multi-process and
    multi-instance deployments backed by PostgreSQL

 -  **Schema namespacing**: Keeps BotKit tables grouped under a dedicated
    PostgreSQL schema

 -  **Full `Repository` API**: Implements BotKit repository storage for key
    pairs, messages, followers, follows, followees, and poll votes

 -  **Explicit resource ownership**: Repositories created from a URL own their
    pool, while repositories created from an injected client leave lifecycle
    control to the caller
