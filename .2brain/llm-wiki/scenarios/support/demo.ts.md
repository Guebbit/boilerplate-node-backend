---
source: scenarios/support/demo.ts
sha256: d723c60ba3ee26d623c6ea7fcdce9967c49e2f39a6e85bb41e2ae1d5484476db
generated_at: 2026-11-14T17:17:02.034317+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/demo.ts

## Purpose

Control surface for the demo profile (`npm run demo`). Mounted exclusively by `scenarios/run-server.ts`, it exposes a set of unauthenticated `/__test/*` routes that the paired frontend's e2e suite uses to restore scenarios, inspect loaded state, manipulate the demo clock, and trigger declared background jobs. Nothing under `src/` references these routes; production builds never mount them.

## Key elements

- **`installDemo(app, jobs)`** (export) — entry point called by the demo runner. Stores the Express app for the flow runner, registers all `/__test/*` routes, and installs each module's own levers via `installModuleLevers`.
- **`restoreScenario(scenario?)`** (export) — public API for `POST /__test/restore`. Queues a build-or-replay of the named scenario behind an internal promise chain so concurrent calls never interleave.
- **`UnknownScenarioError`** (export) — thrown for scenario names absent from the `SCENARIOS` registry; used by both `restoreScenario` and the restore route's error handler.
- **`buildOnce(name)`** (internal) — the expensive half of a restore: empties the DB, runs `buildScenario` (drives real HTTP flows), then captures a `DatabaseCopy`. Caches the result in a module-level `Map` so subsequent restores are cheap replays.
- **`runRestore(scenario)`** (internal) — orchestrates a single restore: `buildOnce` → `restoreDatabaseCopy` → clears outbox, resets the demo clock, resets rate-limit counters, refreshes locale overrides, clears the cache.
- **`describeScenario()`** (internal) — shape of the `GET /__test/scenario` response: current scenario name, `seedCredentials`, and per-guarantee row ids.
- **`jobLevers(jobs)`** (internal) — builds a `Map` mapping URL-safe job names (`reap:orders` → `reap-orders`) to their declarations for `POST /__test/jobs/:name`.
- **`requireClock(response)`** (internal) — guard that returns the `DemoClock` or sends a 501 if the profile has no clock.
- **`RESTORE_BODY` / `CLOCK_BODY`** — Zod schemas validating the two `POST` bodies.

## Relationships

- **`scenarios/index.ts`** — source of `DEFAULT_SCENARIO`, `buildScenario`, and `isScenarioName`; the registry of available scenarios.
- **`scenarios/accounts.ts`** — provides `seedCredentials` returned by `GET /__test/scenario`.
- **`scenarios/support/database-snapshot.ts`** — provides `emptyDatabase`, `captureDatabase`, `restoreDatabaseCopy`; the snapshot mechanism behind build-once/replay.
- **`scenarios/support/demo-clock.ts`** — provides `getDemoClock()` and the `DemoClock` type for the `/__test/clock` routes.
- **`scenarios/support/doubles/mail-outbox.ts`** — provides `clearDemoOutbox` / `readDemoOutbox` for the `/__test/emails` route and post-restore cleanup.
- **`src/infrastructure/adapters/cache.ts`** — `clearCache` is called at the end of every restore.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — `resetMemoryRateLimitCounters` prevents stale budgets after a reseed.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` for all error/4xx/5xx replies.
- **`src/infrastructure/i18n/index.ts`** — `refreshLocaleOverrides` called post-restore.
- **`src/kernel/registry.ts`** — source of the `JobDeclaration` type consumed by `installDemo` and `jobLevers`.
- **`tests/integration/scenarios/demo-restore.test.ts`** — integration tests exercising the restore endpoint.
- **`tests/integration/scenarios/demo-routes.test.ts`** — integration tests for the remaining `/__test/*` routes.

## Notes

- **Build-once, replay-many.** `buildScenario` is non-idempotent (drives real checkout/payment flows over HTTP). The resulting DB snapshot is cached in a module-level `Map`; every later restore of the same name is a `restoreDatabaseCopy`, not a rebuild.
- **Restore serialization.** `restoreQueue` chains each `runRestore` behind the previous one. The queue itself swallows rejections so one failed restore never wedges subsequent ones; each caller still receives its own outcome.
- **`emptyDatabase` vs. `dropDatabase`.** The file deliberately avoids `dropDatabase` because it would clear index state, allowing a write to slip through an unbuilt unique index.
- **Clock is forward-only.** `POST /__test/clock` validates `advanceMs` as non-negative; the clock never moves backward.
- **`Map` for job levers.** A `Map` (not a plain object) is used so an arbitrary URL segment can never resolve to an inherited property like `constructor`.
- **Unauthenticated by design.** The demo profile only binds alongside a database that `npm run demo` just created on a loopback interface; there is no auth middleware on these routes.
- A `Stryker disable next-line all` comment guards the `logger.error` call in the restore error handler, excluding that line from mutation testing.
