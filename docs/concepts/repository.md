---
description: >-
  A repository is a data access object that provides an abstraction over the
  underlying data source.  This document provides an overview of repositories
  and how they are used in the framework.
---

Repository
==========

A repository is a data access object that provides an abstraction over the
underlying data source.  BotKit provides a few built-in repositories that
can be used to interact with the database, but you can also create your own
repositories to interact with other data sources.


`KvRepository`
--------------

It is the default repository provided by BotKit.  If you omit the
[`repository`](./bot.md#createbotoptions-repository) option of
the [`createBot()`](./bot.md#instantiation) function, BotKit will use
the `KvRepository` by default.

The `KvRepository` is a repository that stores data in a key–value store
through the [`KvStore`] interface, which is provided by the Fedify.
Since the [`KvStore`] interface itself also abstracts over the underlying
data source, you can easily switch between different key–value stores
without changing the repository implementation.

There are several [`KvStore`] implementations available in the Fedify:

[`RedisKvStore`]
:   [`RedisKvStore`] is a key–value store implementation that uses Redis as
    the backend storage.  It provides scalability and high performance, making
    it suitable for production use in distributed systems.  It requires
    a Redis server setup and maintenance.

    > [!NOTE]
    > The [`RedisKvStore`] class is available in the [@fedify/redis] package.

[`PostgresKvStore`]
:   [`PostgresKvStore`] is a key–value store implementation that uses
    PostgreSQL as the backend storage.  It provides scalability and high
    performance, making it suitable for production use in distributed systems.
    It requires a PostgreSQL server setup and maintenance.

    > [!NOTE]
    > The [`PostgresKvStore`] class is available in the [@fedify/postgres]
    > package.

[`DenoKvStore`] (Deno only)
:   [`DenoKvStore`] is a key–value store implementation for [Deno] runtime
    that uses Deno's built-in [`Deno.openKv()`] API.  It provides persistent
    storage and good performance for Deno environments.  It's suitable for
    production use in Deno applications.

    > [!NOTE]
    > The [`DenoKvStore`] class is available in *x/deno* module of
    > the [@fedify/fedify] package.

[`MemoryKvStore`]
:   A simple in-memory key–value store that doesn't persist data.  It's
    best suited for development and testing environments where data don't
    have to be shared across multiple nodes.  No setup is required, making
    it easy to get started.

    > [!TIP]
    > Although [`MemoryKvStore`] is provided by Fedify, BotKit also re-exports
    > it for convenience.

[`KvStore`]: https://fedify.dev/manual/kv
[`RedisKvStore`]: https://fedify.dev/manual/kv#rediskvstore
[@fedify/redis]: https://github.com/fedify-dev/redis
[`PostgresKvStore`]: https://fedify.dev/manual/kv#postgreskvstore
[@fedify/postgres]: https://github.com/fedify-dev/postgres
[`DenoKvStore`]: https://fedify.dev/manual/kv#denokvstore-deno-only
[Deno]: https://deno.com/
[`Deno.openKv()`]: https://docs.deno.com/api/deno/~/Deno.openKv
[@fedify/fedify]: https://fedify.dev/
[`MemoryKvStore`]: https://fedify.dev/manual/kv#memorykvstore


`MemoryRepository`
------------------

The `MemoryRepository` is a repository that stores data in memory, which means
that data is not persisted across restarts.  It's best suited for development
and testing environments where data don't have to be shared across multiple
nodes. No setup is required, making it easy to get started.

> [!TIP]
> How does it differ from using [`KvRepository`](#kvrepository) with
> [`MemoryKvStore`]?—In practice, there's no difference between using
> `MemoryRepository` and [`KvRepository`](#kvrepository) with
> [`MemoryKvStore`].  The only differences are that `MemoryRepository` is
> a more convenient way to use `MemoryKvStore` and that it's slightly more
> efficient because it doesn't have to go through the [`KvStore`] interface.


`MemoryCachedRepository`
------------------------

*This API is available since BotKit 0.3.0.*

The `MemoryCachedRepository` is a repository decorator that adds an in-memory
cache layer on top of another repository. This is useful for improving
performance by reducing the number of accesses to the underlying persistent
storage, but it increases memory usage. The cache is not persistent and will
be lost when the process exits.

It takes an existing `Repository` instance (like `KvRepository` or even
another `MemoryCachedRepository`) and wraps it. Write operations are performed
on both the underlying repository and the cache. Read operations first check
the cache; if the data is found, it's returned directly. Otherwise, the data
is fetched from the underlying repository, stored in the cache, and then
returned.

> [!NOTE]
> List operations like `getMessages` and `getFollowers`, and count operations
> like `countMessages` and `countFollowers` are not cached due to the
> complexity of handling various filtering and pagination options. These
> operations always delegate directly to the underlying repository.


Implementing a custom repository
--------------------------------

You can create your own repository by implementing the `Repository` interface.
The `Repository` interface is a generic interface that defines the basic
CRUD (create, read, update, delete) operations for data access.

The `Repository` interface consists of the following five domains of operations
in general:

Key pairs
:   Key pairs are the singleton data that are used for the bot actor.
    At the surface level, the key pairs are represented as [`CryptoKeyPair`]
    objects, but you would typically store them as [JWK].

    > [!TIP]
    > Fedify provides `exportJwk()` and `importJwk()` functions to convert
    > a [`CryptoKey`] object to a JWK object and vice versa.

Messages
:   Messages are the data of the messages that are published by the bot.
    Remote messages received from the remote server are not included in this
    domain.  Each message has its own UUID and represented by either
    a `Create` object or an `Announce` object (which both are provided by
    Fedify).
    
    You probably want to serialize the messages into JSON before
    storing them, so you can use [`toJsonLd()`] method that belong to
    the `Create` and `Announce` objects, and use [`fromJsonLd()`] method
    to deserialize them.

Followers
:   Followers are the data of the actors that follow the bot.  Each follower
    is represented by `Actor` object (provided by Fedify) and is associated
    with a follow ID, a URI of the `Follow` activity.

    Similar to messages, you can serialize the `Actor` object into JSON
    using the [`toJsonLd()`] method, and deserialize it using the
    [`fromJsonLd()`] method.

    > [!CAUTION]
    > The `Repository.hasFollower()` method takes the URI of an `Actor`, not
    > the follow ID.

Sent follows
:   Sent follows are the data of the follow requests that the bot has sent.
    Each sent follow is represented by a `Follow` object (provided by Fedify)
    and is associated with its own UUID.

    Similar to messages and followers, you can serialize the `Follow` object
    into JSON using the [`toJsonLd()`] method, and deserialize it using the
    [`fromJsonLd()`] method.

Followees
:   Followees are the data of the actors that the bot follows.  Each followee
    is represented by a `Follow` object (provided by Fedify) instead of `Actor`,
    and associated with an actor ID (not a follow ID).

    Similar to messages, followers, and sent follows, you can serialize
    the `Follow` object into JSON using the [`toJsonLd()`] method, and
    deserialize it using the [`fromJsonLd()`] method.

[`CryptoKeyPair`]: https://developer.mozilla.org/en-US/docs/Web/API/CryptoKeyPair
[JWK]: https://datatracker.ietf.org/doc/html/rfc7517
[`CryptoKey`]: https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey
[`toJsonLd()`]: https://fedify.dev/manual/vocab#json-ld
[`fromJsonLd()`]: https://fedify.dev/manual/vocab#json-ld
