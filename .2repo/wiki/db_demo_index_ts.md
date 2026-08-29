# db/demo/index.ts

## Purpose

The runner for the demo-data seeder. It opens a Mongo connection, gates against production, walks every entry in `enabledModules` calling each module's optional `seeds()` method concurrently, flushes the in-memory cache, and closes both connections. It owns no domain logic and names no collection; its sole job is orchestration.

## Key elements

- **`seed()`** — The async body. Checks `NODE_ENV !== 'production'`, optionally drops the DB when `--reset` is in `argv`, runs all module seeders via `Promise.all`, clears cache only if something was actually created, and logs a created-vs-present summary.
- **`reset` flag** — Read once from `process.argv.includes('--reset')`; when true, calls `connection.dropDatabase()` before seeding.
- **Cleanup callback** — Passed to `runScript` as `() => Promise.all([connection.close(), stopCache()])`; lives in the runner's `finally` so sockets are released even on throw.
- **Cache-clear logic** — Calls `clearCache()`, inspects `reachable` to choose an info vs. warn log line, but never throws on Redis unavailability (fail-open by design).

## Relationships

- **`src/modules.ts`** — Imports `enabledModules`; this file is the sole consumer that invokes each module's `seeds` field.
- **`db/run-script.ts`** — Imports `runScript`, which wraps `seed()` and guarantees the cleanup callback runs in a `finally`.
- **`src/infrastructure/runtime/database.ts`** — Imports `start` (connect) and `connection` (drop/close).
- **`src/infrastructure/adapters/cache.ts`** — Imports `clearCache` (post-seed invalidation) and `stopCache` (teardown).
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for all structured output.
- **`db/demo/demo-data.json`** — An *output* artifact produced by `npm run seed:export`, which serialises what this seeder wrote. It is never read back as input.
- **`src/kernel/seed-accounts.ts`** — One of the per-module seeders invoked through the `enabledModules` loop (provides the `gino@pino.it` fixture mentioned in the header comment).
- **`public/images/seed/`** — Static image files whose URLs are embedded in fixture documents; corrected retroactively by a migration, not by re-running this seeder.

## Notes

- **Idempotency is skip, not overwrite.** `upsertById()` *skips* a fixture whose `_id` already exists. Re-running after a schema/data fix (e.g. image-URL corrections) does **not** repair existing rows — a separate migration handles that.
- **Passwords are plain text** in fixtures. The Mongoose pre-save hook hashes them on insert. Hashing manually here would desynchronise from the hook.
- **Production gate is a hard return, not an exception.** `NODE_ENV=production` causes a `logger.warn` and immediate return; `runScript`'s cleanup still fires but both closers are no-ops because `start()` was never called.
- **Concurrent seeding is intentional.** No fixture's write is a dependency for another fixture's write (order snapshots are built from in-memory catalogue fixtures, not read back from Mongo).
- **Cache clear is conditional.** The `created > 0` guard means a no-op re-run (all fixtures already present) skips the Redis round-trip entirely.
