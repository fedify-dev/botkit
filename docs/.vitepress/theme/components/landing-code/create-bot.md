~~~~ typescript twoslash
import { createBot, MemoryKvStore, text } from "@fedify/botkit";
// ---cut-before---
const bot = createBot<void>({
  username: "weatherbot",
  name: "Seoul Weather Bot",
  summary: text`Daily weather for Seoul!`,
  kv: new MemoryKvStore(),
});
~~~~
