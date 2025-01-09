---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: BotKit by Fedify
  text: Simple ActivityPub bot framework
  tagline: A framework for creating your fediverse bots
  image:
    src: /logo.svg
    alt: BotKit by Fedify
  actions:
  - theme: brand
    text: Getting started
    link: /start.md
  - theme: alt
    text: What is BotKit?
    link: /intro.md
  - theme: alt
    text: Examples
    link: /examples.md

features:
- title: Standalone
  icon: 🔋
  details: >-
    Using BotKit, you can create standalone ActivityPub bots rather than
    Mastodon/Misskey bots.  Hence, you are free from the constraints of
    the existing platforms.
- title: Easy to use
  icon: 🧩
  details: >-
    BotKit is designed to be easy to use.  You can create your bot with
    just a few lines of code.  It's also fully written in TypeScript,
    so you can enjoy the type safety.
- title: Easy to deploy
  icon: 🚀
  details: >-
    BotKit is designed to be easy to deploy, with minimal dependencies.
    You can deploy your bot on Deno Deploy, Fly.io, Railway, or any other
    virtual servers.
- title: Powered by Fedify
  icon:
    src: /fedify.svg
    alt: Fedify
    width: 36
    height: 36
  details: >-
    BotKit is powered by Fedify, a lower-level rock-solid ActivityPub framework.
    No worries about the underlying protocol or the compatibility with other
    ActivityPub implementations.
---
