---
source: src/serve.ts
sha256: d1ee68dfe1518098fa28e83c700fad07efddc411583b24c52fe5b0f92c57d0b2
generated_at: 2026-09-27T15:47:07.889548+00:00
model: ollama:qwen3.8:27b
---

# src/serve.ts

## Purpose

Thin, executable entry point (shebang) that is the single caller of `start()` (SK-D2). It builds the app via `createApp()`, registers signal handlers for graceful shutdown, and begins listening. It exists so that "build" and "serve" live in separate files, keeping `createApp` agnostic of whether the calling process actually wants to serve traffic.

## Key elements

- **`createApp()` call** — destructures `{ start, stop }` from the app factory in `./app`.
- **`registerSignalHandlers(stop)`** — wires OS process signals (SIGTERM/SIGINT, etc.) to the app's `stop` routine.
- **`void start().catch((error) => failBoot(error, stop))`** — kicks off listening; on failure, delegates to `failBoot` for a clean abort (logs + shutdown).
- **Module-level IIFE-style execution** — the file runs top-to-bottom on import; there is no exported API, no conditional branching.

## Relationships

- **`src/app.ts`** — `src/serve.ts` imports `createApp` from it and is the primary runtime consumer of that factory. `app.ts` knows nothing about serving.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — supplies `registerSignalHandlers` (signal → `stop` wiring) and `failBoot` (structured failure path that still calls `stop`). `serve.ts` delegates all lifecycle bookkeeping to this module.

## Notes

- Two other callers of `createApp` deliberately **do not** serve: `tests/support/http.ts` and `scenarios/apply.ts`. The file split means neither needs an env-var flag to opt out.
- `cluster.ts`'s worker branch imports **this file** rather than `./app` directly, and `dev:docker` runs it via `tsx src/serve.ts` as a single-process hot-reload loop. Both rely on the guarantee that this file does *build → listen → graceful-shutdown* with no side effects beyond that.
- The `void` before `start()` is intentional: the Promise is fire-and-forget at the top level; the `.catch` is the sole error sink. There is no unhandled-rejection safety net beyond `failBoot`.
