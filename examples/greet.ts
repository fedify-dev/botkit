import { createBot, mention, text } from "@fedify/botkit";
import { DenoKvMessageQueue, DenoKvStore } from "@fedify/fedify/x/denokv";
import { configure, getConsoleSink } from "@logtape/logtape";
import { AsyncLocalStorage } from "node:async_hooks";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    { category: "botkit", lowestLevel: "info", sinks: ["console"] },
    { category: "fedify", lowestLevel: "info", sinks: ["console"] },
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console"],
    },
  ],
  contextLocalStorage: new AsyncLocalStorage(),
});

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "greetbot",
  name: "Greet Bot",
  summary: text`Hi, there! I'm a simple fediverse bot created by ${
    mention("@hongminhee@hollo.social")
  }.`,
  kv: new DenoKvStore(kv),
  queue: new DenoKvMessageQueue(kv),
  behindProxy: true,
});

bot.onMention = async (_session, message) => {
  await message.reply(text`Hi, ${message.actor}!`);
};

const session = bot.getSession(Deno.env.get("ORIGIN") ?? "http://localhost");
setInterval(async () => {
  const message = await session.publish(
    text`Hi, forks! It's a minutely greeting. It will be deleted in 30 seconds.`,
  );
  setTimeout(async () => {
    await message.delete();
  }, 1000 * 30);
}, 1000 * 60);

export default bot;

// cSpell: ignore greetbot
