# Guidelines for LLM-Powered Code Assistants

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BotKit is a TypeScript framework for creating ActivityPub bots, built on top of Fedify. It supports both Deno and Node.js environments and provides a simple API for creating standalone ActivityPub servers that function as bots.

## Development Commands

### Primary Commands (Deno-based)
- `deno task check` - Full codebase validation (type check, lint, format check, publish dry-run, version check)
- `deno task test` - Run Deno tests with network access to hollo.social
- `deno task test:node` - Run Node.js tests via pnpm
- `deno task test-all` - Run all checks and tests (check + test + test:node)
- `deno task coverage` - Generate test coverage report in HTML format

### Build Commands
- `pnpm build` - Build via npm script (runs tsdown)
- `pnpm test` - Run Node.js tests after installing dependencies

### Code Quality
- `deno lint` - Lint TypeScript code
- `deno fmt` - Format code (excludes .md, .yaml, .yml files)
- `deno fmt --check` - Check code formatting without modifying files
- `deno check src/` - Type check source files

## Architecture

### Core Module Structure
- **`src/mod.ts`** - Main entry point, re-exports all public APIs
- **`src/bot.ts`** - Core Bot interface and createBot function
- **`src/bot-impl.ts`** - Internal Bot implementation
- **`src/session.ts`** - Session management for bot operations
- **`src/message.ts`** - Message types and ActivityPub objects (Note, Article, etc.)
- **`src/events.ts`** - Event handler type definitions
- **`src/text.ts`** - Text formatting utilities (mention, hashtag, link, etc.)
- **`src/emoji.ts`** - Custom emoji handling
- **`src/reaction.ts`** - Like and reaction implementations
- **`src/repository.ts`** - Data storage abstractions
- **`src/follow.ts`** - Follow request handling

### Key Concepts
- **Bot**: The main bot instance created with `createBot()`, handles events and provides session access
- **Session**: Scoped bot operations for publishing content and managing state
- **Message**: ActivityPub objects like Note, Article, Question with rich text support
- **Repository**: Storage backend abstraction (Memory, KV-based, cached variants)
- **Event Handlers**: Functions for responding to ActivityPub activities (mentions, follows, likes, etc.)

### Build System
- Uses `tsdown` for cross-platform builds (Deno → Node.js/npm)
- Generates ESM (`dist/*.js`) and CommonJS (`dist/*.cjs`) outputs
- Creates TypeScript definitions for both (`dist/*.d.ts`, `dist/*.d.cts`)
- Includes Temporal polyfill injection for Node.js compatibility

### Testing
- Deno tests: `*.test.ts` files, run with `deno task test`
- Node.js tests: Built output tested in `dist/` directory with Node's built-in test runner
- Coverage reports available via `deno task coverage`

### Dual Runtime Support
- Primary development in Deno with `deno.json` configuration
- Node.js support via `package.json` and tsdown transpilation
- Separate import maps for each runtime (JSR for Deno, npm for Node.js)

## Development Notes

### When Running Tests
Always run the full test suite with `deno task test-all` to ensure both Deno and Node.js compatibility.

### When Making Changes
1. Run `deno task check` before committing to validate all aspects
2. The build process (`tsdown`) generates dual outputs for both runtimes
3. Tests should work in both Deno and Node.js environments
4. **Update documentation**: New features must be documented in the `docs/` directory
5. **Update changelog**: Any user-facing changes must be recorded in `CHANGES.md`

### File Organization
- Implementation files: `*-impl.ts` (internal implementations)
- Test files: `*.test.ts` (both unit and integration tests)
- Type definitions: Primarily in `events.ts` and exported through `mod.ts`
- UI components: `src/components/` for JSX/TSX files
- Documentation: `docs/` directory contains user-facing documentation
- Changelog: `CHANGES.md` records all user-facing changes
