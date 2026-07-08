~~~~ typescript twoslash
import { createInstance, MemoryKvStore } from "@fedify/botkit";

// ---cut-before---
const instance = createInstance<void>({
  kv: new MemoryKvStore(),
});

const greetBot = instance.createBot("greet", {
  username: "greetbot",
  name: "Greeting Bot",
});

const echoBot = instance.createBot("echo", {
  username: "echobot",
  name: "Echo Bot",
});

export default instance;
~~~~
