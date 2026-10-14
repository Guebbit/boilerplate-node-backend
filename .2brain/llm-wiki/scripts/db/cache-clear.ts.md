---
source: scripts/db/cache-clear.ts
sha256: c7234d5b6b5bdf166c25ab0530ce7385705bbc77ebb530baf0659095d90a731c
generated_at: 2026-10-14T07:12:55.241282+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/cache-clear.ts

## Purpose

A one-shot CLI script that deletes every cache key owned by this app from Redis. It exists because the API's write-path invalidation (see `invalidateCache` in the HTTP middleware) does not cover writes made outside the API — `scenario:apply`, ad-hoc `ops/` scripts, or a raw `mongosh` session — so stale responses would otherwise linger until their TTL expires. `scenario:apply` invokes this automatically; run it by hand after any manual database surgery.

## Key elements

- **Top-level `runScript(…, async () => { … }, () => stopCache())`** — the entire entry point. The first argument is `undefined` (no Mongo connection). The cleanup callback calls `stopCache()` to release the Redis client after the script exits.
- **`clearCache()`** (from the cache adapter) — performs the actual key scan-and-delete scoped to the app's Redis prefix. Returns `{ deleted, reachable }`.
- **`reachable` guard** — if Redis was unreachable, the script throws instead of relying on `clearCache`'s fail-open default, because a "0 keys removed" exit would be indistinguishable from a silently-failed clear.
- **`logger.info(…)`** — logs the count of deleted keys on success.

## Relationships

- **`scripts/run-script.ts`** — provides the `runScript` wrapper (lifecycle, error handling, optional Mongo connection). Passing `undefined` as the first argument opts out of opening a Mongo handle, which this script has no other reason to hold.
- **`src/infrastructure/adapters/cache.ts`** — supplies `clearCache` (prefix-scoped key deletion) and `stopCache` (Redis client teardown).
- **`src/infrastructure/adapters/logger.ts`** — supplies the structured `logger` used for the success message.
- **`src/infrastructure/config/dotenv.ts`** — side-effect import (first line) that loads `.env` into `process.env` before any adapter reads configuration.

## Notes

- **Fail-open override.** `clearCache` is designed to fail open (return `reachable: false` without throwing) so the seeder can continue. This script explicitly rejects that path: if `reachable` is false it throws, because a silent no-op would be the exact failure mode the script exists to prevent.
- **Prefix scoping.** Deletion is scoped to `NODE_REDIS_CACHE_PREFIX`; the script never issues `FLUSHALL`, so a shared Redis instance used by other services is unaffected.
- **No Mongo connection.** The `undefined` first argument to `runScript` is intentional and documented inline — the script only needs Redis, and opening a Mongo connection "would need a connection this script has no other reason to hold."
- **Usage:** `npm run db:cache:clear` (compose hostname) or `npm run host -- db:cache:clear` (localhost).
