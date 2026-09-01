# src/app/demo.ts

## Purpose

Control surface for the demo profile, mounted exclusively when `NODE_DEMO=true` (via `npm run demo`). Exposes two unauthenticated Express routes used by the paired frontend's e2e suite: one to reseed the in-memory database from module fixtures and clear the email outbox, and one to read back captured "sent" emails.

## Key elements

- **`runDemoSeed(reset: boolean)`** — If `reset` is true, drops the database via `connection.dropDatabase()`; then runs every enabled module's `seeds?.()` in parallel; finally calls `clearDemoOutbox()`. Returns a `Promise<void>`.
- **`installDemo(app: Express)`** — Registers the two demo routes on the given Express app. Only ever called in demo mode.
- **`POST /__demo/reset`** — Calls `runDemoSeed(true)`; responds `204` on success or `500 { success: false }` on failure (logged via `logger.error`).
- **`GET /__demo/emails`** — Responds with `{ emails: readDemoOutbox() }`.
- **`isDemoMode`** (re-export) — Convenience re-export from `demo-outbox` so consumers can import from this module.

## Relationships

- **`src/modules.ts`** — Imports `enabledModules`; `runDemoSeed` iterates over this array to invoke each module's `seeds`.
- **`src/infrastructure/runtime/database.ts`** — Imports `connection` to call `dropDatabase()` during a reset.
- **`src/infrastructure/adapters/demo-outbox.ts`** — Imports `clearDemoOutbox` and `readDemoOutbox`; re-exports `isDemoMode`.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` to record reset failures.
- **`src/app.ts`** — Upstream caller that invokes `installDemo(app)` when the demo profile is active (this file lives under `src/app/` as its mount point).
- **`package.json`** — Defines the `demo` script that sets `NODE_DEMO=true` and starts the server in demo mode.

## Notes

- Routes are intentionally unauthenticated: the demo profile binds only beside a database that `npm run demo` just created, so there is no pre-existing state to protect.
- The `_request` parameter is unused (underscore-prefixed) in both handlers; the routes carry no per-request context.
- `runDemoSeed(false)` skips the `dropDatabase()` step, supporting a first-boot seed where no schema exists yet.
- The docstring references `db/demo/index.ts --reset` as the CLI equivalent; the two paths share the same seed-walk logic but the demo route omits the cache flush because the demo profile runs with caching disabled.
