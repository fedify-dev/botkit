import {
  createInstance,
  text,
} from "@fedify/botkit";
import { DenoKvMessageQueue, DenoKvStore } from "@fedify/denokv";

const kv = await Deno.openKv();

const instance = createInstance<void>({
  kv: new DenoKvStore(kv),
  queue: new DenoKvMessageQueue(kv),
  behindProxy: true,
  pages: { color: "blue" },
});

const greetBot = instance.createBot("greet", {
  username: "greetbot",
  name: "Greet Bot",
  summary:
    text`A simple greeting bot that replies to mentions, hosted on a multi-bot instance.`,
  icon: new URL("https://botkit.fedify.dev/favicon-192x192.png"),
});

greetBot.onFollow = async (session, followRequest) => {
  await session.publish(
    text`Thanks for following me, ${followRequest.follower}!`,
    { visibility: "direct" },
  );
};

greetBot.onMention = async (session, message) => {
  await message.reply(
    text`Hello, ${message.actor}! Have a great day!`,
  );
};

const echoBot = instance.createBot("echo", {
  username: "echobot",
  name: "Echo Bot",
  summary:
    text`An echo bot that repeats what you say, hosted on a multi-bot instance.`,
  icon: new URL("https://botkit.fedify.dev/favicon-192x192.png"),
});

echoBot.onMention = async (session, message) => {
  if (message.replyTarget != null) return;
  await message.reply(
    text`You said: ${message.text}`,
  );
};

export default instance;
