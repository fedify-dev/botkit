---
links:
  '#50': https://github.com/fedify-dev/botkit/issues/50
  '#57': https://github.com/fedify-dev/botkit/pull/57
---
 -  Added `Session.move()` to move a bot's followers to a linked actor,
    persist its `movedTo` redirect, and show its new home on the profile.
    Moved bots reject new follows and cannot publish, reply, or share new
    messages.  `Session.republishMove()` resends failed migration notifications.
    Custom repositories must now implement the required `getSuccessor()` and
    atomic, write-once `setSuccessor()` methods.  [[#50], [#57]]
