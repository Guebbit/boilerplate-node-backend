---
source: tests/unit/infrastructure/i18n/overrides.test.ts
sha256: 0b96569d9ae366bd1d76acba00682c2ac7854d8c0e073a657670b603cdd5f34b
generated_at: 2026-09-27T16:08:22.002160+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/overrides.test.ts

## Purpose

Unit tests for the locale override overlay layer. They verify that stored per-locale edits correctly merge over the deployed JSON files, that a refresh restores the baseline before re-applying (so deleted rows actually stop answering), that a provider failure preserves the last good overlay, and that the background refresh timer polls at the configured interval without double-registering.

## Key elements

- **`describe('locale overrides')`** — Core behavioral tests: baseline resolution with no provider, override winning over the file, deep-merge preserving sibling keys, deletion dropping a prior override, provider failure keeping stale overlay, skipping languages with no deployed dictionary, and per-language isolation.
- **`describe('the override refresh interval')`** — Timer tests using `jest.useFakeTimers()`: reads `NODE_LOCALE_OVERRIDE_REFRESH_MS`, falls back to 60 s for invalid values, re-reads once per period, idempotent `startLocaleOverrideRefresh`, stop/restart cycle, and safe `stopLocaleOverrideRefresh` when never started.
- **`describe('isLocaleOverrideAvailable')`** — Confirms the gate used by the boot sequence (`app.ts`) before starting the timer.
- **`beforeEach` / `afterEach`** — Initialises a fresh `i18next` instance per test (because `addResourceBundle` mutates a global) and resets provider + overrides between tests.
- **`enTranslation`** — Imported from `src/locales/en.json`; serves as the ground-truth baseline for assertions.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Barrel module; all tested functions (`t`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `listSupportedLocales`, `loadLocaleResources`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `getOverrideRefreshMs`, `isLocaleOverrideAvailable`, `resetLocaleOverrides`) are imported from here.
- **`src/infrastructure/i18n/overrides.ts`** — The module under test; defines the provider registration, refresh logic, deep-merge application, and the interval timer.
- **`src/infrastructure/i18n/catalog.ts`** — Source of `listSupportedLocales` and `loadLocaleResources`, which the tests use to seed `i18next` and to assert which locales are negotiable.
- **`src/infrastructure/i18n/context.ts`** — Source of the `t` helper that resolves keys through the active `i18next` instance; the tests call it directly to assert translation output.

## Notes

- `i18next` is re-initialised in every `beforeEach` rather than shared across the suite; a leaked `addResourceBundle` call would make subsequent tests order-dependent.
- The refresh interval is configured via the `NODE_LOCALE_OVERRIDE_REFRESH_MS` environment variable; the tests save/restore it in `afterEach`.
- A failed provider call (e.g. Mongo outage) is expected to **resolve** (not reject) and retain the previous overlay — the test asserts `resolves.toBeUndefined()`.
- The comment referencing ticket `LOCALES_OPTIONAL_0925` step 3f ties `isLocaleOverrideAvailable` to the `app.ts` boot sequence: the timer is only started when a provider exists.
- `startLocaleOverrideRefresh` must be idempotent; the test explicitly calls it twice and asserts the provider is hit only once per period.
