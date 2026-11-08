---
source: tests/unit/infrastructure/i18n/overrides.test.ts
sha256: a34ccaa295ac8c2f70c92430a69c94cf1d38fb630f4dc473f85801f9b359a594
generated_at: 2026-11-08T10:19:46.203667+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/overrides.test.ts

## Purpose

Unit tests for the locale-override overlay: the mechanism that lets a runtime API inject or retract per-key translation edits on top of the deployed JSON files. The suite pins three invariants the layer is designed to protect — baseline fallback when no provider exists, non-accumulation of deleted overrides, and silent skipping of undeployed locales — plus the refresh-timer lifecycle that propagates edits across workers.

## Key elements

- **`overlayOf(overrides, activeTags, inactiveTags)`** – Local helper that builds a `LocaleOverlay` object for use as a mock provider return value. Defaults to an empty overlay.
- **`describe('locale overrides')`** – Core behaviour suite. Verifies: baseline resolution without a provider; stored override winning over the file; deep-merge preserving sibling keys; deletion restoring the original; last-good overlay retained on provider failure; undeployed locales skipped (i18next bundle absent); per-language isolation (overriding `it` leaves `en` untouched).
- **`describe('the override refresh interval')`** – Timer-lifecycle suite using `jest.useFakeTimers()`. Covers: reading `NODE_LOCALE_OVERRIDE_REFRESH_MS` (default 60 000 ms); rejection of zero, negative, and non-numeric values; exactly one re-read per period; idempotent `startLocaleOverrideRefresh` (second call does not create a second timer); stop-then-restart; safe no-op stop.
- **`describe('isLocaleOverrideAvailable')`** – Confirms the gate used by `app.ts` before starting the timer: `false` with no provider, `true` after registration.
- **`beforeEach` / `afterEach` hooks** – Register/unregister the provider and `resetLocaleOverrides` to prevent cross-test leakage. i18next is reinitialised per test because `addResourceBundle` mutates global state.

## Relationships

- **`src/infrastructure/i18n/index.ts`** – Barrel re-export; every symbol under test (`t`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `getOverrideRefreshMs`, `isLocaleOverrideAvailable`, `listSupportedLocales`, `loadLocaleResources`, `LocaleOverlay`) is imported from here.
- **`src/infrastructure/i18n/overrides.ts`** – Implementation of the overlay refresh, deep-merge, and timer logic that this file exercises.
- **`src/infrastructure/i18n/catalog.ts`** – Source of `loadLocaleResources` and `listSupportedLocales`, which seed the per-test i18next instance.
- **`src/infrastructure/i18n/context.ts`** – Source of `t` and the provider registration/reset functions.
- **`tests/support/environment.ts`** – Provides `setEnvironment`, used to inject `NODE_LOCALE_OVERRIDE_REFRESH_MS` values (valid and invalid) into the config the tested code reads.

## Notes

- i18next is **initialised fresh in every test** (`beforeEach` calls `i18next.init`). This is deliberate: `addResourceBundle` mutates a singleton, and a leaked override would silently corrupt the next test's expectations.
- The "deleted override" test (two consecutive `refreshLocaleOverrides` calls with different provider outputs) is the regression guard for the "restore baseline before re-apply" step inside the implementation.
- Timer tests rely on `jest.useFakeTimers()`; the idempotency test (`runs one timer however many times it is started`) specifically guards against a double-timer bug that would double Mongo read rate for the process lifetime.
- The `en.json` fixture is imported directly from `shared/locales/` rather than mocked, so the baseline assertions are tied to the real deployed copy.
