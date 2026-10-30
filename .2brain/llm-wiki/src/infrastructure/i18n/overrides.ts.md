---
source: src/infrastructure/i18n/overrides.ts
sha256: 563377aac0a1e9498fc049632899b1c40be9e3549bfd9aec19d8d09a7edfecc7
generated_at: 2026-10-29T02:07:23.295873+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/overrides.ts

## Purpose

Manages the database-served i18n overlay: admin-edited copy layered on top of the deployed dictionary files in `./catalog`, and the on/off switch for registered languages in `./served`. Exposes a provider-registration pattern so the composition root can plug in the data source (Mongo, in production) while keeping the infrastructure layer free of persistence concerns. A single `LocaleOverlay` read fills both the copy and the language list atomically.

## Key elements

- **`LocaleOverlay`** — shape returned by a provider: `overrides` (nested `Record<locale, Record<key, unknown>>`), `activeTags`, `inactiveTags`.
- **`LocaleOverrideProvider`** — `() => Promise<LocaleOverlay>`; the contract the composition root fulfils.
- **`registerLocaleOverrideProvider(provider?)`** — sets (or clears) the module-level provider. `undefined` is a valid, default state (unit tests get file-only dictionaries).
- **`isLocaleOverrideAvailable()`** — boolean guard so callers can skip starting a refresh timer when no provider exists.
- **`applyLocaleOverrides(overridesByLocale)`** — restores every supported locale to its file baseline via `i18next.addResourceBundle`, then merges in the provided overrides with `deep` + `overwrite`. Warns on locales that have no deployed dictionary.
- **`applyLocaleOverlay(overlay)`** — calls `applyLocaleOverrides` then `setServedLanguages`; the atomic "one refresh, two effects" entry point.
- **`refreshLocaleOverrides()`** — pulls from the provider, applies the overlay, and swallows errors (logs a warning, keeps the last good overlay). Never rejects.
- **`resetLocaleOverrides()`** — restores file baseline and resets served languages to defaults. Used at shutdown and in tests.
- **`startLocaleOverrideRefresh()` / `stopLocaleOverrideRefresh()`** — start/stop a `setInterval` (`.unref()`) that re-calls `refreshLocaleOverrides` every `NODE_LOCALE_OVERRIDE_REFRESH_MS`, propagating cross-worker edits.
- **`getOverrideRefreshMs()`** — reads the interval from `localeConfig()`.

## Relationships

- **`./catalog`** — calls `listSupportedLocales()` and `readLocaleDictionary(locale)` to know which locales exist and to restore the file baseline before applying overrides.
- **`./served`** — calls `setServedLanguages(activeTags, inactiveTags)` and `resetServedLanguages()` to flip the served-language list.
- **`./config`** — reads `localeConfig().NODE_LOCALE_OVERRIDE_REFRESH_MS` for the timer interval.
- **`@infrastructure/adapters/logger`** — emits `warn` on skipped locales and on provider failure.
- **`src/modules/locales/module.ts`** (composition root) — registers the concrete `LocaleOverrideProvider` at boot.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — calls `startLocaleOverrideRefresh()` on start and `stopLocaleOverrideRefresh()` / `resetLocaleOverrides()` on shutdown.
- **`src/infrastructure/i18n/index.ts`** — re-exports the public surface of this module.

## Notes

- **Per-process, not shared.** The refresh writes into `i18next`'s in-memory resource bundle, which is per worker process. A lease-based "one runner" pattern is explicitly *not* appropriate here (the doc-comment on `startLocaleOverrideRefresh` explains why). If the staleness window becomes unacceptable, the intended fix is a domain-event broadcast, not a lease.
- **Stale > broken.** A provider that rejects leaves the last successfully-applied overlay in place rather than reverting to file defaults. `resetLocaleOverrides` (the revert path) is reserved for shutdown and tests.
- **Overrides must be nested.** The `overrides` field is `Record<locale, Record<key, unknown>>`, not a flat dotted-key map. Only the `locales` module may expand dotted keys (it guards against `__proto__` and ambiguous group keys); this file trusts the shape it receives.
- **Deleting a locale's last override restores it.** `applyLocaleOverrides` always restores *every* supported locale to its file baseline first, so a locale whose overrides were removed returns to its deployed copy rather than staying on the previously-merged state.
- **Unref'd timer.** The refresh interval is `.unref()`'d so it never prevents process exit.
