---
source: src/app/demo.ts
sha256: 30c79d68d2e4ff6f4e7a60dcf49207e1092cece5c794b102bdfaa6ee7816bdad
generated_at: 2026-10-01T12:44:28.980618+00:00
model: ollama:qwen3.8:27b
---

# src/app/demo.ts

## Purpose

Control surface for the demo profile, mounted only when `enableDemoProfile()` has been called (i.e. under `npm run demo`). Exposes six unauthenticated routes under `/__test/*` that a paired e2e frontend uses to restore named database scenarios, inspect the current seed, read captured "sent" emails, manipulate the demo clock, and trigger background jobs on demand.

## Key elements

- **`installDemo(app: Express)`** — Mounts all six `/__test/*` routes on the given Express instance; also stashes the app reference so the flow runner can open its own loopback listener. Only called in demo mode.
- **`restoreScenario(scenario?: string)`** — Public API for `POST /__test/restore`. Builds (or replays) the named scenario, writes it over the emptied database, clears the outbox, resets the demo clock, refreshes locale overrides, and clears the cache. Serialised through an internal promise queue so concurrent restores never interleave.
- **`UnknownScenarioError`** — Thrown when a requested scenario name is absent from the `SCENARIOS` registry or the `scenario` body field is not a string.
- **`buildOnce`** (internal) — Dynamically imports `@scenarios/index`, resolves the default name, validates via `isScenarioName`, then either returns a cached `ScenarioCopy` or runs `emptyDatabase → buildScenario → captureDatabase` to create one. The dynamic import keeps scenario factories out of every non-demo process.
- **`runRestore`** (internal) — Orchestrates the per-restore side-effects (outbox clear, clock reset, i18n refresh, cache clear) after `buildOnce` + `restoreDatabaseCopy`.
- **`describeScenario`** (internal) — Powers `GET /__test/scenario`; dynamically imports `@scenarios/accounts` for `seedCredentials` and returns the pinned subject ids alongside the loaded scenario name.
- **`copies`** — Process-lifetime `Map<string, ScenarioCopy>` that implements the build-once / replay-thereafter cache.

## Relationships

- **`src/app.ts`** — Calls `installDemo(app)` conditionally after `enableDemoProfile()`; provides the Express instance.
- **`scenarios/index.ts`** — Dynamically imported by `buildOnce` for `DEFAULT_SCENARIO`, `isScenarioName`, `buildScenario`.
- **`scenarios/accounts.ts`** — Dynamically imported by `describeScenario` for `seedCredentials` (the canonical login/password pairs).
- **`scenarios/jobs.ts`** — Dynamically imported by the `POST /__test/jobs/:name` handler for the `DEMO_JOBS` registry.
- **`src/infrastructure/runtime/database-snapshot.ts`** — Provides `emptyDatabase`, `captureDatabase`, `restoreDatabaseCopy` (the core of the build-and-replay mechanism).
- **`src/infrastructure/runtime/demo-clock.ts`** — `getDemoClock()` is used by the clock GET/POST routes and reset on every restore.
- **`src/infrastructure/adapters/demo-outbox.ts`** — `clearDemoOutbox()` is called after each restore; the `/__test/emails` route reads from the same outbox.
- **`src/infrastructure/adapters/cache.ts`** — `clearCache()` runs at the tail of every restore so stale responses don't survive a reseed.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` in the catch paths of each route handler.
- **`src/infrastructure/i18n/index.ts`** — `refreshLocaleOverrides()` re-reads locale data after a restore.
- **`tests/integration/app/demo-restore.test.ts`** / **`tests/integration/app/demo-routes.test.ts`** — Integration tests that exercise the restore and route behaviour end-to-end.
- **`src/modules/returns/tests/contract/api.contract.test.ts`** — Contract test that relies on the demo profile's seeded data.
- **`package.json`** — Defines the `npm run demo` script that boots the app with the demo profile enabled.

## Notes

- **Unauthenticated by design.** The demo profile binds beside a throwaway database created by `npm run demo`; no auth middleware is applied to `/__test/*` routes.
- **Dynamic imports are intentional.** `@scenarios/*` is always loaded via `import()` rather than top-level `import` so that scenario factories (bcrypt hashing, HTTP-driven flows) never enter a non-demo process's module graph.
- **Build-once is per-process, not per-request.** The `copies` map is module-scoped; a process restart resets the cache and forces a full rebuild.
- **Restore queue never rejects.** `restoreQueue` swallows both success and failure (`().then(→undefined, →undefined)`) so a failed restore doesn't wedge subsequent ones; the caller still receives the real error via the promise returned by `restoreScenario`.
- **Clock only moves forward.** `POST /__test/clock` rejects negative `advanceMs`; to "go back" you restore (which resets the clock to real time).
- **`Stryker disable` comments** mark lines that mutation testing would flag but are pure error-logging / fallback paths not worth mutating.
