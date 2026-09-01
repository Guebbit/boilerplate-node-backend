# src/infrastructure/i18n/overrides.ts

## Purpose

Database overlay for i18n: admin-edited copy layered on top of the static deployed dictionaries in `./catalog`. It exists so the `locales` module can persist per-locale key overrides in a database and have them picked up by i18next at runtime, without those edits ever being baked into the deployed files. The module is deliberately one-directional — nothing in `infrastructure` imports it back — so deleting this file and its two boot-sequence call sites removes the entire feature.

## Key elements

- **`LocaleOverrideProvider`** (type) — A zero-arg function returning `Promise<Record<string, Record<string, unknown>>>` (locale → nested key tree). The composition root supplies the concrete implementation; `infrastructure` never expands dotted keys itself.
- **`registerLocaleOverrideProvider`** — Stores (or clears) the provider. Unregistered is the default state, meaning i18next serves only the deployed files.
- **`resetLocaleOverrides`** — Restores every supported locale to its deployed dictionary via `i18next.addResourceBundle(locale, 'translation', readLocaleDictionary(locale), true, true)`. Used at shutdown and in tests.
- **`applyLocaleOverrides`** — Synchronously resets all locales first, then deep-merges the supplied nested override trees on top (`deep` + `overwrite` both true). Warns and skips locales that have no deployed dictionary.
- **`refreshLocaleOverrides`** — Pulls overrides from the registered provider and calls `applyLocaleOverrides`. Never rejects; on provider failure it logs a warning and keeps the last good overlay.
- **`getOverrideRefreshMs`** — Reads `NODE_LOCALE_OVERRIDE_REFRESH_MS` (default 60 000 ms, min 1) via `environmentNumber`.
- **`startLocaleOverrideRefresh`** — Starts a `setInterval` that calls `refreshLocaleOverrides`. The timer is `unref`'d so it never keeps the Node process alive.
- **`stopLocaleOverrideRefresh`** — Clears the interval. Called by the shutdown path and tests.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — Provides `listSupportedLocales` and `readLocaleDictionary`, the two functions this file calls to know which locales exist and to read their baseline dictionaries.
- **`src/infrastructure/adapters/logger.ts`** — Emits the `warn`-level messages when overrides are skipped or the provider fails.
- **`src/infrastructure/runtime/environment.ts`** — Supplies `environmentNumber`, used to read the refresh-interval config.
- **`src/infrastructure/i18n/index.ts`** — Barrel that re-exports this module's public API for consumers outside `infrastructure`.
- **`src/modules/locales/module.ts`** — The composition root that calls `registerLocaleOverrideProvider` with the database-backed implementation.
- **`src/modules/locales/controllers/write-locale-entries.ts` / `delete-locale-entry.ts` / `delete-locale.ts`** — Admin mutation controllers that call `refreshLocaleOverrides` after persisting changes so the running worker picks up the new copy immediately.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Calls `startLocaleOverrideRefresh` at boot and `stopLocaleOverrideRefresh` (plus `resetLocaleOverrides`) during shutdown.
- **`src/app.ts`** — Top-level wiring that invokes the lifecycle hooks above.
- **`tests/unit/infrastructure/i18n/overrides.test.ts`** — Unit tests exercising register / apply / refresh / reset / timer start-stop in isolation.

## Notes

- **Failure semantics:** `refreshLocaleOverrides` swallows provider errors by design. A transient database outage costs the pending overrides but leaves the last good overlay in place — stale copy is preferred over a self-reverting one.
- **Reset-before-apply is intentional:** `applyLocaleOverrides` calls `resetLocaleOverrides` for *every* supported locale, not just the ones present in the payload, so removing a language's last override correctly restores it to the file baseline. The reset is synchronous to avoid an observable window where a locale is momentarily on its bare dictionary.
- **Nested, not flat:** Override trees are pre-nested. Only the `locales` module is allowed to expand dotted keys (it rejects `__proto__` and ambiguous strings); `infrastructure` must not re-implement that logic.
- **Isolation guarantee:** The module holds no reverse dependencies. Deleting this file plus its two boot-sequence lines (register + start/stop) removes the feature with no other code changes.
