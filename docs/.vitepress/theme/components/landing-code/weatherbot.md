~~~~ typescript twoslash
import { createBot, MemoryKvStore, text } from "@fedify/botkit";

const bot = createBot<void>({
  username: "weatherbot",
  name: "Seoul Weather Bot",
  summary: text`I post daily weather updates for Seoul!`,
  kv: new MemoryKvStore(),
});

// Reply when someone mentions the bot
bot.onMention = async (session, message) => {
  await message.reply(text`It's 18°C with clear skies in Seoul.`);
};

// Publish on a schedule
setInterval(async () => {
  const session = bot.getSession("https://weather.example.com");
  await session.publish(text`Good morning! Today: 22°C, clear skies ☀️`);
}, 1000 * 60 * 60 * 24);
~~~~
