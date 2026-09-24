---
source: tests/unit/infrastructure/i18n/overrides.test.ts
sha256: 9dde3e8d0853c6d3d13e7846be334ab03682365470f80e93b2da7253f4a8de06
generated_at: 2026-09-23T20:24:28.757814+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/overrides.test.ts

## Purpose

Unit tests for the locale-override layer. Validates three invariants the override mechanism must preserve: deployed files remain usable when no provider is registered, deleted overrides actually stop resolving, and languages without a deployed dictionary are skipped. Also covers the periodic refresh timer that propagates edits across workers.

## Key elements

- **`describe('locale overrides')`** — Core overlay behavior: baseline resolution, stored override winning over the file, deep-merge preserving sibling keys, deleted-row cleanup, failed-provider resilience (keeps last good overlay), unsupported-language skip, and cross-language isolation.
- **`describe('the override refresh interval')`** — Timer lifecycle: period read from `NODE_LOCALE_OVERRIDE_REFRESH_MS`, fallback to 60 s on unset/zero/negative/non-numeric values, one-call-per-tick cadence, idempotent start (second `startLocaleOverrideRefresh` does not double the timer), stop/start cycle, and safe no-op stop when never started.
- **`beforeEach`** — Registers a null provider and re-initialises `i18next` with `loadLocaleResources()` so each test starts from a clean global state.
- **`afterEach`** — Calls `resetLocaleOverrides()` and re-registers `undefined` provider to prevent cross-test leakage.
- **Fake timers** — Timer tests wrap `startLocaleOverrideRefresh` / `stopLocaleOverrideRefresh` in `jest.useFakeTimers()` and advance with `jest.advanceTimersByTime`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Barrel export from which all functions under test (`t`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `getOverrideRefreshMs`, `listSupportedLocales`, `loadLocaleResources`, `resetLocaleOverrides`) are imported via `@infrastructure/i18n`.
- **`src/infrastructure/i18n/overrides.ts`** — The module under test; every assertion exercises its exported API.
- **`src/infrastructure/i18n/catalog.ts`** — Source of `listSupportedLocales()` and `loadLocaleResources()` used to seed `i18next` in `beforeEach`.
- **`src/infrastructure/i18n/context.ts`** — Provides the `t` helper that all resolution assertions call.

## Notes

- `i18next` is re-initialised per test (not shared) because `addResourceBundle` mutates a global singleton; a leaked override would make subsequent tests order-dependent.
- The timer tests save and restore `process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS` to avoid leaking config into other test files in the same worker.
- `startLocaleOverrideRefresh` is called twice in one test to verify idempotency — a second call must not create a second interval, or Mongo read rate would double for the process lifetime.
