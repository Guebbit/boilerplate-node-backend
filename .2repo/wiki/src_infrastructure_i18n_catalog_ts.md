# src/infrastructure/i18n/catalog.ts

## Purpose

Boot-time translation catalog: discovers which locales exist, deep-merges the shared dictionary with each module's contribution, and hands the assembled `i18next` `Resource` object to `i18next.init()`. It is the single place that answers "where do translation files live?" so no consumer of the request-scoped `t` function ever touches the filesystem.

## Key elements

- **`LOCALES_DIRECTORY`** – Resolved via `__dirname`, pointing to `src/locales`. Independent of `process.cwd()`, so Jest workers and the cluster entry point see the same path.
- **`getDefaultLocale()` / `getFallbackLocale()`** – Lazily read `NODE_DEFAULT_LOCALE` / `NODE_FALLBACK_LOCALE` (default `'en'`). Read at call time so tests can mutate the env after import.
- **`listSupportedLocales()`** – Returns the supported locale codes. Source is `NODE_SUPPORTED_LOCALES` (comma-separated) if set, otherwise the `.json` file listing in `LOCALES_DIRECTORY`. **Read once, then cached**; `resetSupportedLocales()` clears the cache for tests.
- **`registerLocaleDirectories(directories)`** – Inversion-of-control hook: `app.ts` passes each enabled module's `locales/` path here *before* `i18next.init()`. Unregistered is a valid state (unit tests get shared keys only).
- **`readLocaleDictionary(locale)`** – Loads the shared `<locale>.json`, then deep-merges each registered module's file on top in registration order. Exported so `GET /locales/:locale` returns the same merged view.
- **`loadLocaleResources()`** – Maps `listSupportedLocales()` × `readLocaleDictionary()` into the `{ locale: { translation: … } }` shape `i18next.init()` expects.
- **`deepMerge` / `isPlainObject`** (private) – Recursive merge that recurses only into plain objects; arrays and scalars are replaced wholesale. Prevents two modules writing to the same top-level namespace from clobbering each other.

## Relationships

- **`src/app.ts`** – Calls `registerLocaleDirectories(…)` with enabled modules' locale paths, then passes `loadLocaleResources()` to `i18next.init()`. This is the only production caller of both.
- **`src/infrastructure/i18n/negotiate.ts`** – Calls `listSupportedLocales()` to validate `Accept-Language` / `Content-Language` headers against the same cached list, ensuring it never offers a locale `i18next` cannot resolve.
- **`src/infrastructure/i18n/overrides.ts`** – Layers a database-sourced overlay *on top of* what this file produces. One-directional; overrides never flow back into the file-based catalog.
- **`src/infrastructure/i18n/context.ts`** – The request-scoped `t` function that 36+ module files import. It reads resources that `i18next` registered from this catalog at boot.
- **`src/infrastructure/i18n/index.ts`** – Barrel that re-exports the public API (locale helpers, `registerLocaleDirectories`, `readLocaleDictionary`).
- **`src/modules/locales/controllers/get-locales.ts`** – Calls `readLocaleDictionary` to expose a locale's merged dictionary to clients.
- **Module controllers/services** (account, cart, delivery, feedback) – Indirectly depend on this file: their `t(…)` calls resolve against resources loaded via `loadLocaleResources()` at boot. They never import this module directly.
- **`src/modules/account/tests/integration/persisted-locale.test.ts`** – Uses `resetSupportedLocales()` to re-read env between test cases.

## Notes

- **Cache is load-bearing.** `listSupportedLocales()` memoises on first call. A per-request re-read would let middleware negotiate a locale that `i18next` has no resources for, producing a `Content-Language` response the client cannot consume. Only `resetSupportedLocales()` (test-only) invalidates it.
- **Registration order = collision priority.** If two modules *did* write the same key, the later-registered directory wins. `tests/cross-cutting/locale-namespaces.test.ts` is the guard that fails if a collision is introduced.
- **`registerLocaleDirectories` replaces, not appends.** Calling it twice sets the full list; `app.ts` passes the complete set in one call.
- **Shared keys are loaded with `readFileSync` (synchronous, at boot).** This is intentional: it happens once during `i18next.init()`, not per request.
