# tests/unit/infrastructure/i18n/catalog.test.ts

## Purpose

Unit tests for the i18n catalog layer: locale discovery, per-dictionary loading with module merge, and the resource shape handed to `i18next.init()`. The suite guards the invariant that the supported-locale list stays in lockstep with the resources `i18next` actually registered at init time.

## Key elements

- **`describe('locale discovery')`** — single suite covering all catalog functions:
  - *lists every dictionary in `src/locales`* — asserts `listSupportedLocales()` returns at least `['en', 'it']`.
  - *honours `NODE_SUPPORTED_LOCALES`* — sets the env var, calls `resetSupportedLocales()`, verifies trimmed/parsed output, restores state in `finally`.
  - *is cached, so it cannot drift* — calls `listSupportedLocales()` once, then changes `NODE_SUPPORTED_LOCALES` and asserts the cached result is unchanged.
  - *reads a dictionary off disk, merged with every registered module* — verifies `readLocaleDictionary('it')` contains the shared `itTranslation` verbatim and layers `itUsers.users` on top.
  - *shapes every dictionary for `i18next.init`* — asserts `loadLocaleResources()` matches `{ en: { translation }, it: { translation } }`.
  - *finds the shared dictionaries whatever the working directory is* — `chdir('/')` then reads `en`, proving resolution is module-relative, not `cwd`-relative.
  - *carries the shared keys a module did not contribute to* — confirms `en.users` still matches the module fixture.
- **Imports under test** — `listSupportedLocales`, `loadLocaleResources`, `readLocaleDictionary`, `resetSupportedLocales` from `@infrastructure/i18n`.
- **Fixture JSONs** — `en.json`, `it.json` (shared) and `en.json`, `it.json` under `@modules/users/locales/` used as expected-structure references.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — barrel re-export consumed by the test; all four catalog functions arrive through this entry point.
- **`src/infrastructure/i18n/catalog.ts`** — the implementation the tests exercise (locale scanning, disk reads, module merge, `i18next` resource shaping).

## Notes

- The caching test is flagged in-file as the most critical: if `listSupportedLocales()` re-scanned the directory on every call, language negotiation could offer a locale `i18next` never registered, silently falling back to default copy.
- `resetSupportedLocales()` must be called after mutating `NODE_SUPPORTED_LOCALES`; the tests restore both the env var and the internal cache in `finally` blocks.
- The cwd-independence test (`chdir('/')`) documents an intentional design choice: dictionary paths are resolved relative to the module file, so Jest workers, migrations, and `src/cluster.ts` all see the same directory regardless of launch directory.
