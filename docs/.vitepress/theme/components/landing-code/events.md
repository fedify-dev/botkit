~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
import { text } from "@fedify/botkit";

declare const bot: Bot<void>;
// ---cut-before---
bot.onFollow = async (session, follower) => {
  await session.publish(text`Thanks for the follow, ${follower}!`, {
    visibility: "direct",
  });
};

bot.onReact = async (session, reaction) => {
  await reaction.message.reply(text`Glad you liked it!`);
};
~~~~
