---
source: tests/unit/infrastructure/i18n/overrides.test.ts
sha256: d7061054f1bc5ec21269e7041985172724084b0e1448afb7cd97c7e1ea0d52ac
generated_at: 2026-10-15T13:16:49.374301+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/overrides.test.ts

## Purpose

Unit tests for the locale override overlay: verifying that externally-sourced translations (via a provider callback) correctly deep-merge over deployed JSON files, that a refresh cycle restores the baseline before re-applying (so deletions take effect), that failed providers keep the last good state, and that the periodic refresh timer behaves correctly (interval, idempotent start, clean stop).

## Key elements

- **`describe('locale overrides')`** — Core overlay semantics: no-provider passthrough, override wins over file, sibling keys survive a partial override, deleted rows stop answering, provider failure preserves last good overlay, unknown locales are skipped, one locale's override doesn't leak into another.
- **`describe('the override refresh interval')`** — Timer behavior: reads `NODE_LOCALE_OVERRIDE_REFRESH_MS`, defaults to 60 s, rejects zero/negative/garbage values, fires the provider once per period, is idempotent on repeated `startLocaleOverrideRefresh()`, stops cleanly, and is safe to stop when never started. Uses `jest.useFakeTimers()`.
- **`describe('isLocaleOverrideAvailable')`** — Confirms the gate function returns `false` with no provider and `true` after registration.
- **`beforeEach` / `afterEach` (top-level)** — Registers an undefined provider, re-initialises `i18next` fresh, and resets override state to prevent cross-test contamination.

## Relationships

- **`src/infrastructure/i18n/overrides.ts`** — The module under test; all exported functions (`registerLocaleOverrideProvider`, `refreshLocaleOverrides`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `resetLocaleOverrides`, `isLocaleOverrideAvailable`, `getOverrideRefreshMs`) are exercised here.
- **`src/infrastructure/i18n/index.ts`** — Barrel import the tests use to pull in all override functions plus `t`, `loadLocaleResources`, `listSupportedLocales`.
- **`src/infrastructure/i18n/catalog.ts`** — Source of `listSupportedLocales()` and `loadLocaleResources()` used to seed `i18next`.
- **`src/infrastructure/i18n/context.ts`** — Source of the `t` translation function the assertions call.
- **`tests/support/environment.ts`** — Provides `setEnvironment()` to inject or clear `NODE_LOCALE_OVERRIDE_REFRESH_MS` without touching `process.env` directly.

## Notes

- `i18next` is initialised **per test** (in `beforeEach`) rather than shared, because `addResourceBundle` mutates a global and a leaked override would make later tests order-dependent.
- The `enTranslation` JSON import is used as the ground-truth baseline for "no override" and "override removed" assertions.
- The refresh-interval describe block sets and restores `jest.useFakeTimers()` in its own `beforeEach`/`afterEach`, separate from the top-level hooks.
- `stopLocaleOverrideRefresh()` is called in the interval block's `afterEach` *before* `jest.useRealTimers()` to avoid a pending timer firing against the real clock.
