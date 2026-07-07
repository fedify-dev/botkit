BotKit design language
======================

This document describes the brand and design language behind BotKit's web
front end: the visual system used for the pages a bot serves (its profile,
its posts, its follower list), and the separate, more expressive identity
that belongs to BotKit itself.

It is written for anyone extending the front end, theming a bot, or building
a BotKit-branded surface such as the project site. It explains not just what
the system looks like, but why it is shaped the way it is, so that future work
stays coherent with it.


The core principle: whose page is this?
---------------------------------------

Every screen BotKit renders belongs to someone. A bot's profile page belongs
to the *bot* and, by extension, to the person who built it. BotKit's homepage
belongs to *BotKit*. These are different owners with different goals, and the
design language treats them differently on purpose.

A framework that stamps its own identity onto every page it generates makes
each of its users' creations look like a demo of the framework rather than a
thing its author made. BotKit should be the opposite: the bots people build
with it should feel like *theirs*. So the single most important rule in this
system is a question you ask before designing any surface:

> [!IMPORTANT]
> Whose page is this? If it belongs to a user's bot, BotKit stays quiet and
> lets the bot lead. If it belongs to BotKit, BotKit may speak in its full
> voice.

Everything else follows from that question. It gives us two modes.


Two modes
---------

### Canvas mode

*Canvas mode* is what BotKit uses when it hosts someone else's bot. It is the
neutral chrome around a bot's identity and content: quiet, modern, and
restrained, so the bot's name, avatar, chosen color, and posts are what a
visitor notices. BotKit appears only as a small, honest footer credit.

This is the mode every page the library serves is built in: profiles, post
permalinks, follower and hashtag listings, and the instance index.

### Expression mode

*Expression mode* is BotKit speaking as itself, with a confident and
distinctive identity. It is appropriate for BotKit's own surfaces: the project
homepage, documentation, marketing, and social cards. It may use an expressive
display typeface, the BotKit mark, and stronger motifs.

Expression mode is documented here as brand guidance, but it is deliberately
*not* shipped by the library and never applied to a hosted bot's pages.

### Choosing a mode

| Surface                           | Owner        | Mode                                      |
| --------------------------------- | ------------ | ----------------------------------------- |
| A bot's profile, posts, followers | The bot      | Canvas                                    |
| The multi-bot instance index      | The bot host | Canvas                                    |
| BotKit's homepage and docs        | BotKit       | Expression                                |
| A “Powered by BotKit” credit      | BotKit       | A quiet token of Expression inside Canvas |

The instance index lists a server operator's own bots, so it stays in Canvas
mode. The only place BotKit names itself on a hosted page is the footer credit,
and that is intentionally the smallest possible piece of Expression mode.


Foundations
-----------

The foundations below are shared by both modes. What differs between modes is
how boldly they are used, not the tokens themselves.

### Color

BotKit's color model is built for theming. A bot picks one accent color, and
everything else is a small set of neutral surface tokens plus tints derived
from that accent. This keeps a bot's page recognizably *its color* without
letting color turn into decoration.

The twenty accent names are the same legend Pico CSS uses, and the accent
values are taken verbatim from Pico's own themes. Reusing Pico's tuned values
means each accent already has an accessible on-surface “ink” variant for links
and an appropriate contrast color for solid fills, in both light and dark
schemes, without us re-deriving twenty palettes by hand.

The semantic tokens are the vocabulary the components speak. They never
reference a raw color directly:

~~~~ css
:root {
  /* Neutral surfaces (light scheme) */
  --bk-bg: #f5f6f7;          /* page background */
  --bk-surface: #ffffff;     /* cards and the profile */
  --bk-surface-2: #f1f2f4;   /* insets: code, inputs */
  --bk-border: #e7e8ec;      /* hairline separators */
  --bk-border-strong: #d7d9df;
  --bk-text: #1c1d21;
  --bk-muted: #5f636c;       /* secondary text */
  --bk-faint: #9095a0;       /* tertiary text, icons */

  /* Accent, resolved from the chosen theme name */
  --botkit-accent: #398712;          /* solid fills */
  --botkit-accent-contrast: #fff;    /* text on a solid fill */
  --bk-ink: var(--botkit-accent-ink); /* links, small highlights */

  /* Tints derived from the accent, never hard-coded */
  --bk-accent-soft: color-mix(in oklab, var(--botkit-accent) 9%, var(--bk-surface));
  --bk-accent-line: color-mix(in oklab, var(--botkit-accent) 40%, var(--bk-border));
}
~~~~

Each accent name is a preset that only sets the four accent variables. Two
of them, the link “ink” colors, differ between light and dark so links stay
legible on either background:

~~~~ css
[data-botkit-color="green"] {
  --botkit-accent: #398712;
  --botkit-accent-contrast: #fff;
  --botkit-accent-ink: #33790f;      /* used in light scheme */
  --botkit-accent-ink-dark: #4eb31b; /* used in dark scheme */
}
~~~~

The chosen name lives on the `<html>` element as `data-botkit-color`, so the
whole document inherits the accent. Dark scheme is handled by overriding the
neutral tokens (and switching `--bk-ink` to the dark ink) under both the OS
preference and an explicit `data-theme`:

~~~~ css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bk-bg: #0f1013;
    --bk-surface: #17181c;
    /* …remaining neutrals… */
    --bk-ink: var(--botkit-accent-ink-dark);
  }
}

[data-theme="dark"] { /* the same overrides, forced on */ }
~~~~

Because color is only ever applied through these tokens, restraint is the
default. A component that wants to be tinted opts in by naming an accent token;
everything else is neutral.

> [!NOTE]
> The one deliberate use of the accent as *atmosphere* is the profile banner
> fallback, a faint gradient of `--bk-accent-soft` shown when a bot has no
> banner image. It gives every bot a hint of its own color without asking the
> author for artwork.

### Typography

Canvas mode ships a single typeface, [Inter], used across names, body, and UI.
A quiet page does not need a display face fighting the bot's content for
attention, and one excellent, neutral, well-hinted sans covers every role when
paired with a clear type scale and deliberate weights.

~~~~ css
:root {
  --bk-font: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --bk-font-mono: ui-monospace, "SF Mono", Menlo, monospace;

  --bk-text-xs: 0.8125rem;  /* timestamps, captions */
  --bk-text-sm: 0.9rem;     /* secondary text, meta */
  --bk-text-base: 1rem;     /* body */
  --bk-text-lg: 1.15rem;    /* dialog titles */
  --bk-text-xl: 1.4rem;     /* section titles */
  --bk-text-2xl: 1.75rem;   /* the bot's name */
}
~~~~

Monospace is used only where text is literally machine data a reader might copy
(inline code inside a post). It is not a decorative texture. Weight does most
of the typographic work: names and section titles are 700, everything else is
400 to 600.

Expression mode is where a more characterful display face belongs. BotKit's own
sites pair Inter with [Space Grotesk] for headlines, used with restraint. Space
Grotesk is loaded only on those surfaces, self-hosted as woff2 rather than
pulled from a font CDN so a visitor's IP is never handed to a third party; it is
not bundled with the library and never reaches a hosted bot's pages.

[Inter]: https://rsms.me/inter/
[Space Grotesk]: https://fonts.google.com/specimen/Space+Grotesk

### Space and geometry

Spacing follows a `0.25rem` grid (`--bk-space-1` through `--bk-space-7`).
Corners are generously rounded to read as calm and contemporary rather than
sharp and technical: `--bk-radius: 16px` for cards and the profile,
`--bk-radius-sm: 10px` for nested media, and a pill radius for buttons. The
reading column is capped at `--bk-measure: 38rem` so lines stay comfortable.


Canvas mode components
----------------------

Every BotKit-owned class is namespaced `bk-` so it never collides with the
HTML inside a post. User-authored content (a post's body, a bot's summary,
a property value) is styled only within a `.bk-prose` container, so generic
element rules never leak onto the rest of the page.

### The profile header

The profile is a single rounded card: a banner, an avatar that overlaps it as
on a familiar social profile, then the name, handle, bio, optional property
list, and a meta row with the follower and post counts and the follow action.
There is no BotKit branding here at all.

~~~~ tsx
<header class="bk-profile">
  <div class="bk-banner">
    {image && <img src={image.href} alt={name} />}
  </div>
  <div class="bk-profile__body">
    <img class="bk-avatar" src={icon.href} alt={name} />
    <h1 class="bk-name"><a href="/">{name}</a></h1>
    <span class="bk-handle">
      <span class="bk-handle__text">{handle}</span>
      <button class="bk-copy" onclick="botkitCopy(this)">…</button>
    </span>
    <div class="bk-bio bk-prose" /* summary HTML */ />
    <div class="bk-meta">
      <div class="bk-counts">
        <a href="/followers"><b>{followers}</b> followers</a>
        <span><b>{posts}</b> posts</span>
      </div>
      <span class="bk-meta__spacer" />
      <FollowButton />
    </div>
  </div>
</header>
~~~~

The avatar overlap is the one piece of positioning worth noting: the avatar is
pulled up over the banner with a negative margin and lifted above it in the
stacking order.

~~~~ css
.bk-avatar {
  position: relative;   /* raise above the banner… */
  z-index: 1;           /* …so the overlap paints correctly */
  width: 92px;
  height: 92px;
  margin-top: -46px;
  border-radius: var(--bk-radius);
  border: 3px solid var(--bk-surface);
}
~~~~

### Posts and reposts

A post is a quiet card: the content, any image attachments, and a small muted
timestamp that links to the permalink. On a bot's own profile every post is the
bot's, so the author is redundant and omitted.

A reposted (boosted) post is the exception, and it must never be mistaken for
the bot's own writing. It carries an explicit “Reposted” marker and shows the
original author, following the familiar convention:

~~~~ tsx
<article class="bk-post">
  {!isSelf && (
    <>
      <div class="bk-repost"><BoostIcon /> Reposted</div>
      <div class="bk-post__author">{/* original author */}</div>
    </>
  )}
  <div class="bk-prose" /* post content */ />
  <div class="bk-attachments">{/* images */}</div>
  <div class="bk-post__foot">
    <a class="bk-post__date" href={permalink}>{formattedDate}</a>
  </div>
</article>
~~~~

`isSelf` compares the post's author to the profile's bot. When they match, the
post renders bare; when they differ, the repost marker and author appear. The
distinction is carried by structure and a single small accent-colored glyph,
not by a change of tone.

### Buttons and the follow dialog

There are two button styles: a solid `bk-btn--primary` in the accent color for
the primary action (Follow), and a bordered `bk-btn--ghost` for secondary
actions. Both are pill-shaped.

Following opens a native `<dialog>` where a visitor enters their own handle.
The dialog uses the same surface, border, and radius tokens as the rest of the
page, so it feels part of the whole rather than a system pop-up.

### Rosters, secondary headings, and the credit

Follower lists and the instance index share a `.bk-actor` card: avatar, name,
and handle in a responsive grid. Secondary pages (followers, a hashtag, a
single post) open with a `.bk-page-head`: a circular back button and a title,
with an optional count.

The footer credit is the entire BotKit presence on a hosted page:

~~~~ tsx
<footer class="bk-credit">
  Powered by <a href="https://botkit.fedify.dev/">BotKit</a>
</footer>
~~~~

It is `--bk-text-xs`, `--bk-faint`, and centered. Honest attribution, nothing
more.


Theming API
-----------

Everything above is driven by three options on `createBot({ pages })`:

`color`
:   One of the twenty accent names (default `"green"`). Sets
    `data-botkit-color` on the document.

`theme`
:   `"auto"` (default), `"light"`, or `"dark"`. `"auto"` follows the visitor's
    operating system; the others force a scheme via `data-theme`.

`css`
:   A string of custom CSS, injected after BotKit's stylesheet so it can
    override any token or rule. This is the escape hatch for a bot author who
    wants to go further than the accent allows.

~~~~ typescript
const bot = createBot({
  username: "mybot",
  pages: {
    color: "violet",
    theme: "auto",
    css: ":root { --bk-radius: 6px; }", // e.g. squarer corners
  },
});
~~~~

Because the components read tokens rather than literal colors, a small amount
of custom CSS overriding a few variables can restyle the whole page coherently.


Expression mode
---------------

Expression mode is BotKit's own voice, for BotKit's own surfaces. It is not
part of the shipped library; it is recorded here so BotKit-branded work stays
consistent.

 -  *Mark.* BotKit's mascot is a dinosaur, and the logo presents that dinosaur
    as an unassembled plastic model kit: the character sits inside a sprue
    frame, still attached to the runner by small gates, with a labeled tab in
    one corner. The “Kit” in BotKit is literal: it is a kit of parts you
    assemble into a bot. The frame doubles as the bracketed node of the earlier
    mark, evoking an addressable actor on the network. It is a brand element
    for BotKit's own surfaces and does not appear on hosted bot pages.

 -  *Type.* Expression mode pairs Inter with Space Grotesk for headlines, used
    with restraint. Where Canvas mode keeps a single quiet face, Expression mode
    is allowed one confident one.

 -  *Motif.* The sprue frame is the repeating device on BotKit's own surfaces.
    A hero presents the dinosaur on its runner as the one bold element, and a
    small gate node sitting on a hairline separates sections, echoing parts held
    on a runner (and, loosely, the edges between actors on the network). The
    project site's landing page is built from this motif.

 -  *Color.* Expression mode still draws from the same twenty-name palette, but
    may use it more boldly, including BotKit's own signature accent.

 -  *Restraint still applies.* Even in Expression mode, one bold element per
    screen carries the personality while everything around it stays disciplined.

The boundary is firm: full Expression-mode surfaces may not be introduced into
the pages the library serves for a user's bot.  The quiet footer credit is the
one deliberate exception.


Asset and packaging architecture
--------------------------------

BotKit is a library, so its design has to arrive with zero build steps on the
user's side. A bot author installs the package and gets the full front end,
fonts included, whether they run on Deno or Node.js.

The pipeline that makes this work:

 -  *Authoring sources* live under *src/css/* (the stylesheet) and *src/fonts/*
    (the woff2 files). These are not needed at runtime and are excluded from
    the published package.

 -  *A codegen step* (`mise run generate:assets`, which runs
    *scripts/build-assets.ts*) compiles the stylesheet to a minified string and
    base64-encodes the fonts, writing two committed modules under *src/static/*.

 -  *The generated modules* (*src/static/style.ts* and *src/static/fonts.ts*)
    are plain source. They ship as-is to JSR and are bundled by tsdown for npm,
    so they load identically on both runtimes with no file-system access.

Embedding the assets as source rather than shipping loose files and copying
them at build time is what keeps the “no build step” promise on both runtimes
at once: there is no path resolution, no bundler configuration, and nothing to
copy. The cost is roughly a hundred kilobytes of base64 in the package, which
is a fair price for a framework whose look arrives out of the box.

At runtime the assets are served from a content-addressed path:

~~~~ typescript
// src/assets.ts
export const ASSET_VERSION = fingerprint(`${css}|${fontFingerprint}`);
export const ASSET_PATH_PREFIX = `/.botkit/${ASSET_VERSION}`;
export const STYLESHEET_PATH = `${ASSET_PATH_PREFIX}/botkit.css`;
~~~~

The path includes a short fingerprint of the stylesheet and fonts, so the
assets can be cached forever
(`Cache-Control: public, max-age=31536000, immutable`) yet update automatically
whenever their content changes. The serving route lives next to the existing
custom-emoji handler in *instance-impl.ts* and is matched before any bot
routing, so it works for both single-bot and multi-bot hosting. The
stylesheet's `@font-face` rules reference the fonts by relative path, so they
resolve under the same fingerprinted prefix without hard-coding it.

> [!IMPORTANT]
> The generated _src/static/\*.ts_ modules are build output. Do not edit them
> by hand; edit *src/css/botkit.css* or the fonts and run
> `mise run generate:assets`.


Quality baseline
----------------

These hold everywhere, in both modes, and are not optional:

 -  *Responsive.* Layouts reflow to a single column on small screens; the
    reading column and profile adapt down to mobile widths.

 -  *Keyboard focus.* Interactive elements show a visible accent focus ring
    (`:focus-visible`), never removed.

 -  *Color scheme.* Both light and dark are first-class; `color-scheme` and a
    `theme-color` meta hint are emitted so browser chrome matches.

 -  *Contrast.* Accent “ink” and contrast values are taken from Pico's
    accessibility-tuned palette so text on tints and solid fills meets WCAG AA.

 -  *Content safety.* User HTML is confined to `.bk-prose`, so a bot's post can
    never restyle the page around it.


Extending the system
--------------------

 -  *To change a token or component,* edit *src/css/botkit.css*, run
    `mise run generate:assets`, and verify in a browser (run an example bot and
    open its profile). The content fingerprint changes automatically, so caches
    do not need manual busting.

 -  *To add or change a font,* place the woff2 in *src/fonts/*, update the
    `FONTS` list and the `@font-face` rules, and regenerate.

 -  *To add a new page,* build it from the existing `bk-` components and the
    shared `Layout`, which already supplies the reading column and the footer
    credit. Ask the ownership question first: a page the library serves is
    Canvas mode.
