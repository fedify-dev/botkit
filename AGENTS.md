Guidelines for LLM-powered code assistants
==========================================

This file provides guidance to LLM-powered code assistants when working
with code in this repository.


Project overview
----------------

BotKit is a TypeScript framework for creating ActivityPub bots, built on top
of Fedify.  It supports both Deno and Node.js environments and provides a
simple API for creating standalone ActivityPub servers that function as bots.


Development commands
--------------------

### Primary commands (Deno-based)

 -  `deno task check` - Full codebase validation (type check, lint, format
    check, publish dry-run, version check)
 -  `deno task test` - Run Deno tests with network access to hollo.social
 -  `deno task test:node` - Run Node.js tests via pnpm
 -  `deno task test-all` - Run all checks and tests (check + test + test:node)
 -  `deno task coverage` - Generate test coverage report in HTML format

### Build commands

 -  `pnpm build` - Build via npm script (runs tsdown)
 -  `pnpm test` - Run Node.js tests after installing dependencies

### Code quality

 -  `deno lint` - Lint TypeScript code
 -  `deno fmt` - Format code (excludes .md, .yaml, .yml files)
 -  `deno fmt --check` - Check code formatting without modifying files
 -  `deno check src/` - Type check source files

### Adding dependencies

When adding new dependencies, always check for the latest version:

 -  *npm packages*: Use `npm view <package> version` to find the latest version
 -  *JSR packages*: Use the [JSR API] to find the latest version

Always prefer the latest stable version unless there is a specific reason
to use an older version.

> [!IMPORTANT]
> Because this project supports both Deno and Node.js, dependencies must
> be added to *both* configuration files:
>
>  -  *deno.json*: Add to the `imports` field (for Deno)
>  -  *package.json*: Add to `dependencies` or `devDependencies` (for Node.js)
>
> Forgetting to add a dependency to *package.json* will cause Node.js tests
> to fail with `ERR_MODULE_NOT_FOUND`, even if Deno tests pass.

[JSR API]: https://jsr.io/docs/api


Architecture
------------

### Core module structure

 -  *src/mod.ts* - Main entry point, re-exports all public APIs
 -  *src/bot.ts* - Core Bot interface and createBot function
 -  *src/bot-impl.ts* - Internal Bot implementation
 -  *src/session.ts* - Session management for bot operations
 -  *src/message.ts* - Message types and ActivityPub objects (Note, Article,
    etc.)
 -  *src/events.ts* - Event handler type definitions
 -  *src/text.ts* - Text formatting utilities (mention, hashtag, link, etc.)
 -  *src/emoji.ts* - Custom emoji handling
 -  *src/reaction.ts* - Like and reaction implementations
 -  *src/repository.ts* - Data storage abstractions
 -  *src/follow.ts* - Follow request handling

### Key concepts

 -  *Bot*: The main bot instance created with `createBot()`, handles events
    and provides session access
 -  *Session*: Scoped bot operations for publishing content and managing state
 -  *Message*: ActivityPub objects like Note, Article, Question with rich text
    support
 -  *Repository*: Storage backend abstraction (Memory, KV-based, cached
    variants)
 -  *Event Handlers*: Functions for responding to ActivityPub activities
    (mentions, follows, likes, etc.)

### Build system

 -  Uses *tsdown* for cross-platform builds (Deno -> Node.js/npm)
 -  Generates ESM (_dist/\*.js_) and CommonJS (_dist/\*.cjs_) outputs
 -  Creates TypeScript definitions for both (_dist/\*.d.ts_, _dist/\*.d.cts_)
 -  Includes Temporal polyfill injection for Node.js compatibility

### Dual runtime support

 -  Primary development in Deno with *deno.json* configuration
 -  Node.js support via *package.json* and tsdown transpilation
 -  Separate import maps for each runtime (JSR for Deno, npm for Node.js)


Development practices
---------------------

### Test-driven development

This project follows test-driven development (TDD) practices:

 -  *Write tests first*: Before implementing new functionality, write tests
    that describe the expected behavior.  Confirm that the tests fail before
    proceeding with the implementation.
 -  *Regression tests for bugs*: When fixing bugs, first write a regression
    test that reproduces the bug.  Confirm that the test fails, then fix the
    bug and verify the test passes.

### Running tests

 -  Deno tests: `*.test.ts` files, run with `deno task test`
 -  Node.js tests: Built output tested in *dist/* directory with Node's
    built-in test runner
 -  Coverage reports available via `deno task coverage`

Always run the full test suite with `deno task test-all` to ensure both Deno
and Node.js compatibility.

### When making changes

1.  Run `deno task check` before committing to validate all aspects
2.  The build process (*tsdown*) generates dual outputs for both runtimes
3.  Tests should work in both Deno and Node.js environments
4.  *Update documentation*: New features must be documented in the *docs/*
    directory
5.  *Update changelog*: Any user-facing changes must be recorded in
    *CHANGES.md*

### Commit messages

 -  Do not use Conventional Commits (no `fix:`, `feat:`, etc. prefixes).
    Keep the first line under 50 characters when possible.

 -  Focus on *why* the change was made, not just *what* changed.

 -  When referencing issues or PRs, use permalink URLs instead of just
    numbers (e.g., `#123`).  This preserves context if the repository
    is moved later.

 -  When listing items after a colon, add a blank line after the colon:

    ~~~~
    This commit includes the following changes:

    - Added foo
    - Fixed bar
    ~~~~

 -  When using LLMs or coding agents, include credit via `Co-Authored-By:`.
    Include a permalink to the agent session if available.

### Changelog (*CHANGES.md*)

This repository uses *CHANGES.md* as a human-readable changelog.  Follow
the same overall structure and writing style:

 -  *Structure*: Keep entries in reverse chronological order (newest version
    at the top).

 -  *Version sections*: Each release is a top-level section:

    ~~~~
    Version 0.1.0
    -------------
    ~~~~

 -  *Unreleased version*: The next version should start with:

    ~~~~
    To be released.
    ~~~~

 -  *Released versions*: Use a release-date line right after the version
    header:

    ~~~~
    Released on December 30, 2025.
    ~~~~

 -  *Package grouping*: Within a version, group entries by package using
    `###` headings (e.g., `### @fedify/botkit`).

 -  *Bullets and wrapping*: Use ` -  ` list items, wrap around ~80 columns,
    and indent continuation lines by 4 spaces so they align with the bullet
    text.

 -  *Multi-paragraph items*: For longer explanations, keep paragraphs inside
    the same bullet item by indenting them by 4 spaces and separating
    paragraphs with a blank line (also indented).

 -  *Code blocks in bullets*: If a bullet includes code, indent the entire
    code fence by 4 spaces so it remains part of that list item.  Use `~~~~`
    fences and specify a language (e.g., `~~~~ typescript`).

 -  *Nested lists*: If you need sub-items (e.g., a list of added exports),
    use a nested list inside the parent bullet, indented by 4 spaces.

 -  *Issue and PR references*: Use `[[#123]]` markers in the text and add
    reference links at the end of the relevant package subsection.

    When the reference is for a PR authored by an external contributor,
    append `by <NAME>` after the last reference marker
    (e.g., `[[#123] by Hong Minhee]`).

    ~~~~
    [#123]: https://github.com/fedify-dev/botkit/issues/123
    [#124]: https://github.com/fedify-dev/botkit/pull/124
    ~~~~

### File organization

 -  Implementation files: `*-impl.ts` (internal implementations)
 -  Test files: `*.test.ts` (both unit and integration tests)
 -  Type definitions: Primarily in *events.ts* and exported through *mod.ts*
 -  UI components: *src/components/* for JSX/TSX files
 -  Documentation: *docs/* directory contains user-facing documentation
 -  Changelog: *CHANGES.md* records all user-facing changes


Code style
----------

### Type safety

 -  All code must be type-safe.  Avoid using the `any` type.
 -  Do not use unsafe type assertions like `as unknown as ...` to bypass
    the type system.
 -  Prefer immutable data structures unless there is a specific reason to
    use mutable ones.  Use `readonly T[]` for array types and add the
    `readonly` modifier to all interface fields.
 -  Use the nullish coalescing operator (`??`) instead of the logical OR
    operator (`||`) for default values.

### Async patterns

 -  All async functions must accept an `AbortSignal` parameter to support
    cancellation.

### API documentation

 -  All exported APIs must have JSDoc comments describing their purpose,
    parameters, and return values.

 -  For APIs added in a specific version, include the `@since` tag with the
    version number:

    ~~~~ typescript
    /**
     * Translates the given text to the target language.
     *
     * @param text The text to translate.
     * @param targetLanguage The target language code.
     * @returns The translated text.
     * @since 1.2.3
     */
    export function translate(text: string, targetLanguage: string): string {
      // ...
    }
    ~~~~

### Testing

 -  Use the `node:test` and `node:assert/strict` APIs to ensure tests run
    across all runtimes (Node.js and Deno).
 -  Avoid the `assert.equal(..., true)` or `assert.equal(..., false)` patterns.
    Use `assert.ok(...)` and `assert.ok(!...)` instead.

### Error messages

 -  Prefer specific error types over generic `Error`.  Use built-in types
    like `TypeError`, `RangeError`, or `SyntaxError` when appropriate.
    If none of the built-in types fit, define and export a custom error class:

    ~~~~ typescript
    // Good: specific error type
    throw new TypeError("Expected a string.");
    throw new RangeError("Index out of bounds.");

    // Good: custom error class (must be exported)
    export class BotKitError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "BotKitError";
      }
    }

    // Avoid: generic Error when a more specific type applies
    throw new Error("Expected a string.");
    ~~~~

 -  End error messages with a period:

    ~~~~ typescript
    throw new Error("Translation did not complete.");
    throw new Error("Invalid model configuration.");
    ~~~~

 -  When the message ends with a value after a colon, the period can be
    omitted:

    ~~~~ typescript
    throw new Error(`Failed to load file: ${filePath}`);
    throw new Error(`Unsupported media type: ${mediaType}`);
    ~~~~

 -  Functions or methods that throw exceptions must include the `@throws` tag
    in their JSDoc comments:

    ~~~~ typescript
    /**
     * Parses a model string into provider and model ID.
     *
     * @param modelString The model string in "provider:model" format.
     * @returns The parsed provider and model ID.
     * @throws {SyntaxError} If the model string format is invalid.
     */
    export function parseModelString(modelString: string): ParsedModel {
      // ...
    }
    ~~~~

### Log messages

 -  This project uses [LogTape] for logging.  Refer to the
    [LogTape LLM documentation] for detailed usage.

 -  Use [structured logging] with LogTape instead of string interpolation:

    ~~~~ typescript
    // Good: structured logging with placeholders
    logger.info("Processing chunk {index} of {total}...", { index: 3, total: 10 });
    logger.debug("Selected model: {model}", { model: "gpt-4o" });

    // Bad: string interpolation
    logger.info(`Processing chunk ${index} of ${total}...`);
    ~~~~

 -  End log messages with a period, or with an ellipsis (`...`) for ongoing
    operations:

    ~~~~ typescript
    logger.info("Translation completed successfully.", { chunks: 5 });
    logger.info("Starting translation...");
    logger.debug("Gathering context from sources...");
    ~~~~

 -  When the message ends with a value after a colon, the period can be
    omitted:

    ~~~~ typescript
    logger.debug("Selected model: {model}", { model });
    logger.error("Connection failed with status: {status}", { status: 503 });
    ~~~~

[LogTape]: https://logtape.org/
[LogTape LLM documentation]: https://logtape.org/llms.txt
[structured logging]: https://logtape.org/manual/struct


Writing style
-------------

When writing documentation in English:

 -  Documentation under *docs/* is not mechanically formatted.
    `deno fmt` intentionally excludes Markdown and the *docs/* directory, so
    follow the rules below manually.
 -  Use sentence case for titles and headings (capitalize only the first word
    and proper nouns), not Title Case.
 -  Use curly quotation marks ("like this") for quotations in English prose.
    Use straight apostrophes (like this: '...') for contractions and
    possessives.
 -  Use *italics* for emphasis rather than **bold**.  Do not overuse emphasis.
 -  Avoid common LLM writing patterns: overusing em dashes, excessive emphasis,
    compulsive summarizing and categorizing, and rigid textbook-like structure
    at the expense of natural flow.


Markdown style guide
--------------------

When creating or editing Markdown documentation files in this project,
follow these style conventions to maintain consistency with existing
documentation:

### Headings

 -  *Setext-style headings*: Use underline-style for the document title
    (with `=`) and sections (with `-`):

    ~~~~
    Document title
    ==============

    Section name
    ------------
    ~~~~

 -  *ATX-style headings*: Use only for subsections within a section:

    ~~~~
    ### Subsection name
    ~~~~

 -  *Heading case*: Use sentence case (capitalize only the first word and
    proper nouns) rather than Title Case:

    ~~~~
    Development commands    <- Correct
    Development Commands    <- Incorrect
    ~~~~

### Text formatting

 -  *Italics* (`*text*`): Use for package names (*@fedify/botkit*),
    emphasis, and to distinguish concepts
 -  *Bold* (`**text**`): Use sparingly for strong emphasis
 -  *Inline code* (`` `code` ``): Use for code spans, function names,
    filenames, and command-line options

### Lists

 -  Use ` -  ` (space-hyphen-two spaces) for unordered list items

 -  Indent nested items with 4 spaces

 -  Align continuation text with the item content:

    ~~~~
     -  *First item*: Description text that continues
        on the next line with proper alignment
     -  *Second item*: Another item
    ~~~~

### Code blocks

 -  Use four tildes (`~~~~`) for code fences instead of backticks

 -  Always specify the language identifier:

    ~~~~~
    ~~~~ typescript
    const example = "Hello, world!";
    ~~~~
    ~~~~~

 -  For shell commands, use `bash`:

    ~~~~~
    ~~~~ bash
    deno test
    ~~~~
    ~~~~~

### Links

 -  Use reference-style links placed at the *end of each section*
    (not at document end)

 -  Format reference links with consistent spacing:

    ~~~~
    See the [Fedify documentation] for more details.

    [Fedify documentation]: https://fedify.dev/
    ~~~~

### GitHub alerts

Use GitHub-style alert blocks for important information:

 -  *Note*: `> [!NOTE]`
 -  *Tip*: `> [!TIP]`
 -  *Important*: `> [!IMPORTANT]`
 -  *Warning*: `> [!WARNING]`
 -  *Caution*: `> [!CAUTION]`

Continue alert content on subsequent lines with `>`:

~~~~
> [!CAUTION]
> This feature is experimental and may change in future versions.
~~~~

### Tables

Use pipe tables with proper alignment markers:

~~~~
| Package          | Description                   |
| ---------------- | ----------------------------- |
| @fedify/botkit   | Core BotKit framework         |
~~~~

### Spacing and line length

 -  Wrap lines at approximately 80 characters for readability
 -  Use one blank line between sections and major elements
 -  Use two blank lines before Setext-style section headings
 -  Place one blank line before and after code blocks
 -  End sections with reference links (if any) followed by a blank line


VitePress documentation
-----------------------

The *docs/* directory contains VitePress documentation with additional
features beyond standard Markdown.

### Twoslash code blocks

Use the `twoslash` modifier to enable TypeScript type checking and hover
information in code blocks:

~~~~~
~~~~ typescript twoslash
import { createBot } from "@fedify/botkit";

const bot = createBot({ handle: "mybot" });
~~~~
~~~~~

### Fixture variables

When code examples need variables that shouldn't be shown to readers,
declare them *before* the `// ---cut-before---` directive.  Content before
this directive is compiled but hidden from display:

~~~~~
~~~~ typescript twoslash
const longDocument: string = "";
// ---cut-before---
import { createBot } from "@fedify/botkit";

const bot = createBot({ handle: "mybot" });
~~~~
~~~~~

The reader sees only the code after `---cut-before---`, but TypeScript
checks the entire block including the hidden fixture.

For functions that need to exist but shouldn't be shown, use `declare`:

~~~~~
~~~~ typescript twoslash
declare function fetchData(): Promise<string>;
// ---cut-before---
import { createBot } from "@fedify/botkit";

const data = await fetchData();
~~~~
~~~~~

### Definition lists

VitePress supports definition lists for documenting terms, options,
or properties:

~~~~
`handle`
:   The bot's handle (username)

`name`
:   The bot's display name

`icon`
:   URL to the bot's profile icon
~~~~

This renders as a formatted definition list with the term on one line
and the description indented below.

### Code groups

Use code groups to show the same content for different package managers
or environments:

~~~~~
::: code-group

~~~~ bash [Deno]
deno add jsr:@fedify/botkit
~~~~

~~~~ bash [npm]
npm add @fedify/botkit
~~~~

~~~~ bash [pnpm]
pnpm add @fedify/botkit
~~~~

:::
~~~~~

### Links

 -  *Internal links*: When linking to other VitePress documents within
    the *docs/* directory, use inline link syntax (e.g.,
    `[text](./path/to/file.md)`) instead of reference-style links.
 -  *Relative paths*: Always use relative paths for internal links.
 -  *File extensions*: Include the `.md` extension in internal link paths.

### Building documentation

~~~~ bash
cd docs
pnpm build    # Build for production (runs Twoslash type checking)
pnpm dev      # Start development server
~~~~

Always run `pnpm build` before committing to catch Twoslash type errors.
