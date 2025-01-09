---
description: >-
  The Session object is a short-lived object that actively communicates with
  the fediverse.  Learn how to create a session and publish messages to the
  fediverse.
---

Session
=======

The `Session` object is a short-lived object that actively communicates with
the fediverse.  It can be [created by yourself](#creating-a-session),
or you can get it when an event handler is called.


Creating a session
------------------

You can create a session by calling the `Bot.getSession()` method:

~~~~ typescript
const session = bot.getSession("https://mydomain");
~~~~

It takes a single argument, the origin of the server to which your bot belongs.
In practice, you would have an environment variable that contains the hostname
of your server, and you would pass it to the `~Bot.getSession()` method:

~~~~ typescript
const SERVER_NAME = Deno.env.get("SERVER_NAME");
if (SERVER_NAME == null) {
  console.error("The SERVER_NAME environment variable is not set.");
  Deno.exit(1);
}

const session = bot.getSession(`https://${SERVER_NAME}`);  // [!code highlight]
~~~~


Getting a session from an event handler
---------------------------------------

When an event handler is called, you can get a session from the `Session`
object that is passed as the first argument:

~~~~ typescript
bot.onMention = async (session, message) => {
  // `session` is a `Session` object
};
~~~~

To learn more about event handlers, see the [*Events* section](./events.md).
