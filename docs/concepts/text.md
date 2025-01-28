---
description: >-
  The Text object is a mini-language for representing rich text formatting
  commonly used in the fediverse.  Learn how to format your text using the Text
  object.
---

Text
====

The `Text` object is a mini-language for representing rich text formatting
commonly used in the fediverse.  For example, you can [emphasize](#emphases)
some part of the text, or include a [mention](#mentions) to another fediverse
account.


Blocks and inlines
------------------

The `Text` object consists of two types of elements: blocks and inlines.
Type-wise they are represented by the `Text<"block">` and `Text<"inline">`.[^1]
Blocks are usually used for [paragraphs](#paragraphs), and inlines are used for
formatting constructs like [emphases](#emphases) or [links](#links).

The distinction between blocks and inlines is important because some formatting
constructs are only allowed in blocks or inlines.  For example, you cannot
include a paragraph inside an emphasis construct.  Since the concept of blocks
and inlines corresponds to the same concept in the HTML, you can think of them
as the `<div>` and `<span>` elements in the HTML, respectively.

The parameters that take the `Text` object, such as `Session.publish()` method
or [`createBot()` function's `summary`
parameter](./bot.md#createbotoptions-summary), are usually of the type
`Text<"block">`.  The simplest way to create a `Text<"block">` object is to
use the `text()` template string tag, which we will discuss in the right next
section.

[^1]: More precisely, the `Text` type has two type parameters: the first one
      is the type of the element: `"block"` or `"inline"`, and the second one
      is [`TContextData`], the [Fedify context data].

[`TContextData`]: https://fedify.dev/manual/federation#tcontextdata
[Fedify context data]: https://fedify.dev/manual/context


Template string tag
-------------------

First of all, BotKit provides a template string tag `text()` to format your
text.  Here's how you can use it:

~~~~ typescript
import { text } from "@fedify/botkit";

const yourText = text`Your text goes here!`;  // [!code highlight]
~~~~

For example, if you want to publish a [message](./message.md) with the text
<q>Hello, **world**!</q> to the fediverse, you can write:

~~~~ typescript
import { strong, text } from "@fedify/botkit";
import { bot } from "./bot.ts";  // A hypothetical bot object

const session = bot.getSession("https://mydomain");
await session.publish(
  text`Hello, ${strong("world")}!`  // [!code highlight]
);
~~~~

As you can see in the example above, you can compose other `Text` objects
together using the template string tag.  In this document, we will discuss
various formatting constructs that you can use in the `Text` object.


Interpolation
-------------

You can put any JavaScript object inside the `${}` interpolation.
Those objects will be expanded or converted to a string according to their
types:

### `Text` object

If you put another `Text` object inside the interpolation, it will be
concatenated to the parent `Text` object.  For example:

~~~~ typescript
text`Hello, ${em("world")}.`
~~~~

The above code will create a text like this:

> Hello, _world_.

There are other formatting constructs that you can use in the `Text` object.
See the below sections for more information.

> [!NOTE]
> Although you can put a block object, it will close the current paragraph and
> start a new block.  For example:
>
> ~~~~ typescript
> text`Hello! ${text`This is a new paragraph.`}`
> ~~~~
>
> The above code will create two paragraphs like this:
>
> > Hello!
> > 
> > This is a new paragraph.
>
> If you put a block object at the boundary of the block, it will work as
> expected.  For example:
>
> ~~~~ typescript
> text`Hello!\n\n${text`This is a new paragraph.`}\n\nThis is the last paragraph.`
> ~~~~
>
> The above code will create three paragraphs like this:
>
> > Hello!
> >
> > This is a new paragraph.
> >
> > This is the last paragraph.

### `Actor` object

If you put an `Actor` object (provided by Fedify) inside the interpolation,
it will be rendered as a mention.  For example:

~~~~ typescript
text`Hello, ${message.actor}.`
~~~~

The above code will create a text like this:

> Hello, [@fedify@hollo.social](https://hollo.social/@fedify).

### `URL` object

If you put a `URL` object inside the interpolation, it will be rendered as a
link.  For example:

~~~~ typescript
text`Here's a link: ${new URL("https://botkit.fedify.dev/")}.`
~~~~

The above code will create a text like this:

> Here's a link: <https://botkit.fedify.dev/>.

### Anything else

If you put any other JavaScript object inside the interpolation, it will be
converted to a string—it's the same as calling `String()` on the object.
For example:

~~~~ typescript
text`The number is ${42}.`
~~~~

The above code will create a text like this:

> The number is 42.

If an interpolated string has line breaks, they will be preserved in the text.
For example:

~~~~ typescript
text`Here's a multiline text:

${"First line.\nSecond line."}`
~~~~

The above code will create a text like this:

> Here's a multiline text:
>
> First line.  
> Second line.

> [!NOTE]
> Even if you put an HTML string inside the interpolation, it will be escaped
> automatically:
>
> ~~~~ typescript
> text`The following HTML will be escaped: ${"<strong>bold</strong>"}.`
> ~~~~
>
> The above code will create a text like this:
>
> > The following HTML will be escaped: &lt;strong&gt;bold&lt;/strong&gt;.
>
> Only way to format the text is to use the formatting constructs described in
> the following sections.


Paragraphs
----------

The `text()` template string tag creates a block `Text` object.

You can create a paragraph by simply writing a text.  If you want to create
multiple paragraphs, you can split them with two or more consecutive line
breaks.  For example:

~~~~ typescript
text`This is the first paragraph.

This is the second paragraph.\n\nThis is the last paragraph.`
~~~~

The above code will create three paragraphs like this:

> This is the first paragraph.
>
> This is the second paragraph.
>
> This is the last paragraph.

Paragraphs are separated by the `<p>` HTML element.


Hard line breaks
----------------

If you want to insert a hard line break, put a single line break (`\n`)
between the lines.  For example:

~~~~ typescript
text`This is the first line of the first paragraph.
This is the second line of the first paragraph.

This is the second paragraph.`
~~~~

The above code will create two paragraphs like this:

> This is the first line of the first paragraph.  
> This is the second line of the first paragraph.
>
> This is the second paragraph.

It corresponds to the `<br>` HTML element.


Emphases
--------

BotKit provides two kinds of emphasis: `strong()` emphasizes which is usually
rendered as **bold**, and `em()` emphasizes which is usually rendered as
_italic_.  Both are inlines, so you can put them inside the interpolation.
For example:

~~~~ typescript
text`You can emphasize ${strong("this")} or ${em("this")}!`
~~~~

The above code will create a text like this:

> You can emphasize **this** or _this_!

You can nest the emphasis constructs:

~~~~ typescript
text`You can emphasize ${strong(em("this"))}!`
~~~~

The above code will create a text like this:

> You can emphasize **_this_**!


Links
-----

You can make a link to a URL by using the `link()` function.  It returns
an inline `Text` object that represents a link.  For example:

~~~~ typescript
text`Here's a link: ${link("https://fedify.dev/")}.`
~~~~

The above code will create a text like this:

> Here's a link: <https://fedify.dev/>.

You can customize the label of the link if you provide two arguments:

~~~~ typescript
text`Here's a link: ${link("Fedify", "https://fedify.dev/")}.`
~~~~

The above code will create a text like this:

> Here's a link: [Fedify](https://fedify.dev/).

The label can have other formatting constructs:

~~~~ typescript
text`Here's a link: ${link(em("Fedify"), "https://fedify.dev/")}.`
~~~~

The above code will create a text like this:

> Here's a link: [_Fedify_](https://fedify.dev/).


Mentions
--------

You can mention another fediverse account by using the `mention()` function.
It returns an inline `Text` object that represents a mention.  For example:

~~~~ typescript
text`Hello, ${mention("@fedify@hollo.social")}!`
~~~~

The above code will create a text like this:

> Hello, [@fedify@hollo.social](https://hollo.social/@fedify)!

Or you can mention an account by its actor URI:

~~~~ typescript
text`Hello, ${mention(new URL("https://hollo.social/@fedify"))}!`
~~~~

The result is equivalent to the previous example:

> Hello, [@fedify@hollo.social](https://hollo.social/@fedify)!

You can customize the label of the mention:

~~~~ typescript
text`Hello, ${mention("Fedify", new URL("https://hollo.social/@fedify"))}!`
~~~~

The above code will create a text like this:

> Hello, [Fedify](https://hollo.social/@fedify)!

> [!NOTE]
> The `mention()` construct does not only format the text but also notifies
> the mentioned account.  The mentioned account will receive a notification
> about the mention.  If you want to just link to the account without
> notifying, use the `link()` construct instead.


Hashtags
--------

You can include a hashtag in the text using the `hashtag()` function.
It is an inline construct.  For example:

~~~~ typescript
text`Here's a hashtag: ${hashtag("#BotKit")}.`
~~~~

The above code will create a text like this:

> Here's a hashtag: [#BotKit](https://mastodon.social/tags/botkit).

It does not matter if you put the leading `"#"` or not.  The `hashtag()`
function will add the leading `"#"` if it is not present.  For example:

~~~~ typescript
text`Here's a hashtag: ${hashtag("BotKit")}.`
~~~~

The result is equivalent to the previous example:

> Here's a hashtag: [#BotKit](https://mastodon.social/tags/botkit).

> [!NOTE]
> The `hashtag()` function does not only format the hashtag but also denotes
> the hashtag so that ActivityPub software can recognize it as a hashtag.
> The hashtag will be searchable in the fediverse (some software may search it
> only from public messages though).  If you want to just link to the hashtag
> without denoting it, use the `link()` construct instead.


Code
----

You can include a code in the text using the `code()` function,
which is usually rendered as monospaced font.  It is an inline construct.
For example:

~~~~ typescript
text`Here's a code: ${code("console.log('Hello, world!')")}.`
~~~~

The above code will create a text like this:

> Here's a code: `console.log('Hello, world!')`.

> [!CAUTION]
> It is not a code block, but an inline code.


Markdown
--------

Sometimes you have a Markdown text and want to render it as a `Text` object.
You can use the `markdown()` function to convert the Markdown text to the `Text`
object.  It is a block construct.  For example:

~~~~ typescript
markdown(`
Here's a Markdown text.

- I can have a list.
- I can have a **bold** text.
- I can have an _italic_ text.
`)
~~~~

The above code will create a text like this:

> Here's a Markdown text.
>
>  -  I can have a list.
>  -  I can have a **bold** text.
>  -  I can have an _italic_ text.

You can also put the `markdown()` function inside the interpolation:

~~~~ typescript
text`The following is a Markdown text: 

${markdown(`
Here's a Markdown text.

- I can have a list.
- I can have a **bold** text.
- I can have an _italic_ text.
`)
`
~~~~

The above code will create a text like this:

> The following is a Markdown text:
>
> Here's a Markdown text.
>
> -  I can have a list.
> -  I can have a **bold** text.
> -  I can have an _italic_ text.

Besides the standard Markdown syntax, the `markdown()` function also supports
the following mentioning syntax for the fediverse:

~~~~ typescript
markdown(`Hello, @fedify@hollo.social!`)
~~~~

The above code will create a text like this:

> Hello, [@fedify@hollo.social](https://hollo.social/@fedify)!

> [!NOTE]
> The `markdown()` function does not only format the mention but also notifies
> the mentioned account.  The mentioned account will receive a notification
> about the mention.  If you want to just link to the account without
> notifying, use the normal link syntax instead:
>
> ~~~~ typescript
> markdown(`Hello, [@fedify@hollo.social](https://hollo.social/@fedify)!`)
> ~~~~ 

If you want `@`-syntax to be treated as a normal text, turn off the syntax
by setting the `mentions` option to `false`:

~~~~ typescript
markdown(`Hello, @fedify@hollo.social!`, { mentions: false })
~~~~

The above code will create a text like this:

> Hello, @fedify@hollo.social!

> [!NOTE]
> The `markdown()` function does not support raw HTML syntax.


Determining if the text mentions an account
-------------------------------------------

You can determine if the text mentions an account by using the `mentions()`
function.  It returns `true` if the text mentions the account,
otherwise `false`:

~~~~ typescript
import { type Actor, markdown, mention, mentions, text } from "@fedify/botkit";

const actor: Actor = getActor(  // A hypothetical function that returns an Actor object
  "@fedify@hollo.social"
);
const actor2: Actor = getActor("@another@example.com");

const md = markdown("Hello, @fedify@hollo.social!");
console.log(await mentions(md, actor));  // true
console.log(await mentions(md, actor2));  // false

const txt = text`Hi, ${actor2}!`
console.log(await mentions(txt, actor));  // false
console.log(await mentions(txt, actor2));  // true

const noMention = text`Hello, world!`;
console.log(await mentions(noMention, actor));  // false
console.log(await mentions(noMention, actor2));  // false
~~~~
