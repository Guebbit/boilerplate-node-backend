# src/infrastructure/i18n/overrides.ts

## Purpose

Database-overlay tier for i18n: admin-edited translations stored outside the deployed dictionary files, layered on top of them at runtime. Designed to be a single, removable file — deleting it and its two boot-sequence lines strips the feature entirely.

## Key elements

- **`LocaleOverrideProvider`** (type) — `() => Promise<Record<string, Record<string, unknown>>>`; the async supplier of nested overrides keyed by locale.
- **`registerLocaleOverrideProvider`** — sets (or clears, if called with no argument) the module-level provider. Unregistered is the valid default; tests that never boot the app get file-only translations.
- **`resetLocaleOverrides`** — rewrites every supported locale back to its `./catalog` file baseline via `i18next.addResourceBundle` (deep + overwrite).
- **`applyLocaleOverrides`** — calls `resetLocaleOverrides` first, then merges the supplied per-locale override trees on top. Skips and logs any locale that has no deployed dictionary.
- **`refreshLocaleOverrides`** — fetches from the registered provider and applies the result. Catches all errors and logs a warning; **never rejects**.
- **`getOverrideRefreshMs`** — reads `NODE_LOCALE_OVERRIDE_REFRESH_MS` (default 60 000, min 1) via `environmentNumber`.
- **`startLocaleOverrideRefresh`** / **`stopLocaleOverrideRefresh`** — idempotent start/stop of an `unref`'d `setInterval` that calls `refreshLocaleOverrides`, letting edits on one worker propagate to others.

## Relationships

- **`./catalog`** — imports `listSupportedLocales` and `readLocaleDictionary` to know the supported set and to restore the file baseline.
- **`@infrastructure/adapters/logger`** — emits `warn` for skipped locales and for provider failures.
- **`@infrastructure/runtime/environment`** — `environmentNumber` for the refresh-interval env var.
- **`src/infrastructure/i18n/index.ts`** — barrel that re-exports this file's public API to the rest of `infrastructure`.
- **`src/app.ts` / `server-lifecycle.ts`** — composition root: registers the provider, calls `startLocaleOverrideRefresh` at boot and `stopLocaleOverrideRefresh` + `resetLocaleOverrides` at shutdown.
- **`src/modules/locales/*`** (module, controllers) — the only module that *knows* how to expand dotted DB keys into nested objects and that supplies the provider; also triggers `refreshLocaleOverrides` after admin writes (create/update/delete of entries or a locale).
- **`tests/unit/infrastructure/i18n/overrides.test.ts`** — unit tests exercising apply/reset/refresh without a live database.

## Notes

- `applyLocaleOverrides` resets **all** supported locales on every call, not just the ones present in the argument. This prevents "deleting the last override of a language leaves it in a broken state."
- The override trees are **nested** (not flat dotted keys) because only the `locales` module safely expands dotted keys (rejecting `__proto__`, handling key-that-is-both-string-and-group conflicts). `infrastructure` deliberately does not reimplement that logic.
- A failing provider leaves the **last good overlay** in place; the function only resolves (never rejects). Stale copy is preferred over a reversion to defaults on a transient DB hiccup.
- The interval timer is `unref`'d so a worker with no other work will still exit cleanly.
- Only a locale that has a file in `./catalog` can be overridden; overrides for unsupported locales are dropped with a warning.
