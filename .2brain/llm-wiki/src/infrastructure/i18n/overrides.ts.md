---
source: src/infrastructure/i18n/overrides.ts
sha256: 563377aac0a1e9498fc049632899b1c40be9e3549bfd9aec19d8d09a7edfecc7
generated_at: 2026-11-08T03:37:15.533904+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/overrides.ts

## Purpose

Manages the database overlay for i18n: it pulls admin-edited translation copy and the active/inactive language list from a registered provider, then layers that data on top of the deployed dictionary files inside i18next's in-process resource bundle. A single refresh fills both the copy and the served-language list so they never come from two different reads. Nothing here is awaited on the request path.

## Key elements

- **`LocaleOverlay`** — interface describing one refresh result: nested `overrides` per locale, plus `activeTags` / `inactiveTags` for registered languages.
- **`registerLocaleOverrideProvider` / `isLocaleOverrideAvailable`** — composition-root hooks. The provider is `undefined` by default (unit tests get only deployed files).
- **`restoreFileBaseline`** *(private)* — re-adds every supported locale's deployed dictionary to i18next, dropping prior overrides.
- **`resetLocaleOverrides`** — full reset (baseline + served languages). Intended for shutdown and tests; a failed refresh does **not** call this.
- **`applyLocaleOverrides`** — restores the baseline for *all* supported locales, then deep-merges each override via `i18next.addResourceBundle(lng, 'translation', overrides, true, true)`. Logs a warning for locales without a deployed file.
- **`applyLocaleOverlay`** — applies copy overrides **and** the served-language list in one call.
- **`refreshLocaleOverrides`** — invokes the provider, applies the result. **Never rejects**; a failure logs a warning and keeps the last good overlay in place.
- **`getOverrideRefreshMs`** — reads the interval (in ms) from `localeConfig().NODE_LOCALE_OVERRIDE_REFRESH_MS`.
- **`startLocaleOverrideRefresh` / `stopLocaleOverrideRefresh`** — manage a `setInterval` that re-pulls the overlay so edits made on one worker reach the others. The timer is `unref`'d so it never holds the process open.

## Relationships

- **`./catalog`** — provides `listSupportedLocales` and `readLocaleDictionary`, used to know which locales have deployed files and to restore the baseline.
- **`./served`** — provides `setServedLanguages` / `resetServedLanguages`, used to toggle which registered languages are active.
- **`./config`** — supplies `localeConfig` for the refresh interval.
- **`@infrastructure/adapters/logger`** — emits warnings when overrides are unavailable or stored for unsupported locales.
- **`@infrastructure/i18n/index`** — re-exports this module for the rest of the codebase.
- **`src/modules/locales/services/overlay`** — the concrete provider implementation that reads the overlay from the database (the only safe place to expand dotted keys).
- **`src/app.ts`** — composition root; registers the provider and starts the refresh timer at boot.
- **`src/infrastructure/runtime/server-lifecycle`** — shutdown path; calls `stopLocaleOverrideRefresh` and `resetLocaleOverrides`.

## Notes

- **No lease on the refresh timer.** A `withLease` pattern would pick one worker to run and skip the rest — wrong here because `i18next.addResourceBundle` writes to a *per-process* bundle. Every worker must apply the update independently. The docblock suggests a domain-event broadcast as the future fix if the 60 s staleness window becomes insufficient.
- **Overrides are nested objects, not dotted-key strings.** Only the `locales` module is allowed to expand dotted keys (it rejects `__proto__` and ambiguous strings); infrastructure must not repeat that logic.
- **A failed refresh is silent to the caller.** `refreshLocaleOverrides` swallows the rejection so that boot, the interval, and post-write hooks can all fire it without try/catch. Stale copy is preferred over reverting to file baseline on every transient DB hiccup.
- **`resetLocaleOverrides` is not a recovery path.** It is for clean shutdown and test teardown. A provider that throws leaves the last good overlay untouched.
- **Stryker mutations** are disabled around `logger.warn` calls (the warnings are side-effect-free in test).
