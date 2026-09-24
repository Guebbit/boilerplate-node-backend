---
source: scripts/db/cache-clear.ts
sha256: a2354d004a42f5abbc58a26e1d06514c0fe6fad47692ae475032c1e9c4afb337
generated_at: 2026-09-23T17:23:39.932991+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/cache-clear.ts

## Purpose

Standalone script that deletes every cached response owned by this app from Redis. It exists because writes that bypass the HTTP API (manual `mongosh` sessions, one-off `ops/` scripts) skip the API's `invalidateCache` middleware, leaving stale entries served until their TTL expires.

## Key elements

- **Top-level `runScript(...)` call** — the entire body. Calls `clearCache()`, asserts `reachable`, logs the key count, and throws a descriptive error if Redis was unreachable. The second argument (`stopCache`) is the cleanup callback that closes the Redis connection.
- **`clearCache` (imported)** — performs the actual key deletion scoped to `NODE_REDIS_CACHE_PREFIX`. Returns `{ deleted, reachable }`.
- **`stopCache` (imported)** — shuts down the Redis client after the script finishes.
- **`logger.info(...)`** — single log line reporting how many keys were removed.

## Relationships

- **`scripts/db/run-script.ts`** — provides `runScript`, the shared entry-point wrapper that handles `dotenv/config`, top-level error formatting, and the post-run cleanup callback. This file is a thin script body handed to that wrapper.
- **`src/infrastructure/adapters/cache.ts`** — source of `clearCache` (scoped key deletion) and `stopCache` (connection teardown).
- **`src/infrastructure/adapters/logger.ts`** — source of the `logger` used for the success message.

## Notes

- **Fails closed on unreachable Redis.** `clearCache` is designed to fail *open* (return `deleted: 0`) so the seed flow isn't blocked (§9). This script explicitly checks the `reachable` flag and throws, because printing "0 keys removed" and exiting 0 would be indistinguishable from a genuinely empty cache.
- **Never runs `FLUSHALL`.** Deletion is scoped to `NODE_REDIS_CACHE_PREFIX`, making it safe on a shared Redis instance.
- **`scenario:apply` invokes this automatically**; run manually (`npm run db:cache:clear` or `npm run host -- db:cache:clear`) after any direct database edit.
- The `void` before `runScript(...)` signals a top-level fire-and-forget invocation (the script's own process is the only consumer).
