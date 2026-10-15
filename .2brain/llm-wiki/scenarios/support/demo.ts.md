---
source: scenarios/support/demo.ts
sha256: 40ceffba3b6d6103dffc72c2cefb9fa3719109172283a2b1bb131fee2d5acea9
generated_at: 2026-10-15T09:34:30.076479+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/demo.ts

## Purpose

Control surface for the demo profile, mounted exclusively by `scenarios/run-server.ts` (via `npm run demo`). Exposes six `/__test/*` routes consumed by a paired frontend's e2e suite to restore scenarios, inspect state, manipulate a fake clock, and trigger background jobs. Nothing under `src/` is aware of these routes; production has no such extension point.

## Key elements

- **`installDemo(app: Express)`** — Entry point called by `run-server.ts`. Stores the Express app in `demoApp` (needed by the flow runner's loopback listener) and registers all six routes.
- **`restoreScenario(scenario?: string)`** — Queued restore: builds (or replays) a scenario, empties and reseeds the database, clears the mail outbox, resets the demo clock, refreshes locale overrides, and clears the cache.
- **`buildOnce(name)`** — Builds a scenario into an empty DB exactly once per process, then caches the snapshot (`copies` map). Subsequent restores of the same name are cheap replays.
- **`UnknownScenarioError`** — Thrown for scenario names not in the `SCENARIOS` registry; used by both `restoreScenario` and the restore route handler.
- **`describeScenario()`** — Returns the currently loaded scenario name, seed credentials (from `accounts.ts`), and the pinned row-id map for the frontend.
- **`requireClock(response)`** — Guard that responds `501` when no demo clock is installed.
- **`restoreQueue`** — Promise chain that serialises concurrent restore calls so they don't interleave writes or collide on `_id`.
- **`RESTORE_BODY` / `CLOCK_BODY`** — Zod schemas validating the JSON bodies for the restore and clock-advance routes.

## Relationships

- **`scenarios/index.ts`** — Provides `DEFAULT_SCENARIO`, `buildScenario`, and `isScenarioName` used by `buildOnce`.
- **`scenarios/accounts.ts`** — Supplies `seedCredentials` returned by `GET /__test/scenario`.
- **`scenarios/jobs.ts`** — Supplies the `DEMO_JOBS` map looked up by `POST /__test/jobs/:name`.
- **`scenarios/support/database-snapshot.ts`** — Provides `emptyDatabase`, `captureDatabase`, `restoreDatabaseCopy`, and the `DatabaseCopy` type used throughout the restore pipeline.
- **`scenarios/support/demo-clock.ts`** — Provides `getDemoClock()` and the `DemoClock` type; the clock route and restore reset both call into it.
- **`scenarios/support/doubles/mail-outbox.ts`** — Provides `clearDemoOutbox` (called after every restore) and `readDemoOutbox` (returned by `GET /__test/emails`).
- **`src/infrastructure/adapters/cache.ts`** — `clearCache` is invoked at the end of every restore.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` logs restore and job failures.
- **`src/infrastructure/i18n/index.ts`** — `refreshLocaleOverrides` is called after every restore.
- **`tests/integration/scenarios/demo-restore.test.ts`** — Integration test exercising the restore flow end-to-end.
- **`tests/integration/scenarios/demo-routes.test.ts`** — Integration test covering the remaining `/__test/*` routes.

## Notes

- **Build-once, replay-many:** Scenario construction (password hashing, hundreds of real HTTP-driven flow requests) is non-idempotent and expensive, so it runs only on first restore; later restores write the cached copy back.
- **Serialisation:** `restoreQueue` ensures overlapping restores don't interleave. A failed restore does **not** wedge the queue — the queue promise always resolves; the caller's own promise still carries the error.
- **`dropDatabase` is never used:** It would discard index builds; `emptyDatabase` (collection-level delete) preserves them.
- **Clock is forward-only:** `POST /__test/clock` rejects negative `advanceMs` via the Zod schema.
- **Unauthenticated by design:** The demo profile binds to a local, throwaway server; no auth middleware is applied to these routes.
- **`demoApp` is load-bearing:** `buildOnce` passes it to `buildScenario` so the flow runner can drive real HTTP requests through the actual application over a loopback listener.
- **Stryker mutation-testing suppression:** Two `Stryker disable next-line all` comments mark error-logging lines that would otherwise be mutated.
