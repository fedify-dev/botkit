~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
import { text } from "@fedify/botkit";

declare const bot: Bot<void>;
// ---cut-before---
bot.onFollow = async (session, follower) => {
  await session.publish(
    text`Welcome, ${follower}!`,
    { visibility: "direct" },
  );
};
~~~~
