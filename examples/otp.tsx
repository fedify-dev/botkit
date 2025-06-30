/** @jsx react-jsx */
/** @jsxImportSource hono/jsx */
import { createBot, isActor, Question, text } from "@fedify/botkit";
import { DenoKvMessageQueue, DenoKvStore } from "@fedify/fedify/x/denokv";
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { getXForwardedRequest } from "x-forwarded-fetch";

const kv = await Deno.openKv();

const bot = createBot<void>({
  username: "otp",
  name: "OTP Bot",
  summary:
    text`This bot provides a simple one-time passcode authentication using emojis.`,
  icon: new URL("https://botkit.fedify.dev/favicon-192x192.png"),
  kv: new DenoKvStore(kv),
  queue: new DenoKvMessageQueue(kv),
});

bot.onVote = async (_session, vote) => {
  const recipient = await kv.get<string>(["recipients", vote.message.id.href]);
  if (recipient?.value !== vote.actor.id?.href) return;
  await kv.set(["votes", vote.message.id.href, vote.option], vote.option, {
    expireIn: 15 * 60 * 1000, // 15 minutes
  });
};

const EMOJI_CODES = [
  "🌈",
  "🌟",
  "🌸",
  "🍀",
  "🍉",
  "🍦",
  "🍿",
  "🎈",
  "🎉",
  "🎨",
  "🐢",
  "🐬",
  "👻",
  "👾",
  "💎",
  "🔥",
];

function generateRandomEmojis(): readonly string[] {
  // Generate a random 16-bit number (except for zero):
  const randomBytes = new Uint8Array(2);
  while (true) {
    crypto.getRandomValues(randomBytes);
    // Regenerate if the number is zero:
    if (randomBytes[0] !== 0 || randomBytes[1] !== 0) break;
  }
  // Turn the 16-bit number into 16 emojis, e.g.,
  // 1000_1000_1001_0000 becomes ["🌟","🍉", "🎉", "🐬"]:
  const emojis: string[] = [];
  for (let i = 0; i < 16; i++) {
    // Get the i-th bit from the random number:
    const bit = (randomBytes[i >> 3] >> (7 - (i & 0b111))) & 1;
    // If the bit is 1, add the corresponding emoji to the array:
    if (bit === 1) emojis.push(EMOJI_CODES[i]);
  }
  return emojis;
}

const Layout: FC = (props) => {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>OTP bot</title>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.lime.min.css"
        />
      </head>
      <body>
        <main class="container">
          {props.children}
        </main>
      </body>
    </html>
  );
};

const Form: FC = () => {
  return (
    <Layout>
      <hgroup>
        <h1>OTP Demo using BotKit</h1>
        <p>
          This demo shows how to create a simple emoji-based one-time passcode
          authentication using <a href="https://botkit.fedify.dev/">BotKit</a>.
        </p>
      </hgroup>
      <form action="/otp" method="post">
        <fieldset>
          <label>
            Your fediverse handle
            <input
              name="handle"
              type="text"
              placeholder="@username@server.com"
              required
              inputmode="email"
              pattern="^@[^@]+@[^@]+$"
            />
          </label>
        </fieldset>
        <input type="submit" value="Authenticate" />
      </form>
    </Layout>
  );
};

const EmojiCode: FC<
  { handle: string; emojis: readonly string[]; messageId: URL }
> = (
  props,
) => {
  return (
    <Layout>
      <hgroup>
        <h1>A direct message has been sent</h1>
        <p>
          A direct message has been sent to{" "}
          <strong>{props.handle}</strong>. Please choose the emojis below to
          authenticate:
        </p>
      </hgroup>
      <ul style="padding: 0; display: flex; justify-content: center; gap: 1em; margin-top: 2em; margin-bottom: 2em;">
        {props.emojis.map((emoji) => (
          <li key={emoji} style="list-style: none; font-size: 3em;">{emoji}</li>
        ))}
      </ul>
      <form action="/authenticate" method="post">
        <input
          type="hidden"
          name="messageId"
          value={props.messageId.href}
        />
        <input type="submit" value="I chose the emojis above" />
      </form>
    </Layout>
  );
};

const Result: FC<{ authenticated: boolean }> = (props) => {
  return (
    <Layout>
      <hgroup>
        <h1>
          {props.authenticated ? "Authenticated" : "Authentication failed"}
        </h1>
        {props.authenticated
          ? <p>You have successfully authenticated!</p>
          : <p>Authentication failed. Please try again.</p>}
      </hgroup>
    </Layout>
  );
};

const app = new Hono();

app.get("/", (c) => {
  return c.html(<Form />);
});

app.post("/otp", async (c) => {
  const form = await c.req.formData();
  const handle = form.get("handle")?.toString();
  if (handle == null) return c.notFound();
  const emojis = generateRandomEmojis();
  const session = bot.getSession(c.req.url);
  const recipient = await session.context.lookupObject(handle);
  if (!isActor(recipient)) return c.notFound();
  const message = await session.publish(
    text`${recipient} Please choose the only emojis you see in the web page to authenticate:`,
    {
      visibility: "direct",
      class: Question,
      poll: {
        multiple: true,
        options: EMOJI_CODES,
        endTime: Temporal.Now.instant().add({ minutes: 15 }),
      },
    },
  );
  await kv.set(["emojis", message.id.href], emojis, {
    expireIn: 15 * 60 * 1000, // 15 minutes
  });
  await kv.set(["recipients", message.id.href], recipient.id?.href, {
    expireIn: 15 * 60 * 1000, // 15 minutes
  });
  return c.html(
    <EmojiCode handle={handle} emojis={emojis} messageId={message.id} />,
  );
});

app.post("/authenticate", async (c) => {
  const form = await c.req.formData();
  const messageId = form.get("messageId")?.toString();
  if (messageId == null) return c.notFound();
  const key = await kv.get<string>(["emojis", messageId]);
  if (key?.value == null) return c.notFound();
  const emojis = new Set(key.value);
  const answer = new Set<string>();
  for await (const entry of kv.list({ prefix: ["votes", messageId] })) {
    if (entry.key.length < 3 || typeof entry.key[2] !== "string") continue;
    answer.add(entry.key[2]);
  }
  const authenticated = answer.size === emojis.size &&
    answer.difference(emojis).size === 0;
  return c.html(<Result authenticated={authenticated} />);
});

export default {
  async fetch(request: Request): Promise<Response> {
    request = await getXForwardedRequest(request);
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/.well-known/") ||
      url.pathname.startsWith("/ap/")
    ) {
      return await bot.fetch(request);
    }
    return await app.fetch(request);
  },
};
