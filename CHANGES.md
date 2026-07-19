BotKit changelog
================

Version 0.4.5
-------------

To be released.

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
