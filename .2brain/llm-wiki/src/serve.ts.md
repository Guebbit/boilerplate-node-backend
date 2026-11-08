---
source: src/serve.ts
sha256: 64e7b9614221f9e83c73267b62bf12261ed32c056416e7803f171a10b4e7eb64
generated_at: 2026-11-08T09:15:58.106070+00:00
model: ollama:qwen3.8:27b
---

# src/serve.ts

## Purpose

Process-level entry point that builds the app via `createApp()`, starts listening, and wires graceful shutdown to OS signals. Exists to separate "build the app" from "serve traffic," so callers that only need an app instance (tests, scenarios) can import `createApp` without triggering a listen or registering signal handlers.

## Key elements

- **`import '@infrastructure/runtime/mongoose-boot'`** — side-effect-only import; must execute before any Mongoose model is loaded to set connection defaults.
- **`const { start, stop } = createApp()`** — composes the application (from `src/app.ts`) and extracts the lifecycle hooks this process will drive.
- **`registerSignalHandlers(stop)`** — binds SIGTERM/SIGINT to the app's `stop` for graceful shutdown; is a no-op under Jest.
- **`void start().catch((error) => failBoot(error, stop))`** — begins listening; on boot failure, tears down whatever already came up and exits non-zero.

## Relationships

- **`src/app.ts`** — Provides `createApp()`, which returns the `{ start, stop }` pair this file drives. This file is the *only* place in production that calls `start()`.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported purely for its side effect (setting Mongoose defaults) before any model code loads. Import order relative to other imports is load-bearing.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Supplies `registerSignalHandlers` (wires SIGTERM/SIGINT to the `stop` callback) and `failBoot` (clean teardown + non-zero exit on startup failure).

## Notes

- `cluster.ts` (worker branch) and the `dev:docker` script (`tsx src/serve.ts`) both invoke this file rather than importing `./app` directly, because they need the signal handlers and boot-failure handling that live here.
- The shebang (`#!/usr/bin/env node`) makes this directly executable; the `dev:docker` path uses `tsx` instead, but the module surface is the same.
- Do not add environment-variable gates or conditional serving logic here; the file is intentionally thin and its only job is the build → start → signal-shutdown sequence.
