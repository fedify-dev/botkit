import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import { jsrRef } from "markdown-it-jsr-ref";
import process from "node:process";
import { defineConfig } from "vitepress";
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from "vitepress-plugin-group-icons";

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
    { text: "Session", link: "/concepts/session.md" },
    { text: "Events", link: "/concepts/events.md" },
    { text: "Message", link: "/concepts/message.md" },
    { text: "Text", link: "/concepts/text.md" },
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
      { text: "Examples", link: "/examples.md" },
    ],

    sidebar: [
      { text: "What is BotKit?", link: "/intro.md" },
      { text: "Getting started", link: "/start.md" },
      concepts,
      { text: "Examples", link: "/examples.md" },
    ],

    socialLinks: [
      {
        icon: "jsr",
        link: "https://jsr.io/@fedify/botkit",
        ariaLabel: "JSR",
      },
      {
        icon: "discord",
        link: "https://discord.gg/bhtwpzURwd",
        ariaLabel: "Discord",
      },
      {
        icon: {
          svg:
            '<svg xmlns="http://www.w3.org/2000/svg" width="284.054" height="284.054" viewBox="0 0 75.156 75.156" xmlns:v="https://vecta.io/nano"><g transform="matrix(1.364543 0 0 1.364543 -66.273472 -133.533664)"><circle cx="-76.107" cy="-125.398" transform="scale(-1)" r="18.701" stroke="#000" stroke-width=".087"/><path d="M59.541 117.004l-.493 1.853-3.78-1.005-.923 3.473 3.78 1.005-.493 1.853-8.763-2.329.493-1.853 3.437.913.923-3.473-3.437-.913.493-1.853zm2.828-8.898q.644.576.984 1.204.349.619.403 1.264.053.627-.182 1.251-.245.616-.77 1.203-.483.54-1.068.851-.586.293-1.223.32-.647.018-1.318-.241-.663-.269-1.306-.845-.861-.771-1.177-1.598-.325-.836-.13-1.684.196-.847.89-1.623.652-.729 1.464-1.008.812-.279 1.696-.067.875.203 1.736.974zm-3.192 3.568q.511.457.954.666.442.191.834.115.382-.084.721-.463.339-.379.372-.758.032-.398-.216-.806-.249-.427-.76-.884-.511-.457-.953-.648-.434-.201-.816-.116-.382.084-.721.463-.5.558-.34 1.161.158.585.925 1.271zm8.893-2.914l-1.635.952-4.856-8.342 1.635-.952zm3.606-1.411l-1.796.595-3.036-9.162 1.796-.595zm8.206-4.152q.005.864-.232 1.538-.224.675-.666 1.147-.429.46-1.05.705-.621.232-1.408.237-.724.005-1.348-.22-.611-.237-1.058-.692-.447-.467-.706-1.139-.246-.672-.251-1.535-.007-1.156.394-1.946.401-.803 1.161-1.226.759-.424 1.801-.43.978-.006 1.73.408.752.414 1.189 1.212.437.785.444 1.94zm-4.788.03q.004.686.147 1.155.155.456.474.696.319.227.827.223.508-.003.811-.234.316-.243.453-.701.149-.471.145-1.157-.004-.686-.16-1.142-.143-.456-.461-.683-.319-.227-.827-.223-.749.005-1.089.528-.327.51-.321 1.539z"/></g></svg>',
        },
        link: "https://hollo.social/@botkit",
        ariaLabel: "Hollo (ActivityPub)",
      },
      { icon: "github", link: "https://github.com/dahlia/botkit" },
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
      {
        property: "og:image",
        content:
          "https://repository-images.githubusercontent.com/913141583/852a1091-14d5-46a0-b3bf-8d2f45ef6e7f",
      },
    ],
    [
      "meta",
      {
        name: "fediverse:creator",
        content: "@botkit@hollo.social",
      },
    ],
    ...plausibleScript,
  ],

  cleanUrls: true,
  ignoreDeadLinks: true,

  markdown: {
    config(md) {
      md.use(deflist);
      md.use(footnote);
      md.use(groupIconMdPlugin);
      md.use(jsrRefPlugin);
    },
  },

  vite: {
    plugins: [
      groupIconVitePlugin(),
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
