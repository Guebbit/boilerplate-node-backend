---
source: scenarios/support/demo.ts
sha256: 308f3d67f1bd4838875703d509b61d569aeec8aaaa3786b8407fc2ab982c01bb
generated_at: 2026-10-14T07:02:53.181004+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/demo.ts

## Purpose

Control surface for the demo profile (`npm run demo`). It mounts six `/__test/*` routes that the paired frontend's e2e suite uses to restore a named scenario, inspect its state, read the mail outbox, advance the demo clock, and trigger background jobs. Nothing under `src/` references it; it is imported only by `scenarios/run-server.ts` and handed to `createApp` as the `extension.install` callback.

## Key elements

- **`UnknownScenarioError`** – Error subclass that renders the offending name via `JSON.stringify`; thrown by both `restoreScenario` (unknown registry name) and `installDemo` (non-string `scenario` body field).
- **`buildOnce`** (internal) – Builds a scenario into an empty database *once* per process, captures the resulting rows via `captureDatabase`, and caches the `ScenarioCopy` in a module-level `Map`. Subsequent restores of the same name replay the cached copy.
- **`restoreScenario`** (exported) – Public entry point. Chains the restore onto a module-level promise queue so overlapping calls are serialised. Each caller receives its own outcome; a failure never wedges later restores.
- **`runRestore`** (internal) – The actual work: `buildOnce` → `restoreDatabaseCopy` → set `currentScenario` → clear outbox → reset demo clock → `refreshLocaleOverrides` → `clearCache`.
- **`installDemo`** (exported) – Registers all six routes on the Express app. Stores the app in `demoApp` so the flow runner (inside `buildOnce`) can spin up a loopback listener.
- **`describeScenario`** (internal) – Assembles the `GET /__test/scenario` payload: current name, `seedCredentials` from accounts, and pinned `subjects` ids.
- **`requireClock`** (internal) – Guards the two clock routes; returns a 501 if no `DemoClock` instance was created.
- **Module state** – `copies` (Map of built scenarios), `currentScenario` (last restored name), `demoApp` (Express ref), `restoreQueue` (serialisation tail).

## Relationships

- **`scenarios/index.ts`** – Source of `DEFAULT_SCENARIO`, `buildScenario`, and `isScenarioName`; the registry that defines which names are valid.
- **`scenarios/accounts.ts`** – Provides `seedCredentials` (resolved `NODE_SEED_*` logins) surfaced in the `/__test/scenario` response.
- **`scenarios/jobs.ts`** – Provides the `DEMO_JOBS` map keyed by job name, dispatched by `POST /__test/jobs/:name`.
- **`scenarios/support/database-snapshot.ts`** – Supplies `emptyDatabase`, `captureDatabase`, and `restoreDatabaseCopy` used by the build-then-replay cycle.
- **`scenarios/support/demo-clock.ts`** – Supplies `getDemoClock()` / `DemoClock` type; the clock is reset on every restore and advanced only forward via the route.
- **`scenarios/support/doubles/mail-outbox.ts`** – `clearDemoOutbox` on restore, `readDemoOutbox` for `GET /__test/emails`.
- **`src/infrastructure/adapters/cache.ts`** – `clearCache` is called at the end of every restore so the app serves fresh data.
- **`src/infrastructure/adapters/logger.ts`** – `logger.error` for failed restores and failed job runs.
- **`src/infrastructure/i18n/index.ts`** – `refreshLocaleOverrides` reloaded after each restore so locale-dependent strings track the new data.
- **`tests/integration/scenarios/demo-restore.test.ts`** / **`demo-routes.test.ts`** – Integration tests that exercise the restore flow and the individual route contracts.

## Notes

- **Build-once semantics:** Building a scenario involves password hashing and hundreds of real HTTP-driven flows (checkout, payment, refund). It is deliberately non-idempotent and happens exactly once per process; every later restore is a cheap row replay.
- **Serialisation:** `restoreQueue` is a self-chaining promise. The queue itself swallows rejections (`.then(() => undefined, () => undefined)`) so one failed restore cannot block the next, while each caller still receives its own error.
- **No `dropDatabase()`:** The restore path uses `emptyDatabase` (delete-many per collection) specifically to preserve index builds. Dropping the database would clear unique indexes, allowing a racing write to succeed where a duplicate key should have been rejected.
- **Unauthenticated by design:** The demo profile binds only next to a freshly-created database; there is no auth middleware on any `/__test/*` route.
- **Clock is forward-only:** `POST /__test/clock` rejects negative or non-finite `advanceMs`. A test that needs time to "go back" must restore the scenario first.
- **`Stryker disable` comments:** Two `logger.error` lines carry mutation-testing suppression; do not remove without updating Stryker config.
