<script setup lang="ts">
import { ref } from "vue";

const managers = [
  { id: "deno", label: "Deno", cmd: "deno add jsr:@fedify/botkit" },
  { id: "npm", label: "npm", cmd: "npm add @fedify/botkit" },
  { id: "pnpm", label: "pnpm", cmd: "pnpm add @fedify/botkit" },
  { id: "yarn", label: "Yarn", cmd: "yarn add @fedify/botkit" },
];
const active = ref(managers[0].id);
const copied = ref(false);

function current() {
  return managers.find((m) => m.id === active.value) ?? managers[0];
}

async function copyCmd() {
  try {
    await navigator.clipboard.writeText(current().cmd);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1400);
  } catch {
    /* clipboard unavailable */
  }
}

const capabilities = [
  {
    title: "Type‑safe API",
    body:
      "Written in TypeScript end to end: autocomplete, compile‑time checks, " +
      "and typed builders for every message you send.",
  },
  {
    title: "Follower policy",
    body:
      "Approve every follower automatically, or review each follow request " +
      "yourself before accepting.",
  },
  {
    title: "Deno and Node.js",
    body:
      "Runs on both with minimal dependencies. A whole bot fits in a single " +
      "TypeScript file.",
  },
];

const repos = [
  { name: "KvRepository", href: "/concepts/repository#kvrepository" },
  { name: "SqliteRepository", href: "/concepts/repository#sqliterepository" },
  { name: "RedisRepository", href: "/concepts/repository#redisrepository" },
  { name: "PostgresRepository", href: "/concepts/repository#postgresrepository" },
];
const targets = [
  { name: "Deno Deploy", href: "/deploy/deno-deploy" },
  { name: "Docker · Fly.io / Railway", href: "/deploy/docker" },
  { name: "Self‑hosted", href: "/deploy/self-hosting" },
];
</script>

<template>
  <div class="bk">
    <!-- ─────────────────────────  HERO  ───────────────────────── -->
    <section class="bk-hero">
      <div class="bk-hero__grid">
        <div class="bk-hero__text">
          <p class="bk-eyebrow">
            <span class="bk-gate" aria-hidden="true"></span>
            A Fedify project · built by the Fedify team
          </p>
          <h1 class="bk-title">
            Fediverse bots,<br />as standalone servers.
          </h1>
          <p class="bk-lede">
            BotKit is a TypeScript framework for standalone ActivityPub bots.
            No Mastodon account and no 500‑character limit: your bot runs as a
            complete fediverse server, and it fits in a single file.
          </p>

          <div class="bk-cta">
            <a class="bk-btn bk-btn--brand" href="/start">Get started →</a>
            <a class="bk-btn bk-btn--ghost" href="/intro">What is BotKit?</a>
          </div>

          <div class="bk-install">
            <div class="bk-install__tabs" role="tablist">
              <button
                v-for="m in managers"
                :key="m.id"
                class="bk-install__tab"
                :class="{ 'is-active': active === m.id }"
                role="tab"
                :aria-selected="active === m.id"
                @click="active = m.id"
              >
                {{ m.label }}
              </button>
            </div>
            <div class="bk-install__cmd">
              <code>{{ current().cmd }}</code>
              <button
                class="bk-install__copy"
                :aria-label="copied ? 'Copied' : 'Copy command'"
                @click="copyCmd"
              >
                {{ copied ? "Copied" : "Copy" }}
              </button>
            </div>
          </div>
        </div>

        <!-- The mark: a dinosaur presented as a model kit on its runner.
             The logo already carries the kit frame, so it sits on a plain
             tinted stage rather than a second frame. -->
        <div class="bk-hero__kit">
          <div class="bk-kit">
            <img
              class="bk-kit__art"
              src="/logo.svg"
              alt="The BotKit dinosaur, held on its model-kit runner"
              width="360"
              height="292"
            />
          </div>
          <p class="bk-kit__cap">No.&thinsp;01 · some assembly required</p>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  ONE FILE  ──────────────────── -->
    <section class="bk-section">
      <div class="bk-section__head">
        <h2 class="bk-h2">A complete bot in one file</h2>
        <p class="bk-sub">
          Create the bot, answer events, and publish. This is the whole thing,
          with no accounts to register and no platform to ask permission from.
        </p>
      </div>

      <div class="bk-code-grid">
        <div class="bk-window">
          <div class="bk-window__bar">
            <span class="bk-dot"></span><span class="bk-dot"></span
            ><span class="bk-dot"></span>
            <span class="bk-window__name">weatherbot.ts</span>
          </div>
          <pre class="bk-code"><code><span class="k">import</span> { createBot, MemoryKvStore, text } <span class="k">from</span> <span class="s">"@fedify/botkit"</span>;

<span class="k">const</span> bot = <span class="fn">createBot</span>&lt;<span class="t">void</span>&gt;({
  username: <span class="s">"weatherbot"</span>,
  name: <span class="s">"Seoul Weather Bot"</span>,
  summary: <span class="fn">text</span><span class="s">`I post daily weather updates for Seoul!`</span>,
  kv: <span class="k">new</span> <span class="fn">MemoryKvStore</span>(),
});

<span class="c">// Reply when someone mentions the bot</span>
bot.onMention = <span class="k">async</span> (session, message) =&gt; {
  <span class="k">await</span> message.<span class="fn">reply</span>(<span class="fn">text</span><span class="s">`It's 18°C with clear skies in Seoul.`</span>);
};

<span class="c">// Publish on a schedule</span>
<span class="fn">setInterval</span>(<span class="k">async</span> () =&gt; {
  <span class="k">const</span> session = bot.<span class="fn">getSession</span>(<span class="s">"https://weather.example.com"</span>);
  <span class="k">await</span> session.<span class="fn">publish</span>(<span class="fn">text</span><span class="s">`Good morning! Today: 22°C, clear skies ☀️`</span>);
}, <span class="n">1000</span> * <span class="n">60</span> * <span class="n">60</span> * <span class="n">24</span>);</code></pre>
        </div>

        <ul class="bk-notes">
          <li>
            <a class="bk-notes__k" href="/concepts/bot#instantiation"
              >createBot()</a
            >
            gives the bot an identity and storage. That is the entire setup.
          </li>
          <li>
            <a class="bk-notes__k" href="/concepts/events#mention">onMention</a>
            and its siblings are just async functions you assign.
          </li>
          <li>
            <a class="bk-notes__k" href="/concepts/text">text`…`</a>
            builds safe, formatted content: mentions, hashtags, and links
            included.
          </li>
        </ul>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  STANDALONE  ──────────────────── -->
    <section class="bk-feature">
      <div class="bk-feature__grid">
        <div class="bk-feature__text">
          <p class="bk-kicker">Standalone</p>
          <h2 class="bk-h2">Its own server, not an account</h2>
          <p class="bk-feature__body">
            Each BotKit bot is a complete ActivityPub server, with its own
            actor, inbox, and outbox. There's no Mastodon or Misskey account to
            create or maintain, message length is yours to define, and you keep
            direct control over the database and message queue. It still
            federates with Mastodon, Misskey, and the rest of the fediverse.
          </p>
          <a class="bk-link" href="/intro">More on standalone bots →</a>
        </div>
        <div class="bk-feature__visual">
          <div class="bk-spec">
            <div class="bk-spec__head">Bot · spec sheet</div>
            <div class="bk-spec__row">
              <span class="bk-spec__k">Actor</span>
              <span class="bk-spec__v">@weatherbot@example.com</span>
            </div>
            <div class="bk-spec__row">
              <span class="bk-spec__k">Server</span>
              <span class="bk-spec__v">standalone ActivityPub</span>
            </div>
            <div class="bk-spec__row">
              <span class="bk-spec__k">Post length</span>
              <span class="bk-spec__v">yours to define</span>
            </div>
            <div class="bk-spec__row">
              <span class="bk-spec__k">Storage</span>
              <span class="bk-spec__v">Repository, your backend</span>
            </div>
            <div class="bk-spec__row">
              <span class="bk-spec__k">Federates</span>
              <span class="bk-spec__v">Mastodon · Misskey · …</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  RICH MESSAGES  ──────────────────── -->
    <section class="bk-feature bk-feature--reverse">
      <div class="bk-feature__grid">
        <div class="bk-feature__text">
          <p class="bk-kicker">Messages</p>
          <h2 class="bk-h2">Rich messages, safely composed</h2>
          <p class="bk-feature__body">
            Write posts with the
            <a href="/concepts/text#template-string-tag"><code>text`…`</code></a>
            template. It escapes HTML for you and understands
            <a href="/concepts/text#mentions">mentions</a>,
            <a href="/concepts/text#hashtags">hashtags</a>,
            <a href="/concepts/text#links">links</a>, and
            <a href="/concepts/text#custom-emojis">custom emoji</a>.
            <a href="/concepts/message#attaching-media">Attach images</a>,
            <a href="/concepts/message#polls">open polls</a>,
            <a href="/concepts/events#emoji-reaction">collect emoji reactions</a>,
            and allow <a href="/concepts/message#quoting">quote posts</a> with
            <a href="/concepts/message#quote-policy">consent</a>
            (<a href="https://w3id.org/fep/044f">FEP‑044f</a>). Choose each
            post's <a href="/concepts/message#visibility">visibility</a>, then
            <a href="/concepts/message#updating-a-message">edit</a> or
            <a href="/concepts/message#deleting-a-message">delete</a> it later.
          </p>
          <a class="bk-link" href="/concepts/message">Read about messages →</a>
        </div>
        <div class="bk-feature__visual">
          <div class="bk-window">
            <div class="bk-window__bar">
              <span class="bk-dot"></span><span class="bk-dot"></span
              ><span class="bk-dot"></span>
              <span class="bk-window__name">post.ts</span>
            </div>
            <pre class="bk-code"><code><span class="k">await</span> session.<span class="fn">publish</span>(
  <span class="fn">text</span><span class="s">`New chart is up! ${</span><span class="fn">hashtag</span>(<span class="s">"BotKit"</span>)<span class="s">}`</span>,
  {
    attachments: [<span class="k">new</span> <span class="t">Image</span>({ url, mediaType: <span class="s">"image/png"</span> })],
    visibility: <span class="s">"public"</span>,
  },
);</code></pre>
          </div>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  EVENTS  ──────────────────── -->
    <section class="bk-feature">
      <div class="bk-feature__grid">
        <div class="bk-feature__text">
          <p class="bk-kicker">Events</p>
          <h2 class="bk-h2">Answer what happens</h2>
          <p class="bk-feature__body">
            Assign an async function to respond to activity:
            <a href="/concepts/events#mention">mentions</a>,
            <a href="/concepts/events#reply">replies</a>,
            <a href="/concepts/events#follow">follows</a> and
            <a href="/concepts/events#unfollow">unfollows</a>,
            <a href="/concepts/events#quote">quotes</a>,
            <a href="/concepts/events#vote">poll votes</a>, and
            <a href="/concepts/events#emoji-reaction">emoji reactions</a>. Every
            handler receives a <a href="/concepts/session">session</a>, so it can
            <a href="/concepts/message#publishing-a-message">publish</a>,
            <a href="/concepts/message#replying-to-a-message">reply</a>, or
            <a href="/concepts/message#reacting-to-a-message-with-an-emoji"
              >react</a
            >
            in return.
          </p>
          <a class="bk-link" href="/concepts/events">See all events →</a>
        </div>
        <div class="bk-feature__visual">
          <div class="bk-window">
            <div class="bk-window__bar">
              <span class="bk-dot"></span><span class="bk-dot"></span
              ><span class="bk-dot"></span>
              <span class="bk-window__name">handlers.ts</span>
            </div>
            <pre class="bk-code"><code>bot.onFollow = <span class="k">async</span> (session, follower) =&gt; {
  <span class="k">await</span> session.<span class="fn">publish</span>(<span class="fn">text</span><span class="s">`Thanks for the follow, ${follower}!`</span>, {
    visibility: <span class="s">"direct"</span>,
  });
};

bot.onReact = <span class="k">async</span> (session, reaction) =&gt; {
  <span class="k">await</span> reaction.message.<span class="fn">reply</span>(<span class="fn">text</span><span class="s">`Glad you liked it!`</span>);
};</code></pre>
          </div>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  INSTANCE  ──────────────────── -->
    <section class="bk-feature bk-feature--reverse">
      <div class="bk-feature__grid">
        <div class="bk-feature__text">
          <p class="bk-kicker">Instance</p>
          <h2 class="bk-h2">Many bots, one server</h2>
          <p class="bk-feature__body">
            Need more than one bot?
            <a href="/concepts/instance#creating-an-instance"
              ><code>createInstance()</code></a
            >
            owns the shared infrastructure (the key‑value store, queue,
            repository, and HTTP handling), and each bot on it keeps its own
            actor, handle, and event handlers. Declare
            <a href="/concepts/instance#static-bots">static bots</a> up front, or
            resolve a whole family of
            <a href="/concepts/instance#dynamic-bots">bots from a database</a> on
            demand.
          </p>
          <a class="bk-link" href="/concepts/instance">Read about instances →</a>
        </div>
        <div class="bk-feature__visual">
          <div class="bk-window">
            <div class="bk-window__bar">
              <span class="bk-dot"></span><span class="bk-dot"></span
              ><span class="bk-dot"></span>
              <span class="bk-window__name">instance.ts</span>
            </div>
            <pre class="bk-code"><code><span class="k">const</span> instance = <span class="fn">createInstance</span>&lt;<span class="t">void</span>&gt;({ kv: <span class="k">new</span> <span class="fn">MemoryKvStore</span>() });

<span class="k">const</span> greetBot = instance.<span class="fn">createBot</span>(<span class="s">"greet"</span>, {
  username: <span class="s">"greetbot"</span>,
  name: <span class="s">"Greeting Bot"</span>,
});

<span class="k">const</span> echoBot = instance.<span class="fn">createBot</span>(<span class="s">"echo"</span>, {
  username: <span class="s">"echobot"</span>,
  name: <span class="s">"Echo Bot"</span>,
});

<span class="k">export default</span> instance;</code></pre>
          </div>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  WEB PAGES  ──────────────────── -->
    <section class="bk-feature">
      <div class="bk-feature__grid">
        <div class="bk-feature__text">
          <p class="bk-kicker">Web</p>
          <h2 class="bk-h2">A web presence, out of the box</h2>
          <p class="bk-feature__body">
            BotKit serves each bot's own
            <a href="/concepts/instance#web-pages">pages</a>: a profile,
            individual posts, the follower list, hashtag pages, and an Atom feed.
            They render in the bot's accent color, adapt to light and dark, and
            you can restyle them with the
            <a href="/concepts/bot#createbotoptions-pages"
              >color, theme, and css</a
            >
            options. Nothing extra to deploy.
          </p>
          <a class="bk-link" href="/concepts/instance#web-pages"
            >More on web pages →</a
          >
        </div>
        <div class="bk-feature__visual">
          <div class="bk-web">
            <div class="bk-web__banner" aria-hidden="true"></div>
            <div class="bk-web__body">
              <img class="bk-web__avatar" src="/favicon-192x192.png" alt="" />
              <div class="bk-web__name">Greeting Bot</div>
              <div class="bk-web__handle">@greetbot@example.com</div>
              <p class="bk-web__bio">I greet everyone who follows me. 👋</p>
              <div class="bk-web__meta">
                <span><b>128</b> followers</span>
                <span><b>342</b> posts</span>
                <span class="bk-web__follow">Follow</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  ALSO IN THE BOX  ──────────────────── -->
    <section class="bk-section">
      <div class="bk-section__head">
        <h2 class="bk-h2">Also in the box</h2>
        <p class="bk-sub">
          Everything else that comes with the framework.
        </p>
      </div>

      <div class="bk-cards">
        <div v-for="c in capabilities" :key="c.title" class="bk-card">
          <span class="bk-card__gate" aria-hidden="true"></span>
          <h3 class="bk-card__title">{{ c.title }}</h3>
          <p class="bk-card__body">{{ c.body }}</p>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  BUILT ON FEDIFY  ──────────────────── -->
    <section class="bk-fedify">
      <div class="bk-fedify__grid">
        <div class="bk-fedify__text">
          <img class="bk-fedify__logo" src="/fedify.svg" alt="Fedify" />
          <h2 class="bk-h2">Built on Fedify</h2>
          <p class="bk-sub">
            BotKit is the sister project of
            <a href="https://fedify.dev/">Fedify</a>, built by the same team.
            Fedify does the hard part of federation: the ActivityPub protocol,
            compatibility with Mastodon, Misskey, and the rest of the fediverse,
            signed message delivery, and retries. BotKit adds the bot on top:
            events, sessions, messages, and storage.
          </p>
          <a class="bk-link" href="https://fedify.dev/">Learn about Fedify →</a>
        </div>

        <div class="bk-stack" aria-hidden="true">
          <div class="bk-stack__row bk-stack__row--1">Your bot · one file</div>
          <div class="bk-stack__row bk-stack__row--2">
            BotKit · events, sessions, messages
          </div>
          <div class="bk-stack__row bk-stack__row--3">
            Fedify · ActivityPub federation
          </div>
          <div class="bk-stack__row bk-stack__row--4">
            The fediverse · Mastodon, Misskey, …
          </div>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  STORE & SHIP  ──────────────────── -->
    <section class="bk-section">
      <div class="bk-section__head">
        <h2 class="bk-h2">Store it and ship it anywhere</h2>
        <p class="bk-sub">
          BotKit keeps storage behind its own
          <a href="/concepts/repository"><code>Repository</code></a> interface,
          so switching backends never touches your bot code.
        </p>
      </div>

      <div class="bk-rows">
        <div class="bk-row">
          <span class="bk-row__label">Storage</span>
          <div class="bk-row__body">
            <div class="bk-chips">
              <a
                v-for="r in repos"
                :key="r.name"
                class="bk-chip bk-chip--code"
                :href="r.href"
                >{{ r.name }}</a
              >
            </div>
            <p class="bk-row__note">
              <a href="/concepts/repository#kvrepository"
                ><code>KvRepository</code></a
              >
              adapts any Fedify
              <a href="https://fedify.dev/manual/kv"><code>KvStore</code></a>
              (Redis, PostgreSQL, Deno KV, or in‑memory);
              <a href="/concepts/repository#sqliterepository"
                ><code>SqliteRepository</code></a
              >,
              <a href="/concepts/repository#redisrepository"
                ><code>RedisRepository</code></a
              >, and
              <a href="/concepts/repository#postgresrepository"
                ><code>PostgresRepository</code></a
              >
              store to those backends directly.
            </p>
          </div>
        </div>
        <div class="bk-row">
          <span class="bk-row__label">Deploy</span>
          <div class="bk-chips">
            <a
              v-for="t in targets"
              :key="t.name"
              class="bk-chip"
              :href="t.href"
              >{{ t.name }}</a
            >
          </div>
        </div>
      </div>
    </section>

    <hr class="bk-runner" />

    <!-- ────────────────────  CLOSING CTA  ──────────────────── -->
    <section class="bk-end">
      <img class="bk-end__art" src="/logo.svg" alt="" aria-hidden="true" />
      <h2 class="bk-h2">Build your first bot</h2>
      <p class="bk-sub">
        Install the package and follow the guide, and you'll have a bot on the
        fediverse in minutes.
      </p>
      <div class="bk-install bk-install--center">
        <div class="bk-install__tabs" role="tablist">
          <button
            v-for="m in managers"
            :key="m.id"
            class="bk-install__tab"
            :class="{ 'is-active': active === m.id }"
            role="tab"
            :aria-selected="active === m.id"
            @click="active = m.id"
          >
            {{ m.label }}
          </button>
        </div>
        <div class="bk-install__cmd">
          <code>{{ current().cmd }}</code>
          <button
            class="bk-install__copy"
            :aria-label="copied ? 'Copied' : 'Copy command'"
            @click="copyCmd"
          >
            {{ copied ? "Copied" : "Copy" }}
          </button>
        </div>
      </div>
      <div class="bk-cta bk-cta--center">
        <a class="bk-btn bk-btn--brand" href="/start">Get started →</a>
        <a class="bk-btn bk-btn--ghost" href="https://hackers.pub/@botkit"
          >Follow @botkit@hackers.pub</a
        >
      </div>
      <div class="bk-end__links">
        <a href="https://github.com/fedify-dev/botkit">GitHub</a>
        <a href="https://jsr.io/@fedify/botkit">JSR</a>
        <a href="https://www.npmjs.com/package/@fedify/botkit">npm</a>
        <a href="https://matrix.to/#/#fedify:matrix.org">Matrix</a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bk {
  --bk-measure: 1120px;
  max-width: var(--bk-measure);
  margin: 0 auto;
  padding: 0 24px;
  box-sizing: border-box;
}

/* ── Shared type ─────────────────────────────────────────── */
.bk-h2 {
  font-family: var(--bk-font-display);
  font-size: clamp(1.7rem, 1.2rem + 1.9vw, 2.4rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.12;
  margin: 0;
}
.bk-sub {
  color: var(--vp-c-text-2);
  font-size: 1.02rem;
  line-height: 1.6;
  margin: 12px 0 0;
  max-width: 46ch;
}
.bk-sub code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.86em;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  padding: 2px 6px;
  border-radius: 6px;
}
.bk-section {
  padding: 64px 0;
}
.bk-section__head {
  margin-bottom: 36px;
}

/* ── Sprue-gate runner divider ───────────────────────────── */
.bk-runner {
  position: relative;
  height: 0;
  margin: 0;
  border: 0;
  border-top: 1px solid var(--vp-c-divider);
}
.bk-runner::before {
  content: "";
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--vp-c-bg);
  border: 2px solid var(--bk-gate, var(--vp-c-brand-1));
}

/* ── Hero ────────────────────────────────────────────────── */
.bk-hero {
  padding: 40px 0 60px;
}
.bk-hero__grid {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 48px;
  align-items: center;
}
.bk-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 18px;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--vp-c-brand-1);
  text-transform: none;
}
.bk-gate {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 0 4px var(--vp-c-brand-soft);
}
.bk-title {
  font-family: var(--bk-font-display);
  font-size: clamp(2.5rem, 1.4rem + 4.3vw, 4rem);
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1.02;
  margin: 0;
  color: var(--vp-c-text-1);
}
.bk-lede {
  margin: 22px 0 0;
  font-size: 1.15rem;
  line-height: 1.55;
  color: var(--vp-c-text-2);
  max-width: 34ch;
}
.bk-cta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}
.bk-cta--center {
  justify-content: center;
}
.bk-btn {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 11px 22px;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
  white-space: nowrap;
}
.bk-btn--brand {
  background: var(--vp-c-brand-3);
  color: var(--vp-c-white);
  border: 1px solid transparent;
}
.bk-btn--brand:hover {
  background: var(--vp-c-brand-2);
}
.bk-btn--ghost {
  background: transparent;
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-border);
}
.bk-btn--ghost:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* Install command */
.bk-install {
  margin-top: 34px;
  max-width: 420px;
}
.bk-install__tabs {
  display: flex;
  gap: 4px;
}
.bk-install__tab {
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--vp-c-text-3);
  border-radius: 8px 8px 0 0;
  border: none;
  background: transparent;
  cursor: pointer;
}
.bk-install__tab:hover {
  color: var(--vp-c-text-1);
}
.bk-install__tab.is-active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-alt);
}
.bk-install__cmd {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 0 10px 10px 10px;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-divider);
}
.bk-install__cmd code {
  flex: 1;
  font-family: var(--vp-font-family-mono);
  font-size: 0.86rem;
  color: var(--vp-c-text-1);
  background: none;
  padding: 0;
}
.bk-install__cmd code::before {
  content: "$ ";
  color: var(--vp-c-brand-1);
}
.bk-install__copy {
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  border-radius: 7px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.bk-install__copy:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

/* Hero kit panel */
.bk-hero__kit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.bk-kit {
  position: relative;
  width: min(100%, 440px);
  aspect-ratio: 5 / 4;
  display: grid;
  place-items: center;
  border-radius: 24px;
  background:
    radial-gradient(
      130% 120% at 50% 8%,
      var(--vp-c-brand-soft),
      transparent 62%
    ),
    var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}
.bk-kit__art {
  width: 80%;
  height: auto;
  filter: drop-shadow(0 14px 30px rgba(54, 83, 20, 0.16));
}
.bk-kit__cap {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-3);
  text-transform: uppercase;
}

/* ── One-file code section ───────────────────────────────── */
.bk-code-grid {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 32px;
  align-items: start;
}
.bk-window {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-code-block-bg, var(--vp-c-bg-alt));
  box-shadow: 0 16px 40px -24px rgba(0, 0, 0, 0.4);
}
.bk-window__bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 15px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}
.bk-dot {
  width: 11px;
  height: 11px;
  border-radius: 999px;
  background: var(--vp-c-border);
}
.bk-window__name {
  margin-left: 8px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
}
.bk-code {
  margin: 0;
  padding: 20px 22px;
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 0.84rem;
  line-height: 1.65;
  color: var(--vp-c-text-1);
  background: transparent;
  tab-size: 2;
}
.bk-code code {
  background: none;
  padding: 0;
  font-size: inherit;
  color: inherit;
}
.bk-code .k { color: #9333ea; font-weight: 500; }
.bk-code .s { color: #3f6212; }
.bk-code .c { color: var(--vp-c-text-3); font-style: italic; }
.bk-code .fn { color: var(--vp-c-brand-1); }
.bk-code .t { color: #0369a1; }
.bk-code .n { color: #b45309; }
:global(.dark) .bk-code .k { color: #d8b4fe; }
:global(.dark) .bk-code .s { color: #bef264; }
:global(.dark) .bk-code .fn { color: #86efac; }
:global(.dark) .bk-code .t { color: #7dd3fc; }
:global(.dark) .bk-code .n { color: #fcd34d; }

.bk-notes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.bk-notes li {
  padding-left: 16px;
  border-left: 2px solid var(--vp-c-brand-soft);
  color: var(--vp-c-text-2);
  font-size: 0.96rem;
  line-height: 1.55;
}
.bk-notes__k {
  display: inline-block;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  padding: 1px 7px;
  border-radius: 6px;
  margin-right: 4px;
}
a.bk-notes__k {
  text-decoration: none;
  transition: background-color 0.2s;
}
a.bk-notes__k:hover {
  text-decoration: underline;
}

/* ── Capability cards ────────────────────────────────────── */
.bk-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
.bk-card {
  position: relative;
  padding: 24px 22px;
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  transition: border-color 0.2s, transform 0.2s;
}
.bk-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
}
.bk-card__gate {
  position: absolute;
  top: -5px;
  left: 22px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  border: 2px solid var(--vp-c-brand-1);
}
.bk-card__title {
  font-family: var(--bk-font-display);
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--vp-c-text-1);
}
.bk-card__body {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

/* ── Feature sections ────────────────────────────────────── */
.bk-feature {
  padding: 60px 0;
}
.bk-feature__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 52px;
  align-items: center;
}
.bk-feature__text {
  order: 0;
}
.bk-feature__visual {
  order: 1;
  min-width: 0;
}
.bk-kicker {
  margin: 0 0 14px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
}
.bk-feature__body {
  margin: 16px 0 0;
  font-size: 1.05rem;
  line-height: 1.65;
  color: var(--vp-c-text-2);
  max-width: 46ch;
}
.bk-feature__body code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85em;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  padding: 1px 6px;
  border-radius: 6px;
}
.bk-feature__body a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: none;
}
.bk-feature__body a:hover {
  text-decoration: underline;
}
.bk-feature__body a code {
  color: var(--vp-c-brand-1);
}
.bk-feature .bk-link {
  margin-top: 20px;
}
@media (min-width: 861px) {
  .bk-feature--reverse .bk-feature__text {
    order: 1;
  }
  .bk-feature--reverse .bk-feature__visual {
    order: 0;
  }
}

/* Spec sheet visual */
.bk-spec {
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
  font-family: var(--vp-font-family-mono);
}
.bk-spec__head {
  padding: 12px 18px;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg);
  border-bottom: 1px solid var(--vp-c-divider);
}
.bk-spec__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 18px;
  font-size: 0.85rem;
}
.bk-spec__row + .bk-spec__row {
  border-top: 1px solid var(--vp-c-divider);
}
.bk-spec__k {
  color: var(--vp-c-text-3);
}
.bk-spec__v {
  color: var(--vp-c-text-1);
  text-align: right;
}

/* Bot profile mock (web-pages visual) */
.bk-web {
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  max-width: 420px;
}
.bk-web__banner {
  height: 88px;
  background: linear-gradient(120deg, var(--vp-c-brand-3), #9ecd54);
}
.bk-web__body {
  padding: 0 20px 22px;
}
.bk-web__avatar {
  display: block;
  width: 66px;
  height: 66px;
  margin-top: -33px;
  border-radius: 15px;
  border: 3px solid var(--vp-c-bg-soft);
  background: #fff;
  object-fit: contain;
  position: relative;
}
.bk-web__name {
  font-family: var(--bk-font-display);
  font-weight: 600;
  font-size: 1.25rem;
  margin-top: 12px;
  color: var(--vp-c-text-1);
}
.bk-web__handle {
  font-family: var(--vp-font-family-mono);
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  margin-top: 2px;
}
.bk-web__bio {
  margin: 14px 0 0;
  font-size: 0.92rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.bk-web__meta {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 18px;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}
.bk-web__meta b {
  color: var(--vp-c-text-1);
}
.bk-web__follow {
  margin-left: auto;
  background: var(--vp-c-brand-3);
  color: var(--vp-c-white);
  border-radius: 999px;
  padding: 7px 18px;
  font-size: 0.82rem;
  font-weight: 600;
}

/* ── Built on Fedify ─────────────────────────────────────── */
.bk-fedify {
  margin: 64px 0;
  padding: 52px 40px;
  border-radius: 24px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}
.bk-fedify__grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 44px;
  align-items: center;
}
.bk-fedify__logo {
  width: 46px;
  height: 46px;
  margin-bottom: 16px;
}
.bk-link {
  display: inline-block;
  margin-top: 18px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}
.bk-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bk-stack__row {
  padding: 16px 20px;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 500;
  border: 1px solid var(--vp-c-divider);
}
.bk-stack__row--1 {
  background: var(--vp-c-brand-3);
  color: var(--vp-c-white);
  border-color: transparent;
  font-weight: 600;
}
.bk-stack__row--2 {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-text-1);
  margin: 0 6px;
}
.bk-stack__row--3 {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  margin: 0 12px;
}
.bk-stack__row--4 {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  margin: 0 18px;
}

/* ── Store & ship ────────────────────────────────────────── */
.bk-rows {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.bk-row {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
}
.bk-row__label {
  width: 90px;
  flex-shrink: 0;
  padding-top: 9px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}
.bk-row__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.bk-row__note {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--vp-c-text-3);
  max-width: 62ch;
}
.bk-row__note code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85em;
  color: var(--vp-c-text-2);
}
.bk-row__note a {
  text-decoration: none;
  color: inherit;
}
.bk-row__note a code {
  color: var(--vp-c-brand-1);
}
.bk-row__note a:hover code {
  text-decoration: underline;
}
.bk-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.bk-chip {
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s, background-color 0.2s;
}
a.bk-chip:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.bk-chip--code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-color: transparent;
}
a.bk-chip--code:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

/* ── Closing CTA ─────────────────────────────────────────── */
.bk-end {
  text-align: center;
  padding: 72px 0 88px;
}
.bk-end__art {
  width: 92px;
  height: auto;
  margin: 0 auto 22px;
  opacity: 0.95;
}
.bk-end .bk-sub {
  margin-left: auto;
  margin-right: auto;
}
.bk-install--center {
  margin: 30px auto 0;
  text-align: left;
}
.bk-cta--center {
  margin-top: 22px;
}
.bk-end__links {
  display: flex;
  justify-content: center;
  gap: 26px;
  margin-top: 34px;
}
.bk-end__links a {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.bk-end__links a:hover {
  color: var(--vp-c-brand-1);
}

/* ── Responsive ──────────────────────────────────────────── */
@media (max-width: 860px) {
  .bk-hero__grid,
  .bk-code-grid,
  .bk-feature__grid,
  .bk-fedify__grid {
    grid-template-columns: 1fr;
  }
  .bk-feature__grid {
    gap: 28px;
  }
  .bk-hero__grid {
    gap: 36px;
  }
  .bk-hero__kit {
    order: -1;
  }
  .bk-cards {
    grid-template-columns: 1fr 1fr;
  }
  .bk-fedify {
    padding: 40px 24px;
  }
}
@media (max-width: 520px) {
  .bk-cards {
    grid-template-columns: 1fr;
  }
  .bk-title {
    font-size: clamp(2.2rem, 8vw, 2.8rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bk-card,
  .bk-btn {
    transition: none;
  }
}
</style>
