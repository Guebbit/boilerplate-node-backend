---
source: scripts/db/cache-clear.ts
sha256: d2274a004e485a09540715489af05a334d56d399dced6bd4c8e3eeb0220afe86
generated_at: 2026-10-29T01:32:33.093532+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/cache-clear.ts

## Purpose

Clears every cached response that belongs to this app (scoped by `NODE_REDIS_CACHE_PREFIX`) without touching other keys in a shared Redis. It exists because writes that bypass the API (e.g. `scenario:apply`, `mongosh`, ad-hoc scripts) skip the API's automatic cache invalidation, leaving stale responses until TTL expiry.

## Key elements

- **`runScript(undefined, fn, stopCache)`** — wraps the main logic in the shared script harness. The `undefined` first arg means "no Mongo connection, no outcome recording." `stopCache()` is passed as the cleanup callback.
- **`clearCache()`** (from `@infrastructure/adapters/cache`) — returns `{ deleted, reachable }`. This script treats `reachable === false` as a hard error, throwing a descriptive `Error` so the process exits non-zero.
- **`logger.info(...)`** — logs the number of keys removed on success.

## Relationships

- **`scripts/run-script.ts`** — provides the `runScript` wrapper (process-exit-code convention, cleanup callback). This script never opens Mongo, so the first argument is `undefined`.
- **`src/infrastructure/adapters/cache.ts`** — source of `clearCache` and `stopCache`. The adapter's default "fail open" behaviour (return `{ deleted: 0, reachable: false }`) is overridden here by an explicit reachability check.
- **`src/infrastructure/adapters/logger.ts`** — provides the structured `logger` used for the success message.
- **`src/infrastructure/config/dotenv.ts`** — side-effect import that loads `.env` before any Redis client is constructed (supplies `NODE_REDIS_CACHE_PREFIX`).

## Notes

- **Fail-closed inversion:** `clearCache` is designed to fail open (for a seeder that tolerates a missing cache). This script inverts that: an unreachable Redis is treated as a fatal failure, not a "0 keys removed" success.
- **Never `FLUSHALL`:** clearing is always scoped to the app's key prefix, making it safe against a shared Redis instance.
- **`scenario:apply` calls this automatically;** run `npm run db:cache:clear` (or `npm run host -- db:cache:clear` for localhost) after any other manual DB surgery.
- The `void runScript(...)` + eslint-disable is intentional: `runScript` reports failure via `process.exitCode` and never rejects, so the floating promise is safe.
