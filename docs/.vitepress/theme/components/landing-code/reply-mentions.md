~~~~ typescript twoslash
import type { Bot } from "@fedify/botkit";
import { text } from "@fedify/botkit";

declare const bot: Bot<void>;
// ---cut-before---
bot.onMention = async (session, message) => {
  await message.reply(
    text`Current weather: 22°C ☀️`
  );
};
~~~~
