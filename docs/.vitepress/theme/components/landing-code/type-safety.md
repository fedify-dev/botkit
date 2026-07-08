~~~~ typescript twoslash
import { createBot, MemoryKvStore, text } from "@fedify/botkit";

// @errors: 2345
interface AppContext {
  readonly tenantName: string;
}

const bot = createBot<AppContext>({
  username: "support",
  kv: new MemoryKvStore(),
});

// ---cut-before---
bot.onMention = async (session, message) => {
  const tenantName = session.context.data.tenantName;

  session.
//        ^|
  // ---cut-start---
    publish;
  // ---cut-end---













  await message.reply(text`Welcome to ${tenantName}!`);

  await session.publish("Welcome!");
};
~~~~
