# tests/unit/infrastructure/i18n/overrides.test.ts

## Purpose

Unit tests for the locale-override overlay layer. Validates that overrides correctly layer on top of deployed translation files without corrupting them, that deletion and provider failures are handled safely, and that the background refresh timer behaves predictably across start/stop lifecycles.

## Key elements

- **`describe('locale overrides')`** — eight tests covering: baseline resolution with no provider, override winning over the file, deep-merge preserving sibling keys, deletion reverting to baseline, failed refresh retaining last-good overlay, unsupported-locale overrides being ignored, and cross-language isolation.
- **`describe('the override refresh interval')`** — seven tests covering: reading `NODE_LOCALE_OVERRIDE_REFRESH_MS`, fallback to 60 000 ms for invalid values, periodic provider invocation, idempotent `startLocaleOverrideRefresh`, stop-then-restart, and safe `stopLocaleOverrideRefresh` when never started.
- **`beforeEach` / `afterEach`** — initialises `i18next` fresh per test, registers/resets the override provider, and restores the environment variable.
- **`enTranslation`** — imported from `src/locales/en.json`; used as the source-of-truth fixture for baseline assertions.

## Relationships

- **`src/infrastructure/i18n/overrides.ts`** — the module under test; supplies `registerLocaleOverrideProvider`, `resetLocaleOverrides`, `refreshLocaleOverrides`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, and `getOverrideRefreshMs`.
- **`src/infrastructure/i18n/index.ts`** — barrel the test imports from; re-exports everything from `overrides.ts` plus `t`.
- **`src/infrastructure/i18n/catalog.ts`** — provides `listSupportedLocales` and `loadLocaleResources`, which the test feeds into `i18next.init` to mirror production boot.
- **`src/infrastructure/i18n/context.ts`** — holds the mutable provider registration and override state that `registerLocaleOverrideProvider` / `resetLocaleOverrides` manipulate.

## Notes

- `i18next` is initialised per test (not shared) because `addResourceBundle` mutates a global; a leaked override would create order-dependent failures.
- The "deleted override" test calls `refreshLocaleOverrides` twice with different provider return values to prove the baseline is restored before re-applying — a single snapshot assertion would not catch a missing reset step.
- Timer tests set `NODE_LOCALE_OVERRIDE_REFRESH_MS` in `process.env` and restore it in `afterEach`; the `ORIGINAL_REFRESH_MS` guard handles both pre-set and unset environments.
- The "runs one timer however many times it is started" test guards against double-arming the interval on repeated boot calls (e.g., in a dev hot-reload loop).
