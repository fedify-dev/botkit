BotKit changelog
================

Version 0.2.0
-------------

To be released.

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


Version 0.1.1
-------------

Released on February 10, 2025.

 -  Fixed a bug where direct and followers-only messages that reply to a bot
    had been forwarded to the bot's followers.


Version 0.1.0
-------------

Initial release.  Released on February 7, 2025.
