---
source: src/app/demo.ts
sha256: 7197486046429ad68529f34e4fd4cb57302cafcff83c707059e8a5fdcc6ef46c
generated_at: 2026-09-23T17:35:09.196426+00:00
model: ollama:qwen3.8:27b
---

# src/app/demo.ts

## Purpose

Control surface for the demo profile, mounted only when `enableDemoProfile()` has been called (via `npm run demo`). Exposes three unauthenticated routes under `/__test/*` that let the paired frontend's e2e suite reset the database to a named scenario, inspect what was restored, and read the email outbox. It lives at the app tier so that `eslint-plugin-boundaries` permits reaching `scenarios/` without pulling scenario factories into every process.

## Key elements

- **`installDemo(app: Express)`** (exported) — registers the three routes and stores `app` so the flow runner can drive real HTTP during a build.
- **`restoreScenario(scenario?: string)`** (exported) — public entry point that queues a restore behind any in-flight one. Returns a per-caller promise; the internal queue never rejects so a failure doesn't wedge subsequent restores.
- **`UnknownScenarioError`** (exported) — thrown for a name absent from the `SCENARIOS` registry or a non-string `scenario` body field.
- **`buildOnce(name)`** (module-private) — dynamically imports `@scenarios/index`, builds the scenario into an empty database _once per process_, captures a `DatabaseCopy`, and caches it in the `copies` map. Subsequent calls for the same name are replays.
- **`runRestore(scenario)`** (module-private) — orchestrates a single restore: build-or-replay → `restoreDatabaseCopy` → `clearDemoOutbox` → `refreshLocaleOverrides` → `clearCache`.
- **`describeScenario()`** (module-private) — dynamically imports `@scenarios/accounts` to return `seedCredentials` plus the pinned `subjects` map for the current scenario.
- **`copies`** / **`currentScenario`** / **`restoreQueue`** (module-private state) — cache of built copies, the name last restored, and the tail promise of the serialisation queue.

## Relationships

- **`scenarios/index.ts`** — dynamically imported inside `buildOnce`; supplies `DEFAULT_SCENARIO`, `isScenarioName`, and `buildScenario`.
- **`scenarios/accounts.ts`** — dynamically imported inside `describeScenario`; supplies `seedCredentials`.
- **`src/infrastructure/runtime/database-snapshot.ts`** — `emptyDatabase`, `captureDatabase`, `restoreDatabaseCopy`, and the `DatabaseCopy` type are the snapshot primitives used by build/restore.
- **`src/infrastructure/adapters/demo-outbox.ts`** — `clearDemoOutbox` (after each restore) and `readDemoOutbox` (served by `GET /__test/emails`).
- **`src/infrastructure/adapters/cache.ts`** — `clearCache` is called as the final step of every restore.
- **`src/infrastructure/i18n/index.ts`** — `refreshLocaleOverrides` is called after the outbox is cleared.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` in both route error handlers.
- **`src/app.ts`** — imports `installDemo` unconditionally; the dynamic-import split in this file exists to keep `scenarios/*` out of the static dependency tree of `app.ts`.
- **`tests/integration/app/demo-restore.test.ts`** / **`tests/integration/app/demo-routes.test.ts`** — integration tests exercising the restore flow and the three routes respectively.
- **`package.json`** — the `demo` script (`npm run demo`) is the only path that calls `enableDemoProfile()` and thus ever mounts these routes.

## Notes

- Scenario factories are **dynamically imported**, never statically, so a production process that never enables the demo profile pays zero cost for `scenarios/*`.
- `buildOnce` empties the database _before_ building; `restoreDatabaseCopy` empties _before_ writing a replay. The two paths never double-empty.
- The restore queue serialises via a promise chain (`restoreQueue`); it never rejects, so a failed restore cannot block the next one.
- `emptyDatabase` is used instead of `dropDatabase` to preserve index state and avoid a race where a write lands on an unbuilt unique index.
- The `demoApp` handle is stored for the scenario flow runner (`scenarios/flows/loopback.ts`) to drive real HTTP against a throwaway listener during a one-time build.
