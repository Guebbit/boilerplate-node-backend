---
source: src/cluster.ts
sha256: 9e6439b95fa1922e317bdac3f356d33aea4c6417cf6b238e569881de3bcf05fb
generated_at: 2026-09-27T14:03:40.200545+00:00
model: ollama:qwen3.8:27b
---

# src/cluster.ts

## Purpose

The repository's production entry point (per `package.json`). It guarantees OTel tracing initializes before the application module loads, then either runs as a **cluster primary** (forking workers, managing respawn with backoff, and coordinating graceful shutdown) or as a **cluster worker** (dynamically importing `./serve` to boot the HTTP app).

## Key elements

- **`startTracing()`** — called immediately after `dotenv/config` and the `otel-sdk` import; must precede any other module side-effects.
- **`CLUSTER_ENABLED`** — `environmentFlag('NODE_ENABLE_CLUSTERING', false)`; gates the primary branch.
- **Primary block** (`cluster.isPrimary && CLUSTER_ENABLED`):
  - Forks `workerTarget(...)` workers (resolved from `NODE_CLUSTER_WORKERS` + `os.availableParallelism()`).
  - On worker `exit`: decides whether to respawn via `shouldRespawn` + `crashVerdict` (exponential backoff, crash-window limit). Gives up after `DEFAULT_CRASH_LIMIT` crashes in the window.
  - `startPrimaryShutdown(signal)` — SIGTERM all workers, force-KILL after `shutdownTimeoutMs`, sets `process.exitCode`.
  - Listens for `SIGTERM` / `SIGINT` to trigger coordinated shutdown.
- **Worker branch** (`else`): `void import('./serve')` — side-effect-only dynamic import that builds and starts the Express + Mongoose app.
- **Constants** (`DEFAULT_CRASH_WINDOW_MS`, `DEFAULT_CRASH_BACKOFF_BASE_MS`, `DEFAULT_CRASH_BACKOFF_MAX_MS`, `DEFAULT_SHUTDOWN_TIMEOUT_MS`, `DEFAULT_CRASH_LIMIT`) — fallbacks for the corresponding `NODE_CLUSTER_*` env vars.

## Relationships

- **`src/infrastructure/runtime/otel-sdk.ts`** — imports `startTracing`; called before any app module loads so OTel can intercept subsequent requires.
- **`src/infrastructure/runtime/environment.ts`** — imports `environmentFlag` and `environmentNumber` to read all `NODE_CLUSTER_*` and `NODE_ENABLE_CLUSTERING` settings.
- **`src/infrastructure/runtime/cluster-policy.ts`** — imports `workerTarget` (how many workers to fork) and `crashVerdict` (backoff / give-up decision on crash).
- **`src/infrastructure/adapters/logger.ts`** — imports `logger` for structured info/warn/error logging of fork, exit, shutdown, and crash-loop events.

## Notes

- **Import-order is load-bearing.** `dotenv/config` must be the *first* import so `.env` is in `process.env` before `environmentNumber`/`environmentFlag` are called. `startTracing()` must run before any static import of the app, because ES module hoisting would otherwise execute `app`'s top-level code (Express, Mongoose) before tracing is active. The worker therefore uses a **dynamic** `import('./serve')` to avoid hoisting.
- **`process.exitCode ??= 0`** on the last-worker-exited path: a crash-loop or forced shutdown may already have set the code to `1`; `??=` prevents the clean-exit from overwriting that failure signal.
- The file is heavily annotated with `// Stryker disable next-line all` comments, indicating it is covered by mutation testing; do not remove those markers when editing.
- `respawnTimers` are `.unref()`'d so they don't keep the event loop alive during shutdown.
