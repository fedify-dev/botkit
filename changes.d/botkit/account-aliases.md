---
links:
  '#48': https://github.com/fedify-dev/botkit/issues/48
  '#55': https://github.com/fedify-dev/botkit/pull/55
---
 -  Added an `aliases` option to `CreateBotOptions` and `BotProfile` so
    existing accounts can move their followers to a BotKit bot.  Actor URIs
    listed in the option are published as `alsoKnownAs`, and are available
    through `Bot.aliases` and `Session.bot.aliases`.  [[#48], [#55]]
