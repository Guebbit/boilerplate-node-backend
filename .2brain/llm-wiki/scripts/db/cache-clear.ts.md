---
source: scripts/db/cache-clear.ts
sha256: 13ddf8e57c74c719cbec337e3b1d42b31ca06c81220be8be3752de942e55dc5a
generated_at: 2026-09-27T13:53:59.406374+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/cache-clear.ts

## Purpose

Drops every cached response belonging to this app from Redis. It exists because writes that bypass the HTTP API (manual `mongosh` sessions, one-off scripts under `ops/`) skip the normal `invalidateCache` middleware, leaving stale answers in the cache until TTL expiry. `scenario:apply` calls this automatically; otherwise run it by hand after any direct database edit.

## Key elements

- **Inline `runScript` body** — calls `clearCache()`, checks the `reachable` flag, logs the key count, then calls `stopCache()` as a teardown callback.
- **`reachable` guard** — `clearCache` is designed to fail open (so the seeder can proceed without Redis). This script inverts that: if `reachable` is false it **throws**, because "0 keys removed, exit 0" would be indistinguishable from a genuinely empty cache.
- **`clearCache` / `stopCache`** (from the cache adapter) — perform the actual Redis key-range deletion and connection teardown respectively.
- **`logger.info`** — prints the final "Cache cleared: N keys removed" line.
- **`NODE_REDIS_CACHE_PREFIX` scoping** — only keys under this app's prefix are deleted; `FLUSHALL` is never used, so a shared Redis instance is safe.

## Relationships

- **`scripts/run-script.ts`** — provides the `runScript` wrapper (error handling, exit codes). This script passes `undefined` as the first argument, meaning **no Mongo connection is opened** — the script only needs Redis.
- **`src/infrastructure/adapters/cache.ts`** — source of `clearCache` (does the key deletion) and `stopCache` (closes the Redis connection).
- **`src/infrastructure/adapters/logger.ts`** — source of `logger.info` used for the success message.

## Notes

- **Fail-open vs. fail-closed:** `clearCache` intentionally returns `{ deleted: 0, reachable: false }` instead of throwing, so callers like the seeder can continue. This script is the one caller that **must** treat unreachability as a hard error, hence the explicit `reachable` check.
- **No Mongo dependency:** the `undefined` first arg to `runScript` is deliberate — recording a script outcome would require a Mongo connection this script has no other reason to hold.
- **Invocation:** `npm run db:cache:clear` targets the compose Redis hostname; `npm run host -- db:cache:clear` targets `localhost`.
