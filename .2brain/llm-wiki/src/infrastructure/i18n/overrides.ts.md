---
source: src/infrastructure/i18n/overrides.ts
source_sha256: 85f4f9bff236738a779a7cc13781ef6420de3ee5a087b1fecc4ff5b937a8d8d9
context_sha256: 582068d17ed59389add28660dcbde108b0bb588e3deda689a58203840f6f0f91
generated_at: 2026-11-22T02:56:29.635951+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/i18n/overrides.ts

## Purpose
Implements the database overlay for i18n: admin-edited copy layered on top of the deployed dictionaries from `./catalog`, plus which registered languages are switched on or off (`./served`). One refresh fills both, so copy and served-language list never come from two different reads. Nothing is awaited on the request path.

## Key elements
- `LocaleOverlay` — the shape one refresh returns: `overrides` (nested trees keyed by locale), `activeTags`, `inactiveTags`.
- `LocaleOverrideProvider` — `() => Promise<LocaleOverlay>`; a rejection leaves the last good overlay in place.
- `registerLocaleOverrideProvider(provider?)` — sets or clears the provider. Unregistered is the valid default.
- `isLocaleOverrideAvailable()` — whether a provider is registered.
- `refreshLocaleOverrides()` — calls the provider and applies the result. Never rejects: failures are logged with `logger.warn` and the last overlay is kept. Resolves immediately if no provider is registered.
- `resetLocaleOverrides()` — restores the file baseline for every supported locale and calls `resetServedLanguages()`. Meant for shutdown and tests.
- `getOverrideRefreshMs()` — reads `NODE_LOCALE_OVERRIDE_REFRESH_MS` from `localeConfig()`.
- `startLocaleOverrideRefresh()` / `stopLocaleOverrideRefresh()` — start (idempotent) or clear the interval that calls `refreshLocaleOverrides`. The timer is `unref`'d.
- Private helpers:
  - `restoreFileBaseline` — re-adds each supported locale's file dictionary to i18next.
  - `applyLocaleOverrides` — restores the baseline, then merges each override tree into the `translation` namespace with `addResourceBundle(..., deep=true, overwrite=true)`.
  - `applyLocaleOverlay` — applies the overrides, then calls `setServedLanguages(activeTags, inactiveTags)`.

## Relationships
- `./catalog` supplies `listSupportedLocales` and `readLocaleDictionary`, the file baseline.
- `./served` receives `setServedLanguages` and `resetServedLanguages` for the on/off language state.
- `@infrastructure/i18n/config` provides `localeConfig()` for the refresh interval.
- `@infrastructure/adapters/logger` is used for the warnings.
- It mutates the global `i18next` instance's resource bundles directly.
- The `locales` module (`src/modules/locales/...`) is the expected source of the overlay and the nested override trees, since the code says only that module can safely expand dotted keys. Neighbors such as `src/modules/locales/module.ts` and `src/modules/locales/services/overlay.ts` fit this role, but the file itself only names the `locales` module.
- Other neighbors (`src/app/boot-rendering.ts`, `src/app/process-boot.ts`, `src/infrastructure/runtime/server-lifecycle.ts`) are in the graph, but this file does not show how they use it.

## Notes
- Every refresh restores all supported languages to the file baseline before re-applying overrides, so deleting a language's last override reverts it. This is synchronous, so nothing sees a half-reset state.
- Overrides for a locale with no deployed dictionary file are skipped and logged as a warning; only languages with a deployed file can be overridden.
- A failed refresh keeps the last good overlay. `resetLocaleOverrides` is deliberately not that path.
- The refresh deliberately does not use `withLease`. i18next's resource bundle is per process, so every process must apply the update itself. A lease would starve the other copies. Staleness is bounded by the refresh interval (the comment cites 60s).
- Overrides are expected already nested, because `infrastructure` must not expand dotted keys itself.
- `// Stryker disable/restore` comments exclude the logging calls from mutation testing.
