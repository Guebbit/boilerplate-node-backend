# src/infrastructure/runtime/database.ts

## Purpose

Owns the full MongoDB connection lifecycle (resolve URI → connect with retry → disconnect) for the application. It wraps Mongoose's singleton connection so the rest of the codebase can `import mongoose` and assume a live connection without managing handshake, backoff, or teardown themselves.

## Key elements

- **`getDatabaseUri()`** – Resolves the connection string from `NODE_DB_URI` (preferred) or `NODE_MONGODB_HOST`/`PORT`/`NAME` fragments. Exported so the CommonJS `migrate-mongo-config.js` script can mirror the logic; a test asserts they stay in sync.
- **`start()`** – Calls `mongoose.connect()` with up to 10 exponential-backoff retries (1 s → 30 s cap). Returns a promise that resolves `void` on success or throws after the final failure. Uses recursive promise chains (no `async`/`await`).
- **`stopDatabase()`** – Calls `mongoose.disconnect()`. Catches and logs any rejection instead of rethrowing, so a failing disconnect cannot abort the remaining shutdown chain.
- **`connection`** – Re-exported reference to `mongoose.connection`. Safe to read at import time; populated once `start()` resolves. Intended for readiness/diagnostics probes reading `readyState`.
- **`wait(ms)`** – Promisified `setTimeout`; keeps backoff delays off the event loop so health-check endpoints stay responsive during retries.
- **Constants** – `MAX_RETRIES` (10), `BASE_DELAY_MS` (1000), `DEFAULT_DATABASE_NAME` (`boilerplate-node-backend`).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – Imported as `logger`; used to warn on each retry and on disconnect failure.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Expected caller of `start()` during boot and `stopDatabase()` during graceful shutdown.
- **`src/infrastructure/observability/dependency-health.ts`** – Consumes the exported `connection` object to report MongoDB status to health/readiness endpoints.
- **`src/app.ts` / `src/app/demo.ts`** – App entry points that orchestrate the database lifecycle before/after the HTTP server starts.
- **`src/modules/account/module.ts`** – Mongoose model definitions in module files rely on the global connection this file establishes; they do not call `connect()` themselves.
- **`tests/unit/db/host-scripts.test.ts`** – Asserts the CJS re-implementation in `migrate-mongo-config.js` produces the same URI as `getDatabaseUri()`.
- **`tests/unit/infrastructure/observability/dependency-health.test.ts`** – Exercises the readiness-report path that reads `connection.readyState`.
- **`src/modules/observability/tests/contract/api.contract.test.ts`** – Contract tests that implicitly require the database to be connected before issuing requests.

## Notes

- **Promise chains, not `async`/`await`.** The retry loop in `start()` is intentionally a recursive `.then()` chain to stay consistent with the codebase's existing style.
- **Empty `NODE_DB_URI` is meaningful.** The truthiness check (not `!== undefined`) lets the `npm run host` wrapper blank the URI and override only the host, so the database name still comes from `.env` rather than being duplicated in `package.json`.
- **`connection` is a stable reference, not a value.** It exists at import time; its `readyState` field mutates as the driver connects/disconnects. Grabbing it before `start()` resolves is safe.
- **`stopDatabase()` never rejects.** A disconnect error is logged and swallowed to protect the rest of the shutdown sequence.
