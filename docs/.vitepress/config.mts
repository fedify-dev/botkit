import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import { jsrRef } from "markdown-it-jsr-ref";
import process from "node:process";
import { ModuleKind, ModuleResolutionKind } from "typescript";
import { defineConfig } from "vitepress";
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from "vitepress-plugin-group-icons";
import llmstxt from "vitepress-plugin-llms";

const jsrRefPlugin = await jsrRef({
  package: "@fedify/botkit",
  version: "unstable",
  cachePath: ".jsr-cache.json",
});

let plausibleScript: [string, Record<string, string>][] = [];
if (process.env.PLAUSIBLE_DOMAIN) {
  plausibleScript = [
    [
      "script",
      {
        defer: "defer",
        "data-domain": process.env.PLAUSIBLE_DOMAIN,
        src: "https://plausible.io/js/plausible.js",
      },
    ],
  ];
}

const concepts = {
  text: "Concepts",
  items: [
    { text: "Bot", link: "/concepts/bot.md" },
    { text: "Instance", link: "/concepts/instance.md" },
    { text: "Session", link: "/concepts/session.md" },
    { text: "Events", link: "/concepts/events.md" },
    { text: "Message", link: "/concepts/message.md" },
    { text: "Text", link: "/concepts/text.md" },
    { text: "Repository", link: "/concepts/repository.md" },
  ],
};

const deploy = {
  text: "Deploy",
  items: [
    { text: "Store and message queue", link: "/deploy/store-mq.md" },
    { text: "Deno Deploy", link: "/deploy/deno-deploy.md" },
    { text: "Docker", link: "/deploy/docker.md" },
    { text: "Self-hosting", link: "/deploy/self-hosting.md" },
  ],
};

const references = {
  text: "References",
  items: [
    { text: "@fedify/botkit", link: "https://jsr.io/@fedify/botkit/doc" },
    {
      text: "@fedify/botkit-postgres",
      link: "https://jsr.io/@fedify/botkit-postgres/doc",
    },
    {
      text: "@fedify/botkit-redis",
      link: "https://jsr.io/@fedify/botkit-redis/doc",
    },
    {
      text: "@fedify/botkit-sqlite",
      link: "https://jsr.io/@fedify/botkit-sqlite/doc",
    },
  ],
};

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "BotKit by Fedify",
  description: "A framework for creating your ActivityPub bots",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/logo.svg",
    nav: [
      { text: "Home", link: "/" },
      { text: "About", link: "/intro.md" },
      { text: "Start", link: "/start.md" },
      concepts,
      deploy,
      references,
      { text: "Recipes", link: "/recipes.md" },
      { text: "Examples", link: "/examples.md" },
    ],

    sidebar: [
      { text: "What is BotKit?", link: "/intro.md" },
      { text: "Getting started", link: "/start.md" },
      concepts,
      deploy,
      references,
      { text: "Recipes", link: "/recipes.md" },
      { text: "Examples", link: "/examples.md" },
      { text: "Changelog", link: "/changelog.md" },
    ],

    socialLinks: [
      {
        icon: "jsr",
        link: "https://jsr.io/@fedify/botkit",
        ariaLabel: "JSR",
      },
      {
        icon: "npm",
        link: "https://www.npmjs.com/package/@fedify/botkit",
        ariaLabel: "npm",
      },
      {
        icon: {
          svg:
            '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Matrix</title><path d="M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.481.314.448.208.785.582 1.02 1.108.254-.374.6-.706 1.034-.992.434-.287.95-.43 1.546-.43.453 0 .872.056 1.26.167.388.11.716.286.993.53.276.245.489.559.646.951.152.392.23.863.23 1.417v5.728h-2.349V11.52c0-.286-.01-.559-.032-.812a1.755 1.755 0 0 0-.18-.66 1.106 1.106 0 0 0-.438-.448c-.194-.11-.457-.166-.785-.166-.332 0-.6.064-.803.189a1.38 1.38 0 0 0-.48.499 1.946 1.946 0 0 0-.231.696 5.56 5.56 0 0 0-.06.785v4.768h-2.35v-4.8c0-.254-.004-.503-.018-.752a2.074 2.074 0 0 0-.143-.688 1.052 1.052 0 0 0-.415-.503c-.194-.125-.476-.19-.854-.19-.111 0-.259.024-.439.074-.18.051-.36.143-.53.282-.171.138-.319.337-.439.595-.12.259-.18.6-.18 1.02v4.966H5.46V7.81zm15.693 15.64V.55H21.72V0H24v24h-2.28v-.55z"/></svg>',
        },
        link: "https://matrix.to/#/#fedify:matrix.org",
        ariaLabel: "Matrix",
      },
      {
        icon: {
          svg:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 196.52 196.52"><g fill="currentColor" transform="translate(6.6789703,-32.495842)"><g transform="matrix(0.26458333,0,0,0.26458333,-6.6789703,32.495842)"><path d="M 181.13086 275.13672 A 68.892408 68.892408 0 0 1 151.66602 304.46484 L 313.42383 466.85352 L 352.42188 447.08984 L 181.13086 275.13672 z M 394.49414 489.32422 L 355.49609 509.08789 L 437.45898 591.37109 A 68.892409 68.892409 0 0 1 466.92969 562.03906 L 394.49414 489.32422 z "/><path d="M 581.64648 339.39062 L 490.07031 385.80078 L 496.82227 428.99023 L 600.4375 376.47656 A 68.892409 68.892409 0 0 1 581.64648 339.39062 z M 436.9082 412.74219 L 220.38281 522.47656 A 68.892408 68.892408 0 0 1 239.17773 559.56641 L 443.66016 455.93359 L 436.9082 412.74219 z "/><path d="M 367.27539 142.4375 L 262.79492 346.4082 L 293.64258 377.375 L 404.26562 161.41797 A 68.892408 68.892408 0 0 1 367.27539 142.4375 z M 235.62109 399.45898 L 182.69922 502.77344 A 68.892409 68.892409 0 0 1 219.68555 521.75195 L 266.4668 430.42383 L 235.62109 399.45898 z "/><path d="M 150.76758 304.91797 A 68.892408 68.892408 0 0 1 116.35156 312.11328 A 68.892408 68.892408 0 0 1 109.70117 311.41797 L 140.60352 509.08008 A 68.892409 68.892409 0 0 1 175.01953 501.88477 A 68.892409 68.892409 0 0 1 181.66602 502.58008 L 150.76758 304.91797 z "/><path d="M 239.3418 560.54492 A 68.892408 68.892408 0 0 1 240.0625 574.42188 A 68.892408 68.892408 0 0 1 232.79492 601.60156 L 430.42383 633.31445 A 68.892409 68.892409 0 0 1 429.70117 619.43555 A 68.892409 68.892409 0 0 1 436.9707 592.25781 L 239.3418 560.54492 z "/><path d="M 601.13281 377.19922 L 509.91406 555.28125 A 68.892408 68.892408 0 0 1 546.9082 574.26367 L 638.125 396.18359 A 68.892409 68.892409 0 0 1 601.13281 377.19922 z "/><path d="M 476.72266 125.33008 A 68.892408 68.892408 0 0 1 447.25195 154.66211 L 588.51758 296.47266 A 68.892409 68.892409 0 0 1 617.98633 267.14062 L 476.72266 125.33008 z "/><path d="M 347.78711 104.63086 L 169.21094 195.12891 A 68.892409 68.892409 0 0 1 188.00391 232.21484 L 366.57812 141.71289 A 68.892408 68.892408 0 0 1 347.78711 104.63086 z "/><path d="M 446.92578 154.82617 A 68.892408 68.892408 0 0 1 411.94336 162.30859 A 68.892408 68.892408 0 0 1 405.91406 161.67578 L 421.73242 262.9668 L 464.89453 269.89258 L 446.92578 154.82617 z M 430.92578 321.85352 L 468.32617 561.33594 A 68.892409 68.892409 0 0 1 502.24023 554.39258 A 68.892409 68.892409 0 0 1 509.44727 555.18359 L 474.08984 328.77734 L 430.92578 321.85352 z "/><path d="M 188.13086 232.97461 A 68.892408 68.892408 0 0 1 188.88867 247.07031 A 68.892408 68.892408 0 0 1 181.72852 274.05273 L 283.09766 290.33398 L 303.02148 251.42578 L 188.13086 232.97461 z M 361.86719 260.875 L 341.94141 299.78711 L 581.45508 338.25391 A 68.892409 68.892409 0 0 1 580.75977 324.53516 A 68.892409 68.892409 0 0 1 588.10938 297.21094 L 361.86719 260.875 z "/></g><g transform="rotate(3.1178174)"><circle cx="106.26596" cy="51.535553" r="16.570711"/><circle cx="171.42836" cy="110.19328" r="16.570711"/><circle cx="135.76379" cy="190.27704" r="16.570711"/><circle cx="48.559471" cy="181.1138" r="16.570711"/><circle cx="30.328812" cy="95.366837" r="16.570711"/></g></g></svg>',
        },
        link: "https://hackers.pub/@botkit",
        ariaLabel: "Fediverse",
      },
      { icon: "github", link: "https://github.com/fedify-dev/botkit" },
    ],

    search: {
      provider: "local",
    },

    outline: "deep",
  },

  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: "/favicon-192x192.png",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
    ],
    [
      "meta",
      { property: "og:image", content: "https://botkit.fedify.dev/og.png" },
    ],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:image:type", content: "image/png" }],
    [
      "meta",
      {
        property: "og:image:alt",
        content: "BotKit: fediverse bots, as standalone servers.",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    [
      "meta",
      { name: "twitter:image", content: "https://botkit.fedify.dev/og.png" },
    ],
    [
      "meta",
      {
        name: "fediverse:creator",
        content: "@botkit@hackers.pub",
      },
    ],
    ...plausibleScript,
  ],

  cleanUrls: true,
  ignoreDeadLinks: true,

  markdown: {
    languages: [
      "js",
      "jsx",
      "ts",
      "tsx",
      "typescript",
      "bash",
      "sh",
      "shell",
      "json",
      "text",
      "html",
    ],
    codeTransformers: [
      transformerTwoslash({
        twoslashOptions: {
          compilerOptions: {
            lib: ["dom", "dom.iterable", "esnext"],
            types: ["dom", "dom.iterable", "esnext", "@types/deno", "node"],
            moduleResolution: ModuleResolutionKind.Bundler,
            module: ModuleKind.ESNext,
          },
        },
      }),
    ],
    config(md) {
      md.use(deflist);
      md.use(footnote);
      md.use(groupIconMdPlugin);
      md.use(jsrRefPlugin);
    },
  },

  sitemap: {
    hostname: process.env.SITEMAP_HOSTNAME,
  },

  vite: {
    plugins: [
      groupIconVitePlugin(),
      llmstxt({
        ignoreFiles: [
          "changelog.md",
        ],
      }),
    ],
  },

  transformHead(context) {
    return [
      [
        "meta",
        { property: "og:title", content: context.title },
      ],
      [
        "meta",
        { property: "og:description", content: context.description },
      ],
    ];
  },
});

// cSpell: ignore deflist
