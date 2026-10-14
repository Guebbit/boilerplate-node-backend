---
source: src/infrastructure/i18n/overrides.ts
sha256: ed4883c9d89c214119593657f97e0e8202555399ce30902977fdfdba4470dda0
generated_at: 2026-10-14T08:03:26.877716+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/overrides.ts

## Purpose

Database overlay for i18n copy: admin-edited translations are layered on top of the deployed dictionary files in `./catalog`. The module is deliberately isolated (one-way dependency — nothing imports it back), so deleting this file plus its two boot-sequence lines removes the entire feature.

## Key elements

- **`LocaleOverrideProvider`** (type) — a `() => Promise<Record<string, Record<string, unknown>>>` callback that supplies current overrides keyed by locale, already nested.
- **`registerLocaleOverrideProvider(provider?)`** — sets (or clears) the registered provider. Passing `undefined` is the valid default; unit tests that resolve a key without booting the app simply get the deployed files.
- **`isLocaleOverrideAvailable()`** — returns whether a provider is registered; the caller uses this to decide whether to start a refresh timer.
- **`resetLocaleOverrides()`** — restores every supported locale to its deployed dictionary, dropping any applied override. Used by shutdown and tests; **not** the path a failed refresh takes (stale copy is preferred over reverting on a Mongo hiccup).
- **`applyLocaleOverrides(overridesByLocale)`** — synchronously restores all supported locales, then deep-merges each locale's overrides via `i18next.addResourceBundle` with `deep: true, overwrite: true`. Locales without a deployed file are skipped and logged as a warning.
- **`refreshLocaleOverrides()`** — calls the provider, applies the result, and **never rejects**; a provider failure logs a warning and leaves the last good overlay in place.
- **`getOverrideRefreshMs()`** — reads `NODE_LOCALE_OVERRIDE_REFRESH_MS` from `localeConfig()`.
- **`startLocaleOverrideRefresh()`** — starts a `setInterval` (unref'd) that calls `refreshLocaleOverrides` on the configured interval. Guards against double-start.
- **`stopLocaleOverrideRefresh()`** — clears the interval; called by the shutdown path and tests.

## Relationships

- **`./catalog`** — imports `listSupportedLocales` and `readLocaleDictionary` to know which locales exist and to restore the file baseline.
- **`@infrastructure/i18n/config`** — imports `localeConfig` for the refresh-interval setting.
- **`@infrastructure/adapters/logger`** — imports `logger` for warn-level diagnostics on skipped locales and provider failures.
- **`src/infrastructure/i18n/index.ts`** — barrel that re-exports this module for consumers.
- **`src/modules/locales/services/overlay.ts`** — the concrete provider that reads overrides from the database; supplied via `registerLocaleOverrideProvider` at the composition root.
- **`src/modules/locales/module.ts`** — registers the provider and wires the locales domain to this infrastructure module.
- **`src/app.ts`** — boot-sequence caller: registers the provider and starts the refresh timer.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — shutdown path that calls `stopLocaleOverrideRefresh` (and likely `resetLocaleOverrides`).
- **`tests/unit/infrastructure/i18n/overrides.test.ts`** — unit tests exercising each exported function.
- **`scenarios/support/demo.ts`** — demo/scenario support that may register a stub provider or rely on the unregistered default.

## Notes

- **Overrides must be nested objects, not dotted strings.** Only the `locales` module is allowed to expand a dotted key (it rejects `__proto__` and ambiguous strings); `infrastructure` must not redo that expansion.
- **`applyLocaleOverrides` restores *all* supported locales first**, not just those present in the override map. Deleting a language's last override must restore its file baseline, not leave it stale.
- **The refresh timer is `unref`'d** so it never prevents process exit.
- **Not behind a lease.** A lease elects one runner to do shared work; here every worker holds its own in-memory `i18next` bundle and must refresh independently. Leasing would starve N−1 workers of fresh copy. The documented future fix is a domain-event broadcast over the existing bus.
- **`refreshLocaleOverrides` is intentionally lossy on failure** — it logs and keeps the last good overlay. No caller (boot, timer, post-write) has a user to report an error to.
- Stryker mutation-testing disable/restore comments wrap the `logger.warn` calls to exclude log strings from mutation coverage.
