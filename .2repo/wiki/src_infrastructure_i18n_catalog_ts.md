# src/infrastructure/i18n/catalog.ts

## Purpose

Discovers, merges, and loads the JSON translation dictionaries that `i18next.init()` consumes at boot. It is the single file to edit if a project relocates where its shared or per-module locale files live. The database overlay in `./overrides` layers on top of what this produces; the flow is one-directional.

## Key elements

- **`LOCALES_DIRECTORY`** (internal) — resolved from `__dirname` so the path is identical regardless of entry point (`src/cluster.ts`, Jest worker, migration).
- **`getDefaultLocale()` / `getFallbackLocale()`** — read `NODE_DEFAULT_LOCALE` / `NODE_FALLBACK_LOCALE` lazily (default `'en'`), so tests can set env after import.
- **`listSupportedLocales()`** — returns the list of locales the API can serve. Sourced from `NODE_SUPPORTED_LOCALES` env (comma-separated) or the directory listing of `*.json` files. **Memoised** after first call; safe because `i18next.init()` reads it once at boot.
- **`resetSupportedLocales()`** — clears the memoised list. Intended for tests that mutate `NODE_SUPPORTED_LOCALES`.
- **`registerLocaleDirectories(directories)`** — sets the ordered list of module-locale directories to merge. Must be called **before** `i18next.init()`. Called by `app.ts` with each enabled module's `locales` path.
- **`readLocaleDictionary(locale)`** — deep-merges the shared dictionary with every registered module's `<locale>.json` (registration order = collision priority). Exported so `GET /locales/:locale` returns the merged view.
- **`loadLocaleResources()`** — builds the `i18next` `Resource` object (`{ locale: { translation: … } }`) for all supported locales.
- **`deepMerge` / `isPlainObject`** (internal) — recursive merge that only descends into plain-object pairs; arrays and scalars are replaced by the source.

## Relationships

- **`src/app.ts`** — calls `registerLocaleDirectories()` with the enabled modules' locale paths before invoking `i18next.init()`.
- **`src/infrastructure/i18n/context.ts`** — owns the `i18next` instance; receives the `Resource` from `loadLocaleResources()` at initialisation.
- **`src/infrastructure/i18n/overrides.ts`** — applies a database overlay on top of the merged dictionaries this file produces (one-directional, never back).
- **`src/infrastructure/i18n/negotiate.ts`** — consumes `listSupportedLocales()` to validate a requested locale against what the server can actually serve.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export of this module's public API.
- **`src/modules/locales/controllers/get-locales.ts`** — calls `readLocaleDictionary()` to return the merged dictionary for `GET /locales/:locale`.
- **`src/modules/locales/services/capabilities.ts`** — reads `listSupportedLocales()` to report which languages the API supports.
- **Module services** (`account/authentication`, `account/profile`, `account/verification`, `cart/checkout`, `delivery/service`, `feedback/service`) — each owns a `locales/<locale>.json` file that gets registered via `registerLocaleDirectories()`; they do not import this file directly.
- **`src/modules/account/tests/integration/persisted-locale.test.ts`** — exercises the locale-persistence path; may call `resetSupportedLocales()` between scenarios.
- **`src/modules/locales/tests/contract/api.contract.test.ts`** — contract test asserting the `GET /locales` response shape against what this module produces.

## Notes

- **Cache is intentionally sticky.** `listSupportedLocales()` memoises on first call because `i18next` captures the list at `init()` time. A locale added to the directory after boot is *not* resolvable until the process restarts; `resetSupportedLocales()` exists solely for test isolation.
- **Collision policy.** A module dictionary *can* shadow a shared key (last writer wins in registration order), but `tests/cross-cutting/locale-namespaces.test.ts` enforces that no module actually collides.
- **Deep merge, not shallow.** Two modules may contribute keys under the same top-level namespace (e.g. `account` and `users`); a shallow assign would let the later load erase the earlier.
- **`LOCALES_DIRECTORY` is `__dirname`-relative**, not `process.cwd()`-relative, so it resolves correctly under `src/cluster.ts`, Jest workers, and migrations alike.
- **Docs:** see `docs/tools/i18n.md` for the broader i18n architecture.
