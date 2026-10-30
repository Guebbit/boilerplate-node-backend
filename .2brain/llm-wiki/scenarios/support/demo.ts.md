---
source: scenarios/support/demo.ts
sha256: 4a139a89782fcc74e826e3f3017e3e59821651f121fbcf7d9e740c84147f8068
generated_at: 2026-10-29T01:26:17.020783+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/demo.ts

## Purpose

The demo profile's control surface: a set of unauthenticated `/__test/*` Express routes that give the paired e2e frontend the ability to restore named scenarios, inspect state, advance the demo clock, and trigger declared background jobs. It is mounted exclusively by `scenarios/run-server.ts` (via `npm run demo`); nothing under `src/` imports or knows about it.

## Key elements

- **`UnknownScenarioError`** — thrown for any scenario name not present in the `SCENARIOS` registry; takes `unknown` so both call sites share one message format.
- **`buildOnce`** — builds a scenario into the (empty) database once, captures a `DatabaseCopy`, and caches it in the module-level `copies` Map. Subsequent restores of the same name are replays of that copy.
- **`restoreScenario`** (exported) — queues a full restore (build-or-replay → write copy → clear outbox → reset clock → refresh locale overrides → clear cache) behind `restoreQueue`, so concurrent restores never interleave their writes. The queue itself never rejects; each caller sees its own outcome.
- **`describeScenario`** — assembles the `GET /__test/scenario` payload: current scenario name, `seedCredentials` from `@scenarios/accounts`, and the subject row-IDs the flow runner recorded.
- **`installDemo`** (exported) — mounts all `/__test/*` routes on the given Express app, stores the app for the flow runner's loopback listener, and wires in each module's own levers via `installModuleLevers`.
- **`jobLevers`** — builds a `ReadonlyMap<string, JobDeclaration>` keyed by the URL-safe name (colon → dash) so `POST /__test/jobs/:name` can look up and invoke a job.
- **`requireClock`** — guard for clock routes; sends a 501 and returns `undefined` if the profile was booted without a demo clock.
- **`RESTORE_BODY` / `CLOCK_BODY`** — Zod schemas for request-body validation (400 with `z.prettifyError` on failure).

## Relationships

- **`scenarios/index.ts`** — provides `DEFAULT_SCENARIO`, `buildScenario`, and `isScenarioName`; this file delegates all scenario building to it.
- **`scenarios/accounts.ts`** — supplies `seedCredentials` (resolved `NODE_SEED_*` logins) included in the scenario description response.
- **`scenarios/support/database-snapshot.ts`** — provides `emptyDatabase`, `captureDatabase`, `restoreDatabaseCopy`, and the `DatabaseCopy` type used for the build-once / replay cycle.
- **`scenarios/support/demo-clock.ts`** — provides `getDemoClock` and the `DemoClock` type; this file calls `reset()` on restore and `advance()` on clock POST.
- **`scenarios/support/doubles/mail-outbox.ts`** — provides `clearDemoOutbox` (called on every restore) and `readDemoOutbox` (used by `GET /__test/emails`).
- **`scenarios/support/doubles/levers.generated.ts`** — provides `installModuleLevers`, which registers each shop module's own test levers (e.g. `POST /__test/payments/refund-failure`) alongside the routes defined here.
- **`src/infrastructure/adapters/cache.ts`** — `clearCache` is called at the tail of every restore so cached data does not outlive the reset.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is the only logging call in this file (on unexpected restore failure).
- **`src/infrastructure/http/response.ts`** — `rejectResponse` is the shared helper for all 400/500/501 error responses.
- **`src/infrastructure/i18n/index.ts`** — `refreshLocaleOverrides` is called on every restore to pick up any locale changes the new scenario may imply.
- **`src/kernel/registry.ts`** — supplies the `JobDeclaration` type that shapes the job-lever lookup map.
- **`tests/integration/scenarios/demo-restore.test.ts`** / **`demo-routes.test.ts`** — integration tests that exercise these routes against a running demo server.

## Notes

- **Build-once, replay-many.** Building a scenario involves password hashes and hundreds of non-idempotent HTTP requests through the flow runner. The captured `DatabaseCopy` is the expensive artifact; every later restore is a plain row-insert.
- **Never `dropDatabase()`.** `emptyDatabase` preserves index builds; `dropDatabase` would race an unbuilt unique index and let duplicate writes succeed.
- **Serialize restores, don't lock the queue.** Two concurrent restores would interleave writes and collide on `_id`. The `restoreQueue` chain prevents that, and a failure in one restore does not reject the queue for subsequent callers.
- **Clock is forward-only.** `POST /__test/clock` accepts a non-negative `advanceMs`; there is no rewind. Jobs that should react are triggered separately through `POST /__test/jobs/:name`.
- **Unauthenticated by design.** The demo profile binds only beside a database `npm run demo` just created on loopback; there is no auth middleware.
- **`jobLevers` uses a `Map`, not a plain object**, so an arbitrary URL segment can never resolve to an inherited property like `constructor`.
