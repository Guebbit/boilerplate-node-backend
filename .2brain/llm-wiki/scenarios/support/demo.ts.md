---
source: scenarios/support/demo.ts
sha256: b0cc24faa8a518942dde7fd91b5113611522f2d4ff262811fadf3ea839361360
generated_at: 2026-11-08T02:33:05.313547+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/demo.ts

## Purpose

Mounts the demo profile's control surface — a set of test-only HTTP routes under `/__test/*` that let a paired e2e frontend restore scenarios, inspect state, advance a fake clock, and trigger background jobs. It is installed exclusively by `scenarios/run-server.ts` via `npm run demo`; nothing under `src/` references it, and production has no such routes.

## Key elements

- **`installDemo(app, jobs)`** (exported) — Registers all `/__test/*` routes on the Express app and stashes the app for the flow runner's loopback listener.
- **`restoreScenario(scenario?)`** (exported) — Queued entry point that empties the database, replays (or builds once) a named scenario, then clears the outbox, resets the demo clock, resets rate-limit counters, refreshes i18n overrides, and clears the cache.
- **`UnknownScenarioError`** (exported) — Thrown when a caller names a scenario the `SCENARIOS` registry does not carry.
- **`buildOnce(name)`** (module-private) — The expensive half of a restore: empties the DB, drives the real app through checkout/payment/shipping flows via `buildScenario`, then captures a `DatabaseCopy`. Results are cached in a per-process `Map` so later restores are cheap replays.
- **`runRestore(scenario)`** (module-private) — Orchestrates build-or-replay → `restoreDatabaseCopy` → outbox/clock/rate-limit/i18n/cache cleanup.
- **`restoreQueue`** (module-private) — A chained `Promise` that serialises concurrent restore calls so they never interleave writes.
- **`describeScenario()`** (module-private) — Returns `{ scenario, accounts, subjects }` for `GET /__test/scenario`.
- **`jobLevers(jobs)`** (module-private) — Builds a `Map<string, JobDeclaration>` keyed by job name with `:` → `-`, used by `POST /__test/jobs/:name`.
- **`requireClock(response)`** (module-private) — Returns the `DemoClock` or sends a 501 refusal.
- **`RESTORE_BODY` / `CLOCK_BODY`** (module-private) — Zod schemas for request-body validation.

## Relationships

- **`scenarios/index.ts`** — Imports `DEFAULT_SCENARIO`, `buildScenario`, and `isScenarioName`; provides the scenario registry and the expensive build routine.
- **`scenarios/accounts.ts`** — Imports `seedCredentials` so the e2e frontend never keeps a second copy of passwords.
- **`scenarios/support/database-snapshot.ts`** — Imports `captureDatabase`, `emptyDatabase`, `restoreDatabaseCopy`, and the `DatabaseCopy` type for the build-once/replay-many pattern.
- **`scenarios/support/demo-clock.ts`** — Imports `getDemoClock` and `DemoClock` for the clock inspection and advancement routes.
- **`scenarios/support/doubles/mail-outbox.ts`** — Imports `clearDemoOutbox` / `readDemoOutbox` to reset and read the captured email outbox.
- **`src/kernel/registry.ts`** — Imports the `JobDeclaration` type for the job-lever routes.
- **`src/infrastructure/adapters/cache.ts`** — Calls `clearCache()` on every restore.
- **`src/infrastructure/adapters/logger.ts`** — Logs unhandled restore failures.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Calls `resetMemoryRateLimitCounters()` so spent budgets don't survive a reseed.
- **`src/infrastructure/http/response.ts`** — Uses `rejectResponse` for all error/4xx/5xx replies.
- **`src/infrastructure/i18n/index.ts`** — Calls `refreshLocaleOverrides()` after a restore.
- **`package.json`** — The `demo` script (`npm run demo`) is the sole process entry that installs this module.
- **`tests/integration/scenarios/demo-restore.test.ts`** / **`demo-routes.test.ts`** — Integration tests that exercise `restoreScenario` and the `/__test/*` routes.

## Notes

- **Build-once, replay-many:** The first restore for a given name drives real HTTP flows (password hashes, checkouts, payments) and captures the resulting database. Every subsequent restore of that name simply writes the captured copy back. The `copies` map lives for the process lifetime.
- **Serialised restores:** `restoreScenario` chains onto a module-level `restoreQueue` so two overlapping restores never interleave their empty/reseed writes. The queue swallows rejections so one failed restore does not wedge the ones behind it.
- **No `dropDatabase`:** Restores use `emptyDatabase` (clear collections, keep indexes) rather than dropping the database, which would reset unique-index builds and let a racing write slip through.
- **`jobLevers` uses a `Map`, not a plain object,** so an arbitrary URL segment (e.g. `constructor`) can never resolve to an inherited property.
- **Clock is forward-only:** `POST /__test/clock` accepts only `advanceMs ≥ 0`; the clock cannot be rewound.
- **Unauthenticated by design:** The demo profile binds only to a database created by `npm run demo` on a throwaway port, so no auth middleware is needed.
