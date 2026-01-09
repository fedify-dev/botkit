@fedify/botkit-sqlite
=====================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]

This package is a [SQLite]-based repository implementation for [BotKit].
It provides a production-ready data storage solution using the built-in
`node:sqlite` module, offering better performance and reliability compared to
in-memory storage while maintaining compatibility with both [Deno] and [Node.js]
environments.

[JSR badge]: https://jsr.io/badges/@fedify/botkit-sqlite
[JSR]: https://jsr.io/@fedify/botkit-sqlite
[npm badge]: https://img.shields.io/npm/v/@fedify/botkit-sqlite?logo=npm
[npm]: https://www.npmjs.com/package/@fedify/botkit-sqlite
[GitHub Actions badge]: https://github.com/fedify-dev/botkit/actions/workflows/main.yaml/badge.svg
[GitHub Actions]: https://github.com/fedify-dev/botkit/actions/workflows/main.yaml
[SQLite]: https://sqlite.org/
[BotKit]: https://botkit.fedify.dev/
[Deno]: https://deno.land/
[Node.js]: https://nodejs.org/


Installation
------------

~~~~ sh
deno add jsr:@fedify/botkit-sqlite
npm  add     @fedify/botkit-sqlite
pnpm add     @fedify/botkit-sqlite
yarn add     @fedify/botkit-sqlite
~~~~


Usage
-----

The `SqliteRepository` can be used as a drop-in replacement for other repository
implementations in BotKit:

~~~~ typescript
import { createBot } from "@fedify/botkit";
import { SqliteRepository } from "@fedify/botkit-sqlite";

const bot = createBot({
  username: "mybot",
  name: "My Bot",
  repository: new SqliteRepository({
    // Use a file-based database for persistence:
    path: "./bot-data.db",
    // Enable WAL mode for better performance (default: true):
    wal: true,
  }),
  // ... other bot configuration
});
~~~~

### Options

The `SqliteRepository` constructor accepts the following options:

 -  **`path`** (optional): Path to the SQLite database file. Defaults to
    `":memory:"` for an in-memory database.  Use a file path for persistent
    storage.

 -  **`wal`** (optional): Whether to enable write-ahead logging (WAL) mode for
    better performance.  Defaults to `true`. Note that WAL mode is automatically
    disabled for in-memory databases.

### Examples

#### In-memory database (for testing/development)

~~~~ typescript
const repository = new SqliteRepository(); // Uses :memory: by default
~~~~

#### File-based database (for production)

~~~~ typescript
const repository = new SqliteRepository({
  path: "./data/botkit.db",
  wal: true,
});
~~~~


Features
--------

 -  **Cross-runtime**: Works with both Deno and Node.js using the `node:sqlite`
    module

 -  **High performance**: Utilizes WAL mode and proper indexing for optimal
    performance

 -  **ACID compliance**: Transactions ensure data integrity and consistency

 -  **Full `Repository` API**: Implements all BotKit repository methods
    including:

     -  Key pair management for ActivityPub signing
     -  Message storage and retrieval with temporal filtering
     -  Follower and following relationship management
     -  Poll voting system

 -  **Resource management**: Implements `Disposable` interface for proper cleanup

<!-- cSpell: ignore mybot -->
