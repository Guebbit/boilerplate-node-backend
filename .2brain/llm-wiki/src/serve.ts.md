---
source: src/serve.ts
sha256: bbd5666c614d69d25cbb9cd818c8e533de7897f09861d8b44a21c155afdb06f1
generated_at: 2026-11-14T22:55:16.198570+00:00
model: ollama:qwen3.8:27b
---

# src/serve.ts

## Purpose

The single process entry point that calls `start()` to begin serving traffic. It exists so that "build the app" and "serve the app" are separate concerns: `createApp()` in `app.ts` remains agnostic about whether its caller wants to listen on a port, while this file is the one place that actually starts the server and wires shutdown signals.

## Key elements

- **`start` / `stop`** — obtained from `createApp()` at module load; `start` begins listening, `stop` performs graceful shutdown.
- **`registerSignalHandlers(stop)`** — hooks SIGTERM/SIGINT to invoke `stop`; described as a no-op under jest.
- **`start().catch(…)`** — kicks off listening; on failure delegates to `failBoot(error, stop)` to tear down partially-started services and exit non-zero.

## Relationships

- **`src/app.ts`** — provides `createApp()`, the sole factory for the app instance this file serves.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported purely for its side effect (setting Mongoose defaults); must execute before any model is loaded.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — supplies `registerSignalHandlers` (signal → `stop`) and `failBoot` (error → teardown + non-zero exit).

## Notes

- Import order matters: the `mongoose-boot` import is intentionally first so its side effects land before `createApp()` (transitively) loads any Mongoose models.
- `main.ts` and the worker branch of `cluster.ts` import **this file** rather than `./app` directly, so they share the same build-then-serve contract.
- Callers that build the app *without* serving (e.g. `tests/support/http.ts`, `scenarios/apply.ts`) import `createApp()` from `app.ts` and never touch this file.
