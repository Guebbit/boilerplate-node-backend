# src/infrastructure/runtime/database.ts

## Purpose

Manages the full MongoDB connection lifecycle for the application: resolving the connection URI from environment variables, connecting with bounded exponential-backoff retry, and cleanly disconnecting on shutdown. It centralises the single Mongoose singleton so every other module in the codebase shares one live connection.

## Key elements

- **`getDatabaseUri()`** – Resolves the connection string. A full `NODE_DB_URI` takes precedence; otherwise it assembles `mongodb://host:port/name` from `NODE_MONGODB_HOST`, `NODE_MONGODB_PORT`, and `NODE_MONGODB_NAME` (default name `boilerplate-node-backend`). Uses truthiness (not `!== undefined`) so an *empty* `NODE_DB_URI` intentionally falls through to fragments.
- **`start()`** – Calls `mongoose.connect(getDatabaseUri())` with up to 10 retries using exponential backoff (1 s → 2 s → 4 s …, capped at 30 s). Implemented as a recursive promise chain (no `async`/`await`) to match the codebase's explicit-promise style. Throws after the final attempt so the boot sequence aborts.
- **`stopDatabase()`** – Calls `mongoose.disconnect()` to release pooled sockets. Logs and swallows any rejection so it never aborts the remaining shutdown steps.
- **`connection`** – Re-exports `mongoose.connection` (the singleton). Available at import time; populated once `start()` resolves. Intended for readiness probes and diagnostics via `connection.readyState`.
- **`wait(ms)`** – Internal promisified `setTimeout`; avoids blocking the event loop during backoff delays.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – Imported as `logger`; used for `warn` messages during retry backoff and disconnect failures.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls `start()` during boot and `stopDatabase()` during teardown (the "boot sequence" and "shutdown chain" referenced in comments).
- **`src/infrastructure/observability/dependency-health.ts`** – Reads the exported `connection` (specifically `connection.readyState`) to report MongoDB dependency health.
- **`tests/unit/db/host-scripts.test.ts`** – Asserts that `getDatabaseUri()` and its CommonJS reimplementation in `migrate-mongo-config.js` always produce the same URI.
- **`db/demo/index.ts`, `src/modules/account/module.ts`, `scripts/backfill-image-thumbnails.ts`** – Consume the Mongoose singleton indirectly; after `start()` resolves, their models and queries operate against the same live connection.
- **`src/app.ts` / `src/app/demo.ts`** – Wire the database lifecycle into the application startup/shutdown order.

## Notes

- The truthiness check on `NODE_DB_URI` is **load-bearing**: an empty string must fall through to the fragment-based URI. This is how `npm run host` blanks the URI and overrides only the host while keeping the database name from `.env`.
- `migrate-mongo-config.js` **reimplements** the `getDatabaseUri` logic (it is CommonJS and cannot import this ES module). The two copies must stay in sync; `tests/unit/db/host-scripts.test.ts` enforces this.
- The retry loop is intentionally recursive rather than a `for`/`while` loop to keep the explicit promise-chain style used throughout the codebase.
- `stopDatabase()` swallows disconnect errors by design—throwing there would abort subsequent shutdown steps.
- The backoff uses `setTimeout` (not `setImmediate` or a busy-wait) so the event loop stays free for health-check endpoints during containerised startup.
