# scripts/run-demo-server.ts

## Purpose

Boots the real application against a throwaway in-memory MongoDB (via `mongodb-memory-server`), seeds it from each enabled module's fixtures, and serves the API on `NODE_PORT` — no Docker, Redis, or message broker required. It exists so the paired frontend dev server and e2e suite have a real, disposable backend instead of a hand-written mock. Invoked via `npm run demo`.

## Key elements

- **`REQUIRED_DEFAULTS`** — env vars set (only if not already set) to put the app in development/demo mode: `NODE_DEMO=true`, throwaway JWT secrets, and raised rate limits (1000) so the e2e suite doesn't trip 429s.
- **`FORCED_ABSENT`** — env vars unconditionally deleted (`NODE_REDIS_*`, `NODE_AMQP_*`) to guarantee cache and queue are disabled regardless of the shell environment.
- **`waitForDatabase(readyState)`** — polls a `readyState()` getter until it returns `1` (MongoDB connected) or times out at 60 s.
- **Top-level boot sequence** — creates a `MongoMemoryServer`, wires up SIGTERM/SIGINT handlers that call `mongod.stop()` before exiting, shapes `process.env`, then dynamically imports `src/app`, waits for the DB connection, calls `runDemoSeed(false)` from `src/app/demo`, and logs readiness.

## Relationships

- **`src/app.ts`** — dynamically imported *after* the environment is fully shaped; the module self-boots on import, so import order is critical.
- **`src/app/demo.ts`** — imported after DB readiness to obtain `runDemoSeed`; provides the seed routine that populates the in-memory database from each module's fixtures.
- **`docs/tools/demo-profile.md`** — human-readable documentation describing the demo profile; this script is the executable counterpart.

## Notes

- **Import order matters:** `src/app.ts` side-effects on import. The script deliberately sets env vars and deletes external-service URLs *before* the dynamic `import('../src/app')`.
- **Signal handling is load-bearing:** without the SIGTERM/SIGINT handlers calling `mongod.stop()`, the temp data directory (~200 MB per boot) is never cleaned up. `start-server-and-test` and the frontend shard runner both terminate with SIGTERM.
- **Rate limits are intentionally high** (1000) because the e2e suite fires 85 specs from a single address; the lower production defaults would surface as spurious "login is broken" failures.
- **Multiple instances** can run concurrently (e.g. `NODE_PORT=3101 npm run demo`) — each owns its own in-memory Mongo.
- `FORCED_ABSENT` uses `delete process.env[key]` rather than assigning `undefined` to avoid the env var being coerced to the literal string `"undefined"`.
