---
links:
  '#45': https://github.com/fedify-dev/botkit/issues/45
  '#46': https://github.com/fedify-dev/botkit/pull/46
---
 -  Fixed multi-bot instances so their instance actor is discoverable through
    WebFinger.  Servers that dereference a signature's key owner through
    WebFinger rather than by URI, such as GoToSocial, rejected every request
    the instance actor signed, so follows from those servers never completed.
    [[#45], [#46] by Les Orchard]
 -  Reserved the instance actor's name against bot usernames as well as bot
    identifiers.  `Instance.createBot()` now throws a `TypeError` for a
    username that matches the instance actor, which would otherwise have lost
    its own WebFinger mapping.  Single-bot instances have no instance actor,
    so `createBot()` is unaffected.  [[#45], [#46] by Les Orchard]
