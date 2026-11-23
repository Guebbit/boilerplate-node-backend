---
source: scripts/db/cache-clear.ts
source_sha256: 8b763fa9071125cceff9b8212f35212d7121ad66bc914e61349250a09b874f7a
context_sha256: 0e4b492bc0b8a45aa2f56ee05d31cde2c2a9ce2dbc0f0ea12120272def42c728
generated_at: 2026-11-22T02:01:04.716344+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/db/cache-clear.ts

## Purpose
A CLI script that deletes every cached API response belonging to this app from Redis. The API invalidates its own cache on writes it handles, but writes that bypass it (`scenario:apply`, one-off scripts under `ops/`, a `mongosh` session) leave stale answers being served until they expire. `scenario:apply` calls this automatically, and it should be run by hand after any manual database surgery.

## Key elements
- **Top-level `runScript(...)` call**: the file's only logic, invoked with `void` and an eslint-disable for floating promises, since `runScript` never rejects and reports failure via `process.exitCode`.
  - First argument is `undefined`, so no outcome is recorded and Mongo is never opened.
  - The task callback calls `clearCache()`, destructures `{ deleted, reachable }`, and throws if `reachable` is false. Otherwise it logs `Cache cleared: N keys removed.`.
  - The cleanup callback calls `stopCache()`.

## Relationships
- `scripts/run-script.ts`: provides `runScript`, which wraps the task and cleanup callbacks and sets the exit code on failure.
- `src/infrastructure/adapters/cache.ts`: provides `clearCache` (returns `{ deleted, reachable }`) and `stopCache` (used for cleanup).
- `src/infrastructure/adapters/logger.ts`: provides `logger`, used for the success message.
- `src/infrastructure/config/dotenv.ts`: imported for its side effect, which loads environment configuration before the cache adapter is used.

## Notes
- Deletion is scoped to `NODE_REDIS_CACHE_PREFIX`, never `FLUSHALL`, so it is safe on a shared Redis.
- `clearCache` fails open for the seeder's benefit. This script turns an unreachable Redis into an error, because otherwise it would print "0 keys removed" and exit 0 with the cache untouched, which looks the same as an empty cache.
- Usage: `npm run db:cache:clear` runs against the compose Redis hostname. `npm run host -- db:cache:clear` runs against localhost.
- The `import '@infrastructure/config/dotenv'` line must stay first so the environment is loaded before the other imports.
