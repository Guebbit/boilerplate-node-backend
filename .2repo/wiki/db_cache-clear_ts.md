# db/cache-clear.ts

## Purpose

Standalone script that removes all cached responses scoped to this app's Redis prefix. It exists because the API only invalidates its own cache on writes it handles; manual database operations (`db:seed`, `migrate-mongo`, ad-hoc `mongosh`) bypass that logic, leaving stale responses served until TTL expiry.

## Key elements

- **Main async body** (passed to `runScript`) — calls `clearCache()`, then **throws** if `reachable` is `false`, and logs the number of deleted keys on success.
- **Teardown callback** — calls `stopCache()` to release the Redis connection after the script exits.
- **`runScript` wrapper** — manages process lifecycle (env loading, cleanup) around the body.

## Relationships

- **`db/run-script.ts`** — provides `runScript`, the shared harness that loads dotenv, runs the async body, and invokes the teardown on completion.
- **`src/infrastructure/adapters/cache.ts`** — supplies `clearCache()` (prefix-scoped bulk delete) and `stopCache()` (connection cleanup).
- **`src/infrastructure/adapters/logger.ts`** — supplies `logger.info` used to report the deletion count.

## Notes

- **Fail-closed override:** `clearCache` is designed to fail *open* (return `{ deleted: 0, reachable: false }`) so the seeder can proceed without Redis. This script deliberately treats that same return value as a hard failure, because a silent "0 keys removed, exit 0" is indistinguishable from a genuinely empty cache — the exact silent failure the script exists to prevent.
- **Prefix-scoped, never `FLUSHALL`** — safe to run against a shared Redis instance.
- **Auto-invoked by `db:seed`**; run manually (`npm run db:cache:clear` or `npm run host -- db:cache:clear`) after any other direct DB mutation.
