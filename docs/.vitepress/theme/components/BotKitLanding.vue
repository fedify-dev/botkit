<script setup lang="ts">
import type { Component } from "vue";
import { onMounted, onUnmounted, ref } from "vue";
import CreateBotCode from "./landing-code/create-bot.md";
import EventsCode from "./landing-code/events.md";
import InstanceCode from "./landing-code/instance.md";
import MessagesCode from "./landing-code/messages.md";
import PublishRichPostCode from "./landing-code/publish-rich-post.md";
import ReplyMentionsCode from "./landing-code/reply-mentions.md";
import WeatherbotCode from "./landing-code/weatherbot.md";
import WelcomeFollowersCode from "./landing-code/welcome-followers.md";

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

// ── Carousel ──────────────────────────────────────────────
const snippets = [
  {
    file: "bot.ts",
    label: "Create a bot",
    component: CreateBotCode,
  },
  {
    file: "handlers.ts",
    label: "Reply to mentions",
    component: ReplyMentionsCode,
  },
  {
    file: "handlers.ts",
    label: "Welcome new followers",
    component: WelcomeFollowersCode,
  },
  {
    file: "post.ts",
    label: "Publish rich posts",
    component: PublishRichPostCode,
  },
] satisfies readonly {
  readonly file: string;
  readonly label: string;
  readonly component: Component;
}[];

const currentIndex = ref(0); // 0 = logo, 1…n = code slides
const carouselPaused = ref(false);
let carouselTimer: ReturnType<typeof setInterval> | null = null;

function startCarousel() {
  carouselTimer = setInterval(() => {
    if (!carouselPaused.value) {
      currentIndex.value = (currentIndex.value + 1) % (snippets.length + 1);
    }
  }, 4000);
}

function stopCarousel() {
  if (carouselTimer !== null) {
    clearInterval(carouselTimer);
    carouselTimer = null;
  }
}

function goToSlide(i: number) {
  currentIndex.value = i;
  stopCarousel();
  startCarousel();
}

onMounted(() => {
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    startCarousel();
  }
});
onUnmounted(() => stopCarousel());

const capabilities = [
  {
    title: "Type‑safe API",
    body:
      "Written in TypeScript end to end: autocomplete, compile‑time checks, " +
      "and typed builders for every message you send.",
  },
  {
    title: "Follower policy",
    href: "/concepts/events#follow",
    body:
      "Approve every follower automatically, or review each follow request " +
      "yourself before accepting.",
  },
  {
    title: "Quote controls",
    href: "/concepts/message#quote-policy",
    body:
      "Support Misskey-style quotes and Mastodon-style, consent-respecting " +
      "quotes with FEP-044f policies.",
  },
  {
    title: "Polls and votes",
    href: "/concepts/message#polls",
    body:
      "Publish single-choice or multiple-choice polls, then react when " +
      "people vote on your bot's questions.",
  },
  {
    title: "Emoji reactions",
    href: "/concepts/message#reacting-to-a-message-with-an-emoji",
    body:
      "Send emoji reactions, receive reaction events, and handle undo " +
      "events when someone takes a reaction back.",
  },
  {
    title: "Deno, Node.js, and Workers",
    body:
      "Runs on Deno, Node.js, and Cloudflare Workers with minimal " +
      "dependencies. A whole bot fits in a single TypeScript file.",
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
  { name: "Cloudflare Workers", href: "/deploy/cfworkers" },
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

        <!-- Slide 0: the BotKit dinosaur on its model-kit runner.
             Slides 1–n: rotating code snippets showing BotKit at a glance. -->
        <div
          class="bk-hero__kit"
          @mouseenter="carouselPaused = true"
          @mouseleave="carouselPaused = false"
        >
          <div class="bk-kit">
            <Transition name="bk-fade" mode="out-in">
              <div v-if="currentIndex === 0" key="logo" class="bk-kit__logo-frame">
                <img
                  class="bk-kit__art"
                  src="/logo.svg"
                  alt="The BotKit dinosaur, held on its model-kit runner"
                  width="360"
                  height="292"
                />
              </div>
              <div v-else :key="currentIndex" class="bk-kit__code-frame">
                <div class="bk-window">
                  <div class="bk-window__bar">
                    <span class="bk-dot"></span><span class="bk-dot"></span
                    ><span class="bk-dot"></span>
                    <span class="bk-window__name">{{ snippets[currentIndex - 1].file }}</span>
                  </div>
                  <div class="bk-code">
                    <component :is="snippets[currentIndex - 1].component" />
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <div class="bk-carousel__footer">
            <p class="bk-kit__cap">
              {{
                currentIndex === 0
                  ? 'No. 01 · some assembly required'
                  : snippets[currentIndex - 1].label
              }}
            </p>
            <div
              class="bk-carousel__dots"
              role="tablist"
              aria-label="Code examples"
            >
              <button
                v-for="n in (snippets.length + 1)"
                :key="n - 1"
                class="bk-carousel__dot"
                :class="{ 'is-active': currentIndex === n - 1 }"
                role="tab"
                :aria-selected="currentIndex === n - 1"
                :aria-label="n === 1 ? 'BotKit logo' : snippets[n - 2].label"
                @click="goToSlide(n - 1)"
              ></button>
            </div>
          </div>
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
          <div class="bk-code">
            <WeatherbotCode />
          </div>
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
            A BotKit bot is not a script driving an account on someone else's
            Mastodon or Misskey server. It is an ActivityPub actor served by
            your app, on your domain, backed by your storage, your queue, and
            your code. It still federates with Mastodon, Misskey, and the rest
            of the fediverse.
          </p>
          <a class="bk-link" href="/intro">More on standalone bots →</a>
        </div>
        <div class="bk-feature__visual">
          <div class="bk-model">
            <div class="bk-model__col">
              <div class="bk-model__head">Account automation</div>
              <ul class="bk-model__list">
                <li>Mastodon or Misskey account</li>
                <li>Access token</li>
                <li>Platform database</li>
                <li>Platform limits</li>
                <li>One account at a time</li>
              </ul>
            </div>
            <div class="bk-model__col bk-model__col--botkit">
              <div class="bk-model__head">BotKit server</div>
              <ul class="bk-model__list">
                <li>ActivityPub actor on your domain</li>
                <li>Your repository</li>
                <li>Your queue</li>
                <li>Your message rules</li>
                <li>One app, many bots</li>
              </ul>
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
            <div class="bk-code">
              <MessagesCode />
            </div>
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
            <div class="bk-code">
              <EventsCode />
            </div>
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
            <div class="bk-code">
              <InstanceCode />
            </div>
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
          <h3 class="bk-card__title">
            <a v-if="c.href" :href="c.href">{{ c.title }}</a>
            <span v-else>{{ c.title }}</span>
          </h3>
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
          so switching backends and deploy targets never touches your bot code.
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
.bk-hero__text,
.bk-hero__kit,
.bk-feature__text,
.bk-feature__visual,
.bk-fedify__text {
  min-width: 0;
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
  gap: 0;
}
.bk-kit {
  position: relative;
  width: min(100%, 440px);
  aspect-ratio: 5 / 4;
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  background:
    radial-gradient(
      130% 120% at 50% 8%,
      var(--vp-c-brand-soft),
      transparent 62%
    ),
    var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  overflow: hidden;
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

/* ── Hero kit logo / code frames ─────────────────────────── */
.bk-kit__logo-frame {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 28px;
}
.bk-kit__code-frame {
  flex: 1;
  padding: 14px;
  display: flex;
  flex-direction: column;
}
.bk-kit__code-frame .bk-window {
  flex: 1;
}

/* ── Carousel ────────────────────────────────────────────── */
.bk-carousel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: min(100%, 440px);
  padding: 10px 4px 0;
}
.bk-carousel__dots {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.bk-carousel__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--vp-c-border);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background-color 0.25s, width 0.25s;
}
.bk-carousel__dot.is-active {
  width: 22px;
  background: var(--vp-c-brand-1);
}
.bk-carousel__dot:hover:not(.is-active) {
  background: var(--vp-c-text-3);
}
.bk-carousel__dot:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

/* ── Fade transition ─────────────────────────────────────── */
.bk-fade-enter-active,
.bk-fade-leave-active {
  transition: opacity 0.25s ease;
}
.bk-fade-enter-from,
.bk-fade-leave-to {
  opacity: 0;
}

/* ── One-file code section ───────────────────────────────── */
.bk-code-grid {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 32px;
  align-items: start;
}
.bk-window {
  display: flex;
  flex-direction: column;
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
  min-width: 0;
  min-height: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 0.84rem;
  line-height: 1.65;
  color: var(--vp-c-text-1);
  background: transparent;
  tab-size: 2;
}
.bk-kit__code-frame .bk-code {
  flex: 1;
}
.bk-code :deep(div[class*="language-"]) {
  margin: 0;
  border-radius: 0;
  background: transparent;
}
.bk-code :deep(div[class*="language-"] > button.copy),
.bk-code :deep(div[class*="language-"] > span.lang) {
  display: none;
}
.bk-code :deep(pre.shiki) {
  margin: 0;
  padding: 20px 22px;
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background: transparent !important;
  tab-size: inherit;
}
.bk-code :deep(code) {
  background: none;
  padding: 0;
  font-size: inherit;
  color: inherit;
}

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
.bk-card__title a {
  color: inherit;
  text-decoration: none;
}
.bk-card__title a:hover {
  color: var(--vp-c-brand-1);
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

/* Account/server model visual */
.bk-model {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.bk-model__col {
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
}
.bk-model__col--botkit {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-brand-soft) 42%, var(--vp-c-bg-soft));
}
.bk-model__head {
  padding: 12px 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg);
  border-bottom: 1px solid var(--vp-c-divider);
}
.bk-model__col--botkit .bk-model__head {
  color: var(--vp-c-brand-1);
}
.bk-model__list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.bk-model__list li {
  position: relative;
  margin: 0;
  padding: 12px 16px 12px 36px;
  font-size: 0.9rem;
  line-height: 1.35;
  color: var(--vp-c-text-2);
}
.bk-model__list li + li {
  border-top: 1px solid var(--vp-c-divider);
}
.bk-model__list li::before {
  content: "";
  position: absolute;
  left: 16px;
  top: 1.05em;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--vp-c-text-3);
}
.bk-model__col--botkit .bk-model__list li {
  color: var(--vp-c-text-1);
}
.bk-model__col--botkit .bk-model__list li::before {
  background: var(--vp-c-brand-1);
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
    max-width: 100%;
    font-size: clamp(2.05rem, 8vw, 2.55rem);
    overflow-wrap: anywhere;
  }
  .bk-lede {
    max-width: 100%;
  }
  .bk-model {
    grid-template-columns: 1fr;
  }
  .bk-code :deep(pre.shiki) {
    padding: 18px 10px;
    font-size: 0.72rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bk-card,
  .bk-btn,
  .bk-fade-enter-active,
  .bk-fade-leave-active,
  .bk-carousel__dot {
    transition: none;
  }
}
</style>
