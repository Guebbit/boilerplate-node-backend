---
source: src/serve.ts
sha256: 64e7b9614221f9e83c73267b62bf12261ed32c056416e7803f171a10b4e7eb64
generated_at: 2026-10-15T12:29:02.265612+00:00
model: ollama:qwen3.8:27b
---

# src/serve.ts

## Purpose

The single entry point that actually starts the HTTP server. It composes the app via `createApp()`, wires the process to SIGTERM/SIGINT for graceful shutdown, and handles boot failures. It exists as a separate file so that callers that only need to *build* the app (tests, scenario scripts) never pull in the "start listening" step or any opinion about whether traffic should be served.

## Key elements

- **`createApp()` (imported, not defined here)** — called once at module top level; returns `{ start, stop }`. This is the one place `start()` is invoked in production/dev.
- **`registerSignalHandlers(stop)`** — from `server-lifecycle`; maps SIGTERM/SIGINT to the app's `stop`. Documented as a no-op under Jest.
- **`failBoot(error, stop)`** — from `server-lifecycle`; called in the `.catch` on `start()` to tear down anything that already came up and exit non-zero.
- **`import '@infrastructure/runtime/mongoose-boot'`** — imported purely for its side effect; must execute before any Mongoose model is loaded.

## Relationships

- **`src/app.ts`** — provides `createApp()`. `serve.ts` is the sole production/dev caller of its `start()`; `app.ts` itself knows nothing about serving.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported first, before `./app`, to guarantee Mongoose connection-string defaults are set before any model module registers.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — supplies both `registerSignalHandlers` (shutdown path) and `failBoot` (error path). `serve.ts` delegates all signal/error mechanics to this module rather than handling `process.on` inline.

## Notes

- The shebang (`#!/usr/bin/env node`) and the fact that `start()` is called at module scope (not behind a `main()` guard) mean importing this file *has* side effects. Callers that only need the composed app should import `./app` directly.
- Intended consumers per the doc comment: the worker branch of `cluster.ts` and the `dev:docker` script (`tsx src/serve.ts`). Both get identical build-then-serve behavior without duplicating the wiring.
- `stop` is passed to both the signal handlers and the failure path, so a mid-boot crash and a post-boot SIGTERM go through the same teardown function.
