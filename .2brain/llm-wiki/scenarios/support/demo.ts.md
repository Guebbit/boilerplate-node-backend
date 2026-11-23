---
source: scenarios/support/demo.ts
source_sha256: b62d835f1de8f3cfd0dc52b8cec913007673f3d8cb07545a013e90b15844700f
context_sha256: ba738203d5d210afc7a9f24a812a05d4801b691436d4fa4c3cef997aa48939a3
generated_at: 2026-11-22T01:46:49.234595+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/demo.ts

## Purpose
Control surface for the demo profile (`npm run demo`). It mounts test-only HTTP routes under `/__test/*` that let the paired frontend's e2e suite restore named scenarios, inspect emails and the clock, advance time, and run jobs. It is mounted only by `scenarios/run-server.ts`, which passes `installDemo` and `restoreScenario` to `createApp`. Nothing under `src/` knows about it, so production has no such routes. There is no auth, because the profile only binds next to a database that `npm run demo` just created.

## Key elements
- `installDemo(app, jobs)`: mounts the routes. It keeps `app` in a module-level `demoApp` for the flow runner and builds a job lever map from `jobs`. The routes it registers (in the visible part of the file):
  - `POST /__test/restore`: validates the body with zod (`scenario` optional). Returns 204 on success, 400 for bad input or an unknown scenario, and 500 (logged) otherwise.
  - `GET /__test/scenario`: returns `{ scenario, accounts, subjects }`.
  - `GET /__test/clock`: returns `{ now, offsetMs }`, or 501 if there is no demo clock.
  - `POST /__test/clock`: validates `advanceMs` (a non-negative number) and moves the clock forward only.
- The header docblock also documents `GET /__test/emails`, `POST /__test/jobs/:name` and `GET /__test/jobs`. It says per-module levers come from `./doubles/<module>/levers.ts`, with `installModuleLevers` imported from `levers.generated`.
- `restoreScenario(scenario?)`: the public, queued restore. Each call chains onto `restoreQueue`, so restores never overlap. The queue never rejects, so a failed restore doesn't block later ones, and each caller still sees its own outcome.
- `UnknownScenarioError`: thrown for an unknown scenario name or a non-string `scenario` field.
- `buildOnce(name)`: builds a scenario once per process. It empties the database, calls `buildScenario(name, demoApp)`, captures the database, and caches the result in `copies`. Later calls return the cached copy. It throws if flows need an app and `installDemo` never supplied one.
- `runRestore(scenario)`: replays the copy with `restoreDatabaseCopy`, then sets `currentScenario`. After that it clears the mail outbox, resets the demo clock, resets the in-memory rate-limit counters, refreshes locale overrides and clears the cache.
- `describeScenario()`: builds the `GET /__test/scenario` payload from `seedCredentials` and the stored `subjects`.
- `requireClock(response)`: returns the clock, or sends a 501 and returns `undefined`.
- `jobLevers(jobs)`: a `Map` from the URL segment to the job declaration, with `:` replaced by `-` (`reap:orders` → `reap-orders`).
- `RESTORE_BODY` / `CLOCK_BODY`: zod schemas for the request bodies.

## Relationships
- `scenarios/index.ts`: supplies `DEFAULT_SCENARIO`, `isScenarioName` and `buildScenario`.
- `scenarios/accounts.ts`: supplies `seedCredentials`, exposed as `accounts` in the scenario description.
- `scenarios/support/database-snapshot.ts`: supplies `captureDatabase`, `emptyDatabase`, `restoreDatabaseCopy` and the `DatabaseCopy` type.
- `scenarios/support/demo-clock.ts`: supplies `getDemoClock` and the `DemoClock` type, used for reset and the clock routes.
- `scenarios/support/doubles/mail-outbox.ts`: supplies `clearDemoOutbox` and `readDemoOutbox`.
- `src/infrastructure/adapters/cache.ts`: `clearCache` runs on every restore.
- `src/infrastructure/adapters/logger.ts`: logs restore failures.
- `src/infrastructure/http/middlewares/rate-limit-store.ts`: `resetMemoryRateLimitCounters` runs on restore.
- `src/infrastructure/http/response.ts`: `rejectResponse` builds the 400, 500 and 501 responses.
- `src/infrastructure/i18n/index.ts`: `refreshLocaleOverrides` runs on restore. `overrides.ts` is a graph neighbour, but no direct use is visible in the shown code.
- `src/kernel/registry.ts`: provides the `JobDeclaration` type for job levers.
- `tests/integration/scenarios/demo-restore.test.ts` and `demo-routes.test.ts`: integration tests for this file (by name; their contents are not visible).
- `package.json`: the `npm run demo` script that starts this profile.

## Notes
- Never use `dropDatabase()` for emptying. It would discard each model's index build, so a racing write could succeed where a unique index should refuse it.
- Replaying a copy, rather than rebuilding, matters because building `shop` is expensive: fourteen password hashes plus several hundred HTTP requests through the real flows. It is also not idempotent, since checking out twice makes two orders.
- A restore must follow a successful `installDemo` call for scenarios that have flows to drive, because `demoApp` is set there.
- Restores are serialised on purpose. Concurrent restores would interleave writes, and concurrent replays of one copy would collide on `_id`.
- The `requireClock` 501 path exists for profiles with no demo clock.
