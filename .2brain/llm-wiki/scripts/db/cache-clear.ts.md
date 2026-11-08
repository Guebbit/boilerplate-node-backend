---
source: scripts/db/cache-clear.ts
sha256: d2274a004e485a09540715489af05a334d56d399dced6bd4c8e3eeb0220afe86
generated_at: 2026-11-08T02:45:36.227168+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/cache-clear.ts

## Purpose
Clears every cached response for this app from Redis. It exists because writes that bypass the API (manual DB surgery, `mongosh` sessions, one-off scripts) skip the API's automatic `invalidateCache` middleware, leaving stale responses served until TTL expiry. `scenario:apply` invokes it automatically; run by hand after any manual database change.

## Key elements

- **`runScript(undefined, action, cleanup)`** — entry point. The `undefined` first arg means no Mongo connection is opened (this script has no other reason to hold one). The `action` callback does the work; the `cleanup` callback calls `stopCache()` to close the Redis connection.
- **`clearCache()`** (from the cache adapter) — deletes all keys under the app's Redis prefix. Returns `{ deleted, reachable }`.
- **`stopCache()`** (from the cache adapter) — closes the Redis connection; passed as the cleanup callback.
- **Reachability guard** — if `reachable` is `false`, the script throws, treating an unreachable Redis as a hard failure rather than a silent no-op.
- **`logger.info`** — prints the count of removed keys on success.

## Relationships

- **`scripts/run-script.ts`** — provides `runScript`, which manages process lifecycle, exit codes, and the cleanup callback. This script never rejects the promise (failure is reported via `process.exitCode`), hence the floating-promise eslint disable.
- **`src/infrastructure/adapters/cache.ts`** — source of `clearCache` and `stopCache`. `clearCache` is scoped to `NODE_REDIS_CACHE_PREFIX` (never `FLUSHALL`), making it safe on a shared Redis instance.
- **`src/infrastructure/adapters/logger.ts`** — structured logging for the success message.
- **`src/infrastructure/config/dotenv.ts`** — loads environment variables (Redis host, prefix, etc.) before the cache adapter connects.

## Notes

- `clearCache` is designed to *fail open* (return `reachable: false` rather than throw) so the seeder can proceed without Redis. This script deliberately inverts that: an unreachable Redis is treated as a failure because "0 keys removed, exit 0" would be indistinguishable from a genuinely empty cache.
- Never issues `FLUSHALL`; only keys matching the app's prefix are targeted.
- Two invocation targets: compose Redis (`npm run db:cache:clear`) or localhost (`npm run host -- db:cache:clear`).
