BotKit changelog
================

Version 0.4.0
-------------

To be released.

### @fedify/botkit

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

 -  Upgraded Fedify to 1.10.0.

[#10]: https://github.com/fedify-dev/botkit/issues/10
[#14]: https://github.com/fedify-dev/botkit/pull/14


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
