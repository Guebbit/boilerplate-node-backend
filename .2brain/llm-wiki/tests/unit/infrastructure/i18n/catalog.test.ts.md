---
source: tests/unit/infrastructure/i18n/catalog.test.ts
sha256: cce242b8c172331a05908f6a2c9176423f192d86e7127e5f6a7f3325eca8a756
generated_at: 2026-09-23T20:24:08.743831+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/catalog.test.ts

## Purpose

Unit tests for the locale-discovery and dictionary-loading layer of the i18n catalog. Verifies that supported-locale listing is cached (so it cannot drift from the resources `i18next.init()` registered), that per-locale dictionaries correctly merge the shared file with every registered module's contribution, and that `localeCandidatesFor` builds the expected exact → base → fallback chain without duplicates.

## Key elements

- **`describe('locale discovery')`** — covers `listSupportedLocales`, `resetSupportedLocales`, `readLocaleDictionary`, and `loadLocaleResources`.
  - *Lists every dictionary in src/locales*: asserts the default set contains `en` and `it`.
  - *Honours NODE_SUPPORTED_LOCALES*: sets the env var, calls `resetSupportedLocales`, verifies trimming/whitespace handling, then restores.
  - *Is cached*: calls `listSupportedLocales()` once, changes the env var, and asserts the second call returns the identical list — the critical non-drift guarantee.
  - *Reads a dictionary off disk, merged with every registered module*: checks the shared half is verbatim **and** the `users` module namespace is present (guards against a silent merge drop).
  - *Shapes every dictionary for i18next.init*: asserts `loadLocaleResources()` returns `{ en: { translation }, it: { translation } }`.
  - *Finds the shared dictionaries whatever the working directory is*: `chdir('/')` then reads — confirms module-relative path resolution.
  - *Carries the shared keys a module did not contribute to*: ensures the `users` namespace still appears for `en`.
- **`describe('localeCandidatesFor')`** — covers the candidate-chain builder.
  - Region-tagged input → `[exact, base, fallback]`.
  - Base-tag input → no duplicate of the base in the chain.
  - Fallback requested directly → single-element array.
  - Region-tagged fallback → base derived, no repeat.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — the SUT. All functions under test (`listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor`, `readLocaleDictionary`, `resetSupportedLocales`) are implemented here.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export. The test imports from the `@infrastructure/i18n` path, which resolves through this file to the catalog module. No behavior is exercised at the barrel level beyond confirming the named exports are reachable.

## Notes

- **Caching is the central concern.** The file's header comment and the dedicated "is cached" test make explicit that the locale list must remain consistent with what `i18next.init()` registered. If you add or remove locales at runtime, `resetSupportedLocales()` must be called (as the env-var test demonstrates).
- **Env-var mutation is manual.** There is no Jest `spyOn(process.env, …)` helper; each test saves, sets, and restores `NODE_SUPPORTED_LOCALES` / `NODE_FALLBACK_LOCALE` inside `try/finally`. When adding tests, follow the same pattern or the suite will leak state.
- **Module-relative path resolution is tested explicitly** (`chdir('/')` case). If the catalog switches to `path.resolve(process.cwd(), …)` the test will catch it, but only because this guard exists.
- **JSON fixtures are imported statically** (`en.json`, `it.json`, plus `@modules/users/locales/*.json`). They act as ground-truth snapshots; the tests compare against them with `toMatchObject` (partial match), so extra keys in the dictionary won't cause failure.
