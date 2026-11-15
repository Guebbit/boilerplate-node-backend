---
source: src/infrastructure/i18n/overrides.ts
sha256: 7d916ea6222687bee7b75a7fb419bb0da4c3b7d656ffa2e4209949e4591d40b4
generated_at: 2026-11-14T18:09:22.012632+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/overrides.ts

## Purpose

Manages the database overlay for i18n: admin-edited translation copy layered on top of the deployed dictionary files, plus which registered languages are switched on or off. Provides a single refresh operation that fills both the copy and the served-language list from one read, so they never disagree. Nothing here is awaited on the request path.

## Key elements

- **`LocaleOverlay`** (interface) — The data one refresh returns: nested per-locale override trees and `activeTags` / `inactiveTags` for served languages.
- **`LocaleOverrideProvider`** (type) — Async function that returns a `LocaleOverlay`. Rejection leaves the last good overlay in place.
- **`registerLocaleOverrideProvider`** — Sets (or clears, by passing `undefined`) the provider. Unregistered is the default state; unit tests resolve keys from deployed files only.
- **`isLocaleOverrideAvailable`** — Boolean check used by the caller to decide whether to start the refresh timer at all.
- **`refreshLocaleOverrides`** — Pulls the overlay from the provider and applies it. Never rejects; logs a warning and keeps the last good state on failure.
- **`resetLocaleOverrides`** — Restores all locales to deployed files and clears served-language tags. For shutdown and tests that need a clean i18next instance.
- **`startLocaleOverrideRefresh`** / **`stopLocaleOverrideRefresh`** — Start/stop an `unref`'d `setInterval` that calls `refreshLocaleOverrides`, so edits on one worker propagate to the others.
- **`getOverrideRefreshMs`** — Reads the interval (in ms) from `localeConfig().NODE_LOCALE_OVERRIDE_REFRESH_MS`.
- **`restoreFileBaseline`** (private) — Re-adds each supported locale's deployed dictionary to i18next.
- **`applyLocaleOverrides`** (private) — Restores baseline for *every* supported locale, then merges overrides with `deep=true, overwrite=true`. Warns and skips locales with no deployed file.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — Provides `listSupportedLocales` and `readLocaleDictionary`, used to know which locales exist and to restore file baselines.
- **`src/infrastructure/i18n/served.ts`** — Provides `setServedLanguages` / `resetServedLanguages`, used to toggle the active/inactive language tags.
- **`src/infrastructure/i18n/config.ts`** — Supplies `localeConfig()` for the refresh interval.
- **`src/infrastructure/adapters/logger.ts`** — Imported as `logger`; used to emit warnings on failed refreshes and on locales with no deployed dictionary.
- **`src/infrastructure/i18n/index.ts`** — Re-exports this module for external consumers.
- **`src/modules/locales/services/overlay.ts`** — Likely the concrete `LocaleOverrideProvider` that reads the overlay from the database.
- **`src/modules/locales/module.ts`** — Composition root that calls `registerLocaleOverrideProvider`.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Boot/shutdown path that calls `startLocaleOverrideRefresh` / `stopLocaleOverrideRefresh` / `resetLocaleOverrides`.
- **`src/modules/locales/services/messages.ts`** — The `locales` module responsible for safely expanding dotted keys (rejecting `__proto__`, ambiguous keys) before they reach the nested `overrides` structure.

## Notes

- **Stale-beats-broken:** A provider rejection keeps the last good overlay. The reset path (file baseline + cleared served tags) is only for shutdown and tests, never for a transient DB failure.
- **Every supported locale is restored, not just overridden ones.** Deleting a locale's last override must return it to the deployed file, not leave it mid-override.
- **`deep` + `overwrite` both `true`** on `i18next.addResourceBundle`: the override names a single leaf; sibling keys in the namespace must survive the merge, and DB copy wins on conflict.
- **Nested, not flat, in `LocaleOverlay.overrides`.** Only the `locales` module may expand dotted keys (it guards against `__proto__` and ambiguous string/group keys); infrastructure must not re-do that.
- **No lease on the refresh timer.** The i18next resource bundle is per-process; a lease would pick one worker to update and starve the rest. The `unref`'d interval is the correct shape because each worker must apply the update to its own in-memory bundle.
- **Unregistered provider is a valid state.** Tests that resolve a key without booting the full app get deployed files and nothing else.
- **Stryker annotations** (`disable` / `restore`) surround logger calls and the skipped-locale branch to suppress mutation testing on error-handling paths.
