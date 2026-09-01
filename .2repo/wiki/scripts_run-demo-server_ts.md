# scripts/run-demo-server.ts

## Purpose

Entry point for the `npm run demo` profile. Boots the real application against a self-contained in-memory MongoDB instance, seeds it from module fixtures, and serves the API without Docker, Redis, or a message broker. Intended as the backend for the paired frontend dev server and the e2e suite, replacing hand-written mocks.

## Key elements

- **`REQUIRED_DEFAULTS`** — Record of env vars set (if not already set) before the app boots: dev mode, `NODE_DEMO=true`, demo token secrets, and relaxed rate limits sized for the e2e suite.
- **`FORCED_ABSENT`** — List of Redis/RabbitMQ env keys that are explicitly deleted from `process.env` so no external service can be reached, regardless of the caller's shell.
- **`waitForDatabase(readyState)`** — Polls a ready-state function every 100 ms until it returns `1` or a 60 s timeout elapses.
- **Main flow (top-level IIFE-style chain)** —
  1. Creates a `MongoMemoryServer` instance.
  2. Registers `SIGTERM`/`SIGINT` handlers that call `mongod.stop()` before exiting (prevents ~200 MB temp-data leaks).
  3. Shapes `process.env` (defaults + deletions + `NODE_DB_URI`).
  4. Dynamically imports `../src/app` (which self-boots on import), then `@infrastructure/runtime/database`, waits for connection, imports `../src/app/demo`, calls `runDemoSeed(false)`, and logs readiness.

## Relationships

- **`../src/app`** — Dynamically imported *after* the environment is fully shaped; the app reads config at import time.
- **`@infrastructure/runtime/database`** — Imported to obtain the `connection` object whose `readyState` drives `waitForDatabase`.
- **`../src/app/demo`** — Provides `runDemoSeed`; the demo control surface is also mounted here when `NODE_DEMO=true`.

## Notes

- The dynamic `import()` calls are **order-sensitive**: the app module reads environment variables during its import, so the env must be finalized before the import executes. Do not hoist these to static top-level imports.
- `FORCED_ABSENT` keys are removed via `delete process.env[key]` rather than assignment — assigning `undefined` would coerce to the string `"undefined"`.
- Multiple demo instances can run concurrently on different `NODE_PORT` values; each owns its own in-memory Mongo and temp data directory.
- `NODE_PORT` defaults to `3000` if unset (used only in the startup log message).
