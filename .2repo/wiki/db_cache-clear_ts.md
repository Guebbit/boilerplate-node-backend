# db/cache-clear.ts

## Purpose

Standalone script that deletes every cached response owned by this app from Redis. It exists because writes that bypass the HTTP API (`db:seed`, `migrate-mongo`, a raw `mongosh` session) skip the API's per-request `invalidateCache` middleware, leaving stale responses in place until their TTL expires. It is invoked automatically by `db:seed` and can be run by hand after any manual database surgery.

## Key elements

- **Main IIFE (passed to `runScript`)** — calls `clearCache()`, checks the `reachable` flag, and throws a hard error if Redis was unreachable (because a "0 keys deleted, exit 0" result would be indistinguishable from an actually empty cache). On success, logs the key count.
- **`stopCache` (cleanup callback)** — shuts down the Redis client connection after the script finishes.
- **`logger.info`** — reports the number of keys removed.

## Relationships

- **`db/run-script.ts`** — provides `runScript(fn, cleanup)`, the standard wrapper that runs the async body and then invokes the cleanup callback (here, `stopCache`).
- **`src/infrastructure/adapters/cache.ts`** — supplies `clearCache()` (deletes keys under the app's Redis prefix) and `stopCache()` (closes the connection).
- **`src/infrastructure/adapters/logger.ts`** — supplies the `logger` instance used for the success message.

## Notes

- Deletion is scoped to `NODE_REDIS_CACHE_PREFIX`; the script never issues `FLUSHALL`, so a shared Redis instance remains safe for other apps.
- `clearCache` is designed to *fail open* (return `{ deleted: 0, reachable: false }`) so the seeder can proceed without a Redis. This script deliberately **overrides** that tolerance: an unreachable Redis is a hard `throw`, because silently doing nothing is exactly the failure mode the script is meant to prevent.
- Two npm entry points target different Redis hosts: `npm run db:cache:clear` (compose hostname) and `npm run host -- db:cache:clear` (localhost).
