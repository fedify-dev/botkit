BotKit changelog
================

Version 0.5.1
-------------

To be released.

### @fedify/botkit

 -  Upgraded Fedify to 2.3.3, which addresses CVE-2026-62857, an SSRF
    vulnerability in NodeInfo lookups that could allow a malicious remote
    server to access non-public network resources.
    [[GHSA-hqph-j65v-8cq5]]

[GHSA-hqph-j65v-8cq5]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-hqph-j65v-8cq5


Version 0.5.0
-------------

Released on July 8, 2026.

### @fedify/botkit

 -  Redesigned the bot's web pages with a new, self-contained design language.

    The profile, post, and follower pages now use BotKit's own quiet, modern
    design instead of Pico CSS.  The look is driven by the bot's accent color,
    adapts to light and dark color schemes automatically, and foregrounds the
    bot's own identity rather than BotKit's brand.  Reposts are now clearly
    distinguished from the bot's own posts.  The full system is described in
    the new *DESIGN.md* document.

    The stylesheet and web fonts are bundled with the package and served
    locally, so the pages no longer load anything from an external CDN and
    work with no build step on either Deno or Node.js.

     -  Added the `PagesOptions.theme` option, which selects the color
        scheme (`"auto"`, `"light"`, or `"dark"`; default `"auto"`).

 -  Added support for hosting multiple bots on a single instance.
    [[#16], [#24]]

    The new `createInstance()` function creates an *instance* that owns the
    shared infrastructure (the key–value store, the message queue, the
    repository, and HTTP handling), on which multiple bots can be hosted,
    each with its own actor identity and event handlers.

     -  Added `createInstance()` function.
     -  Added `Instance` interface.
     -  Added `InstanceWithVoidContextData` interface.
     -  Added `CreateInstanceOptions` interface.
     -  Added `Instance.createBot()` method, which creates a static bot from
        an identifier and a `BotProfile`, or a dynamic `BotGroup` from
        a `BotDispatcher` function that resolves bots on demand (e.g. one
        bot per region, backed by a database).
     -  Added `BotProfile` interface.
     -  Added `BotDispatcher` type.
     -  Added `BotGroup` interface.
     -  Added `CreateBotGroupOptions` interface, whose `mapUsername` option
        resolves WebFinger usernames to dynamic bot identifiers.
     -  Added `BotEventHandlers` interface, which `Bot` and `BotGroup` both
        extend.
     -  Added `DEFAULT_INSTANCE_ACTOR_IDENTIFIER` constant.  Multi-bot
        instances expose an instance actor under a reserved identifier,
        whose key signs shared-inbox related requests; it can be overridden
        through the `CreateInstanceOptions.instanceActorIdentifier` option.
     -  Added `@fedify/botkit/instance` module.

    Activities delivered to the shared inbox are routed to the bots they are
    relevant to: the followed or unfollowed bot, the owner of the liked or
    replied-to message, mentioned bots, addressed bots, and bots following
    the author.  Multi-bot instances serve a bot list at the web root and
    each bot's pages under `/@{username}`.

    The existing `createBot()` function keeps working for single-bot
    deployments and preserves their behavior, including the web pages served
    at the root.

 -  Added support for consent-respecting quote posts using [FEP-044f].
    [[#27], [#28], [#29], [#30], [#31], [#32], [#33]]

    BotKit now serializes quote policies on outgoing messages, handles
    incoming `QuoteRequest` activities, automatically accepts or rejects them
    according to each message's policy, and stores `QuoteAuthorization` stamps
    for accepted quotes.  Applications can set a default
    `CreateBotOptions.quotePolicy`, override it per message with
    `Session.publish()` or `AuthorizedMessage.update()`, and moderate pending
    requests with the new `Bot.onQuoteRequest` event handler.

    When publishing a quote, BotKit now sets the FEP-044f `quote` property,
    sends a `QuoteRequest` to the quoted message's author, applies accepted
    `QuoteAuthorization` stamps to the stored message, and strips rejected
    quote targets from the stored message before delivering an `Update`.
    BotKit also verifies `QuoteAuthorization` stamps on received third-party
    quote posts and handles deleted stamps by forwarding the `Delete` activity
    before stripping the quote from the bot's own post.

     -  Added `QuotePolicy`, `QuotePolicyOption`, `QuoteRequest`, and
        `QuoteRequestEventHandler` types.  [[#27], [#28], [#31]]
     -  Added `Bot.onQuoteRequest` event handler.  [[#27], [#28], [#31]]
     -  Added `QuoteAcceptedEventHandler` and `QuoteRejectedEventHandler`
        types.  [[#27], [#29], [#32]]
     -  Added `Bot.onQuoteAccepted` and `Bot.onQuoteRejected` event handlers.
        [[#27], [#29], [#32]]
     -  Added `QuoteRevokedEventHandler` type and `Bot.onQuoteRevoked` event
        handler.  [[#27], [#30], [#33]]
     -  Added `ReadonlyBot.quotePolicy`, `CreateBotOptions.quotePolicy`, and
        `BotProfile.quotePolicy` properties.  [[#27], [#28], [#31]]
     -  Added `SessionPublishOptions.quotePolicy` and
        `AuthorizedMessageUpdateOptions.quotePolicy` options.
        [[#27], [#28], [#31]]
     -  Added `Message.quotePolicy` and `AuthorizedMessage.quoteApprovalState`
        properties.  [[#27], [#29], [#32]]
     -  Added `Message.quoteApproved` property for inspecting whether a
        received quote post has valid FEP-044f approval.
        [[#27], [#30], [#33]]
     -  Added `AuthorizedMessage.unauthorizeQuote()` method for revoking an
        existing quote authorization stamp by the quoted message or its URI.
        [[#27], [#28], [#31]]
     -  Added `@fedify/botkit/quote` module.  [[#27], [#28], [#31]]

 -  The `Repository` interface now stores data for multiple bot actors:
    every method takes the identifier of the owning bot actor as its first
    parameter, and data belonging to different identifiers are isolated from
    each other.  This is a breaking change for custom `Repository`
    implementations.  [[#16], [#24]]

     -  Added `identifier` parameter to all `Repository` methods.
     -  Added `Repository.findFollowedBots()` method, a reverse lookup
        answering which bots follow a given actor.
     -  Added quote authorization storage methods:
        `Repository.addQuoteAuthorization()`,
        `Repository.getQuoteAuthorization()`,
        `Repository.findQuoteAuthorization()`, and
        `Repository.removeQuoteAuthorization()`.
     -  Added quote authorization reference methods:
        `Repository.addQuoteAuthorizationReference()`,
        `Repository.findQuoteAuthorizationReference()`,
        `Repository.findQuoteAuthorizationReferenceIdentifiers()`,
        `Repository.findQuoteAuthorizationReferenceAttribution()`, and
        `Repository.removeQuoteAuthorizationReference()`.
        [[#27], [#29], [#30], [#32], [#33]]
     -  Added optional `Repository.migrate()` method for adopting data
        stored by BotKit 0.4 or earlier.
     -  Added `Repository.forIdentifier()` method and `ActorScopedRepository`
        class, a view of a repository bound to a single bot actor.
     -  `KvRepository` now stores data under bot-scoped keys.  Its second
        constructor parameter is now a `KvRepositoryOptions` object with
        a single `prefix` option, replacing the removed
        `KvStoreRepositoryPrefixes` interface.
     -  `createBot()` migrates data stored by BotKit 0.4 or earlier to the
        bot-scoped layout on startup.

 -  Local object URIs now carry the identifier of the owning bot actor,
    e.g. `/ap/actor/{identifier}/note/{id}` instead of `/ap/note/{id}`.
    URIs in the old format are still recognized in incoming activities and
    are permanently redirected to their canonical URIs when dereferenced,
    so links stored by remote servers keep working after an upgrade.
    [[#16], [#24]]

 -  The `Session.bot` property is now typed as `ReadonlyBot`, a read-only
    view of the bot's identity and profile, instead of `Bot`.  This is
    a breaking change for code that reached the full `Bot` through
    a session; such code should hold on to the `Bot` returned by
    `createBot()` instead.  [[#16], [#24]]

     -  Added `ReadonlyBot` interface.

 -  Fixed the npm package's TypeScript declaration files so runtime Temporal
    polyfill code is no longer emitted into _\*.d.ts_ files.

 -  Added a Cloudflare Workers deployment guide and updated the documentation
    landing page to list Cloudflare Workers as a deployment target.

 -  Upgraded Fedify to 2.3.1, Hono to 4.12.27, and LogTape to 2.2.3.

[FEP-044f]: https://w3id.org/fep/044f
[#16]: https://github.com/fedify-dev/botkit/issues/16
[#24]: https://github.com/fedify-dev/botkit/pull/24
[#27]: https://github.com/fedify-dev/botkit/issues/27
[#28]: https://github.com/fedify-dev/botkit/issues/28
[#29]: https://github.com/fedify-dev/botkit/issues/29
[#30]: https://github.com/fedify-dev/botkit/issues/30
[#31]: https://github.com/fedify-dev/botkit/pull/31
[#32]: https://github.com/fedify-dev/botkit/pull/32
[#33]: https://github.com/fedify-dev/botkit/pull/33

### @fedify/botkit-sqlite

 -  Added a `quote_authorizations` table for [FEP-044f] quote authorization
    stamps.  [[#27], [#28], [#31]]

 -  Added a `quote_authorization_refs` table for received [FEP-044f] quote
    authorization stamps that have been applied to local quote posts.
    [[#27], [#29], [#32]]

 -  All tables now have a `bot_id` column and composite primary keys, so
    a single database stores the data of multiple bots.  Opening a database
    created by version 0.4 or earlier rebuilds the affected tables in place,
    and `SqliteRepository.migrate()` assigns the carried-over rows to a bot
    actor identifier; `createBot()` calls it automatically on startup.
    [[#16], [#24]]

### @fedify/botkit-postgres

 -  Added a `quote_authorizations` table for [FEP-044f] quote authorization
    stamps.  [[#27], [#28], [#31]]

 -  Added a `quote_authorization_refs` table for received [FEP-044f] quote
    authorization stamps that have been applied to local quote posts.
    [[#27], [#29], [#32]]

 -  All tables now have a `bot_id` column and composite primary keys, so
    a single schema stores the data of multiple bots.  Initializing a schema
    created by version 0.4 upgrades it in place, and
    `PostgresRepository.migrate()` assigns the carried-over rows to a bot
    actor identifier; `createBot()` calls it automatically on startup.
    [[#16], [#24]]

 -  Upgraded Postgres.js to 3.4.9.

### @fedify/botkit-redis

 -  Added the new *@fedify/botkit-redis* package, which provides
    `RedisRepository`, a Redis-backed implementation of BotKit's
    `Repository` interface for bots running on Deno or Node.js.  It supports
    URL-managed and caller-managed Redis clients, configurable key prefixes,
    bot-scoped storage, quote authorization storage, reverse lookups, and
    poll votes.  [[#12], [#35]]

[#12]: https://github.com/fedify-dev/botkit/issues/12
[#35]: https://github.com/fedify-dev/botkit/pull/35


Version 0.4.5
-------------

Released on July 19, 2026.

### @fedify/botkit

 -  Upgraded Fedify to 2.1.19, which fixes an SSRF vulnerability in NodeInfo
    lookups that could allow a malicious remote server to access non-public
    network resources.  [[CVE-2026-62857]]

[CVE-2026-62857]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-hqph-j65v-8cq5


Version 0.4.4
-------------

Released on July 6, 2026.

### @fedify/botkit

 -  Fixed `MemoryRepository`, `KvRepository`, and `MemoryCachedRepository` so
    removing one of multiple active follow requests for the same actor no
    longer deletes the follower too early or fires a premature unfollow event,
    and reassigning a follow request no longer leaves stale followers behind.
    [[#25], [#26]]

[#25]: https://github.com/fedify-dev/botkit/issues/25
[#26]: https://github.com/fedify-dev/botkit/pull/26

### @fedify/botkit-sqlite

 -  Fixed `SqliteRepository` so removing one of multiple active follow requests
    for the same actor no longer fails with a foreign key error, and reassigning
    a follow request no longer leaves stale followers behind.  [[#25], [#26]]

### @fedify/botkit-postgres

 -  Fixed `PostgresRepository` so removing one of multiple active follow
    requests for the same actor no longer reports a follower removal until the
    last active follow request is removed.  [[#25], [#26]]


Version 0.4.3
-------------

Released on June 4, 2026.

 -  Upgraded Fedify to 2.1.15, which fixes an SSRF protection bypass
    vulnerability.  [[CVE-2026-50131]]

[CVE-2026-50131]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-xw9q-2mv6-9fr8


Version 0.4.2
-------------

Released on May 21, 2026.

### @fedify/botkit

 -  Upgraded Fedify to 2.1.14 to fix a security vulnerability in Linked Data
    Signature verification that could allow certain signed activities to be
    interpreted differently than intended.  [[CVE-2026-42462]]

[CVE-2026-42462]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-9rfg-v8g9-9367


Version 0.4.1
-------------

Released on May 12, 2026.

### @fedify/botkit

 -  Upgraded Fedify to 2.1.12, which addresses a private network protection
    bypass vulnerability.  This vulnerability allowed certain IPv4-mapped IPv6
    literals (e.g., `http://[::ffff:127.0.0.1]/`) to bypass SSRF (Server-Side
    Request Forgery) protection, potentially allowing attackers to access
    internal network resources.


Version 0.4.0
-------------

Released on March 30, 2026.

### @fedify/botkit

 -  Upgraded Fedify to 2.1.2.

     -  BotKit now targets Fedify 2.0's modular package layout, using
        *@fedify/vocab*, *@fedify/vocab-runtime*, and *@fedify/denokv*
        where appropriate.
     -  `Message.language` and `SessionPublishOptions.language` now use
        `Intl.Locale` instead of `LanguageTag`.
     -  Bot software versions now use plain strings instead of `SemVer`
        objects.
     -  Removed the `parseSemVer()`, `SemVer`, `LanguageTag`, and
        `parseLanguageTag()` public exports.

 -  BotKit now acknowledges unverified remote `Delete` activities signed by
    permanently gone actors with `202 Accepted` instead of `401 Unauthorized`.

     -  This applies only when Fedify reports a `keyFetchError` and the
        remote actor's key fetch returned `410 Gone`.
     -  The unverified activity is not passed to BotKit event handlers, but
        the successful response stops repeated redelivery attempts from the
        remote server.

 -  Added FEP-5711 inverse properties to the bot actor's `outbox` and
    `followers` collections.

 -  Added a remote follow button to the web interface.
    [[#10], [#14] by Hyeonseo Kim]

     -  Added a Follow button on the bot's profile page that allows users to
        follow the bot from their own fediverse instance without manual
        searching.
     -  When clicked, the button opens a modal dialog where users can enter
        their fediverse handle (e.g., `@username@instance.com`).
     -  The feature uses WebFinger to discover the user's instance and
        automatically redirects to the appropriate follow page using the OStatus
        subscribe protocol.

 -  Added `Session.republishProfile()` to broadcast profile changes to
    followers.  [[#18]]

     -  The new method sends an ActivityPub `Update` activity for the bot
        actor to the bot's followers.
     -  This makes profile updates such as display name, bio, avatar, and
        header image propagate without waiting for the next post.

[#10]: https://github.com/fedify-dev/botkit/issues/10
[#14]: https://github.com/fedify-dev/botkit/pull/14
[#18]: https://github.com/fedify-dev/botkit/issues/18

### @fedify/botkit-postgres

 -  Added a new PostgreSQL repository package, *`@fedify/botkit-postgres`*,
    which provides `PostgresRepository`, `PostgresRepositoryOptions`, and
    `initializePostgresRepositorySchema()`.  [[#11], [#19]]

[#11]: https://github.com/fedify-dev/botkit/issues/11
[#19]: https://github.com/fedify-dev/botkit/pull/19


Version 0.3.4
-------------

Released on June 4, 2026.

 -  Upgraded Fedify to 1.9.12, which fixes an SSRF protection bypass
    vulnerability.  [[CVE-2026-50131]]


Version 0.3.3
-------------

Released on May 21, 2026.

 -  Upgraded Fedify to 1.9.11 to fix a security vulnerability in Linked Data
    Signature verification that could allow certain signed activities to be
    interpreted differently than intended.  [[CVE-2026-42462]]


Version 0.3.2
-------------

Released on May 12, 2026.

 -  Upgraded Fedify to 1.9.10, which addresses a private network protection
    bypass vulnerability.  This vulnerability allowed certain IPv4-mapped IPv6
    literals (e.g., `http://[::ffff:127.0.0.1]/`) to bypass SSRF (Server-Side
    Request Forgery) protection, potentially allowing attackers to access
    internal network resources.


Version 0.3.1
-------------

Released on December 20, 2025.

 -  Upgraded Fedify to 1.8.15, which includes a critical security
    fix [CVE-2025-68475] that addresses a ReDoS (Regular Expression Denial
    of Service) vulnerability in HTML parsing.  [[CVE-2025-68475]]

[CVE-2025-68475]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-rchf-xwx2-hm93


Version 0.3.0
-------------

Released on August 28, 2025.

 -  BotKit now supports Node.js alongside of Deno.  The minimum required
    version of Node.js is 22.0.0.

### @fedify/botkit

 -  BotKit now supports publishing polls.  [[#7], [#8]]

     -  Added `Poll` interface.
     -  Added `Vote` interface.
     -  Added an overload of the `Session.publish()` method that accepts
        `SessionPublishOptionsWithQuestion` as the second argument.
     -  Added `SessionPublishOptionsWithQuestion` interface.
     -  Added `Bot.onVote` event.
     -  Added `VoteEventHandler` type.
     -  Added `KvStoreRepositoryPrefixes.polls` option.

 -  Added `@fedify/botkit/repository` module that provides repository
    implementations for BotKit.

     -  Added `RepositoryGetMessagesOptions` interface.
     -  Added `RepositoryGetFollowersOptions` interface.
     -  Added `Uuid` type.
     -  Added `KvKey` type.
     -  Added `KvStore` type.
     -  Added `KvStoreRepositoryPrefixes` interface.
     -  Added `Announce` class.
     -  Added `Create` class.
     -  Added `MemoryCachedRepository` class.

 -  Added web frontend followers page.  [[#2], [#13] by Hyeonseo Kim]

     -  Added `/followers` route that displays a list of bot followers.
     -  Made follower count on the main page clickable, linking to `/followers`.

 -  Upgraded Fedify to 1.8.8.

[#2]: https://github.com/fedify-dev/botkit/issues/2
[#7]: https://github.com/fedify-dev/botkit/issues/7
[#8]: https://github.com/fedify-dev/botkit/pull/8
[#13]: https://github.com/fedify-dev/botkit/pull/13

### @fedify/botkit-sqlite

 -  Added `SqliteRepository` class that implements a SQLite-based repository
    for BotKit.
 -  Added `SqliteRepositoryOptions` interface.


Version 0.2.4
-------------

Released on August 26, 2025.

 -  Upgraded Fedifyh to 1.5.7 which fixes a bug where HTTP Signature
    verification failed for requests having `created` or `expires` fields
    in their `Signature` header, causing `500 Internal Server Error` responses
    in inbox handlers.


Version 0.2.3
-------------

Released on August 25, 2025.

 -  Upgraded Fedify to 1.5.6, which fixes a bug where ActivityPub Discovery
    failed to recognize XHTML self-closing `<link>` tags.  The HTML/XHTML parser
    now correctly handles whitespace before the self-closing slash (`/>`),
    improving compatibility with XHTML documents that follow the self-closing
    tag format.


Version 0.2.2
-------------

Released on August 8, 2025.

 -  Upgrade Fedify to 1.5.5, which includes a critical security
    fix [CVE-2025-54888] that addresses an authentication bypass
    vulnerability allowing actor impersonation.  [[CVE-2025-54888]]

[CVE-2025-54888]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-6jcc-xgcr-q3h4


Version 0.2.1
-------------

Released on July 8, 2025.

 -  Fixed a bug where messages from `Session.getOutbox()` didn't have `update()`
    and `delete()` methods.  [[#9]]

[#9]: https://github.com/fedify-dev/botkit/issues/9


Version 0.2.0
-------------

Released on April 21, 2025.

 -  Image attachments in posts became shown in the web interface.

 -  Added custom emoji support.

     -  The return type of `Text.getTags()` method became
        `AsyncIterable<Link | Object>` (was `AsyncIterable<Link>`).
     -  Added `Bot.addCustomEmojis()` method.
     -  Added `CustomEmojiText` class.
     -  Added `customEmoji()` function.
     -  Added `CustomEmojiBase` interface.
     -  Added `CustomEmojiFromUrl` interface.
     -  Added `CustomEmojiFromFile` interface.
     -  Added `CustomEmoji` type.
     -  Added `DeferredCustomEmoji` type.
     -  The `text` tagged template literal function now accepts `Emoji` objects
        (provided by Fedify).

 -  Added emoji reaction support.

     -  Added `Emoji` type.
     -  Added `isEmoji()` predicate function.
     -  Added `emoji()` tagged template literal function.
     -  Added `Message.react()` method.
     -  Added `Reaction` interface.
     -  Added `AuthorizedReaction` interface.
     -  Added `Bot.onReact` event.
     -  Added `Bot.onUnreact` event.
     -  Added `ReactionEventHandler` type.
     -  Added `UndoneReactionEventHandler` type.

 -  Added quote support.

     -  Added `SessionPublishOptions.quoteTarget` option.
     -  Added `Message.quoteTarget` property.
     -  Added `Bot.onQuote` event.
     -  Added `QuoteEventHandler` type.

 -  Added `SessionGetOutboxOptions` interface.

 -  Activities are more precisely propagated.

     -  The `Message.reply()` method now sends the `Create` activity to
        the author of the original message as well.
     -  The `Message.share()` method now sends the `Announce` activity to
        the author of the original message as well.
     -  The `AuthorizedSharedMessage.unshare()` method now sends the `Undo`
        activity to the author of the original message as well.
     -  The `AuthorizedMessage.update()` method now sends the `Update` activity
        to the author of the original message as well if it is a reply.
     -  The `AuthorizedMessage.delete()` method now sends the `Delete` activity
        to the author of the original message as well if it is a reply.


Version 0.1.4
-------------

Released on August 26, 2025.

 -  Upgraded Fedifyh to 1.4.15 which fixes a bug where HTTP Signature
    verification failed for requests having `created` or `expires` fields
    in their `Signature` header, causing `500 Internal Server Error` responses
    in inbox handlers.


Version 0.1.3
-------------

Released on August 25, 2025.

 -  Upgraded Fedify to 1.4.14, which fixes a bug where ActivityPub Discovery
    failed to recognize XHTML self-closing `<link>` tags.  The HTML/XHTML parser
    now correctly handles whitespace before the self-closing slash (`/>`),
    improving compatibility with XHTML documents that follow the self-closing
    tag format.


Version 0.1.2
-------------

Released on August 8, 2025.

 -  Upgraded Fedify to 1.4.13, which includes a critical security
    fix [CVE-2025-54888] that addresses an authentication bypass
    vulnerability allowing actor impersonation.  [[CVE-2025-54888]]


Version 0.1.1
-------------

Released on February 10, 2025.

 -  Fixed a bug where direct and followers-only messages that reply to a bot
    had been forwarded to the bot's followers.


Version 0.1.0
-------------

Initial release.  Released on February 7, 2025.
