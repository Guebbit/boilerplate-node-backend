---
source: src/infrastructure/runtime/database.ts
sha256: 14817a653caa5ab2aabe306ed0c7c455430ebbfb5e0e6db204d8a0d7493bbd01
generated_at: 2026-09-23T17:51:28.265723+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/database.ts

## Purpose

Manages the MongoDB connection lifecycle (connect, retry, disconnect) for the entire application and its operational scripts. It wraps the Mongoose singleton with a URI-resolution helper, exponential-backoff retry, and a safe shutdown path so that every consumer gets a single shared connection without duplicating retry logic.

## Key elements

- **`getDatabaseUri()`** — Resolves the MongoDB connection string from env vars. A full `NODE_DB_URI` takes precedence; otherwise it assembles `mongodb://host:port/db` from `NODE_MONGODB_HOST`, `NODE_MONGODB_PORT`, and `NODE_MONGODB_NAME` (defaulting to `boilerplate-node-backend`). An _empty_ `NODE_DB_URI` intentionally falls through to fragments (enables the `npm run host` pattern).
- **`start()`** — Connects via `mongoose.connect()` with up to 10 retries and exponential backoff (1 s → 2 s → …, clamped at 30 s). Throws after the final attempt so the boot sequence aborts. Uses explicit promise chains (no `async`/`await`). Does **not** set `autoIndex`; callers configure that before calling `start()`.
- **`stopDatabase()`** — Calls `mongoose.disconnect()` to release pooled sockets. Logs and absorbs any rejection so it never aborts the remaining shutdown chain.
- **`connection`** — Re-exports `mongoose.connection` for readiness probes and diagnostics (`readyState` 0–3). The object exists at import time; it is populated once `start()` resolves.
- **`wait(ms)`** (internal) — Promisified `setTimeout` to yield the event loop during backoff delays.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Direct import; every retry warning and disconnect failure is logged through this adapter.
- **`src/app.ts`** — `startServer` turns `autoIndex` off in production before calling `start()`; relies on the shared `connection` for the running server.
- **`scripts/db/sync-indexes.ts`** — Sets `autoIndex` to `false` before calling `start()` so index sync is explicit rather than automatic.
- **`scripts/db/bootstrap-access.ts`, `scripts/db/grant-access.ts`** — Operational scripts that call `start()` / `stopDatabase()` around their work.
- **`scripts/ops/reap-*.ts`, `scripts/ops/sweep-*.ts`** — Maintenance scripts that acquire the connection via `start()` and release it via `stopDatabase()`.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Orchestrates process lifecycle; invokes `stopDatabase()` during the shutdown sequence.
- **`src/infrastructure/runtime/database-snapshot.ts`** — Explicitly a _separate_ concern (demo-profile snapshot: empty / capture / restore). Not imported here; two callers use it independently.
- **`src/modules/account/module.ts`, `src/modules/account/services/two-factor.ts`** — Consume Mongoose models that operate over the connection established by `start()`.

## Notes

- **Mongoose is a singleton.** `import mongoose from 'mongoose'` everywhere returns the same instance; `start()` mutates global state as a side effect. Callers should not import `mongoose` directly to connect.
- **Truthiness, not `!== undefined`, on `NODE_DB_URI`.** An empty string is treated as "unset" so the `host` script can blank the URI and override only the host while keeping the DB name from `.env`. Pinned by `tests/unit/scripts/db/host-scripts.test.ts`.
- **No `autoIndex` opinion.** This module deliberately leaves it to the caller. Forgetting to set it in a new entry point will trigger automatic index creation on first connect.
- **Promise chains, not `async`/`await`.** The codebase convention is explicit `.then()` chains; `start()` uses a recursive function rather than a `for` loop to stay within that pattern.
- **Stryker markers** (`// Stryker disable all` / `restore all`) surround the logger calls in the retry and disconnect paths—mutation-testing exclusions for branches that are intentionally unreachable in happy-path coverage.
- **`connection` is safe to capture at import time.** The object reference exists before `start()` runs; only its internal state (e.g. `readyState`) changes after the connection is established.
