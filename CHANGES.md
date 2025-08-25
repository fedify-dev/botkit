BotKit changelog
================

Version 0.2.4
-------------

To be released.


Version 0.2.3
-------------

Released on August 25, 2025.

 -  Upgraded Fedify to 1.4.6, which fixes a bug where ActivityPub Discovery
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

[CVE-2025-54888]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-6jcc-xgcr-q3h4


Version 0.1.1
-------------

Released on February 10, 2025.

 -  Fixed a bug where direct and followers-only messages that reply to a bot
    had been forwarded to the bot's followers.


Version 0.1.0
-------------

Initial release.  Released on February 7, 2025.
