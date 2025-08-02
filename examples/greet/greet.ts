import {
  createBot,
  customEmoji,
  hashtag,
  Image,
  link,
  mention,
  text,
} from "@fedify/botkit";
import { DenoKvMessageQueue, DenoKvStore } from "@fedify/fedify/x/denokv";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "greetbot",
  name: "Greet Bot",
  summary: text`Hi, there! I'm a simple fediverse bot created by ${
    mention("@hongminhee@hollo.social")
  }.`,
  icon: new URL(
    "https://repository-images.githubusercontent.com/913141583/852a1091-14d5-46a0-b3bf-8d2f45ef6e7f",
  ),
  properties: {
    "Source code": link(
      "examples/greet.ts",
      "https://github.com/fedify-dev/botkit/blob/main/examples/greet.ts",
    ),
    "Powered by": link("BotKit", "https://botkit.fedify.dev/"),
  },
  kv: new DenoKvStore(kv),
  queue: new DenoKvMessageQueue(kv),
  behindProxy: true,
  pages: { color: "green" },
});

const emojis = bot.addCustomEmojis({
  botkit: {
    type: "image/png",
    file: `${import.meta.dirname}/../docs/public/favicon-192x192.png`,
  },
});

bot.onFollow = async (session, followRequest) => {
  await session.publish(
    text`Thanks for following me, ${followRequest.follower}! ${
      customEmoji(emojis.botkit)
    }`,
    {
      visibility: "direct",
      attachments: [
        new Image({
          mediaType: "image/png",
          url: new URL(
            "https://repository-images.githubusercontent.com/913141583/852a1091-14d5-46a0-b3bf-8d2f45ef6e7f",
          ),
          name: "BotKit logo",
          width: 1280,
          height: 640,
        }),
      ],
    },
  );
};

bot.onUnfollow = async (session, follower) => {
  await session.publish(
    text`Goodbye, ${follower}! ${customEmoji(emojis.botkit)}`,
    { visibility: "direct" },
  );
};

bot.onReply = async (session, message) => {
  const botUri = session.actorId.href;
  if (message.mentions.some((a) => a.id?.href === botUri)) return;
  await message.reply(
    text`Thanks for your reply, ${message.actor}! ${
      customEmoji(emojis.botkit)
    }`,
  );
};

bot.onMention = async (_session, message) => {
  await message.reply(text`Hi, ${message.actor}!`);
};

const session = bot.getSession(Deno.env.get("ORIGIN") ?? "http://localhost");
setInterval(async () => {
  const message = await session.publish(
    text`Hi, folks! It's a minutely greeting. It will be deleted in 30 seconds. ${
      customEmoji(emojis.botkit)
    } ${hashtag("greet")}`,
  );
  setTimeout(async () => {
    await message.delete();
  }, 1000 * 30);
}, 1000 * 60);

export default bot;

// cSpell: ignore greetbot
