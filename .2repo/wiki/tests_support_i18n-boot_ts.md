# tests/support/i18n-boot.ts

## Purpose

Test infrastructure that reproduces the production import ordering—module code loads *before* `i18next.init()`—which Jest's `setupFiles` normally masks. It exists so specs can assert real translated copy and catch the class of bug where an eagerly-called `t()` bakes `undefined` into Zod validators because i18next was not yet initialised.

## Key elements

- **`mergedResources()`** — Returns the i18next resources object (`{ en, it }`) by calling `readLocaleDictionary` for each locale, giving access to all shared and per-module keys.
- **`loadBeforeI18n<T>(locale, load, probeKey)`** — The primary helper. Inside `jest.isolateModulesAsync` it:
  1. Calls `load()` (the module under test) *before* initialising i18next.
  2. Asserts `i18next.isInitialized` is falsy and `i18next.t(probeKey)` is `undefined`, proving the ordering is real.
  3. Calls `i18next.init` with the requested locale and `mergedResources()`.
  4. Returns the loaded module of type `T`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Re-exported as `@infrastructure/i18n`; this file imports `readLocaleDictionary` from it.
- **`src/infrastructure/i18n/catalog.ts`** — Underlying implementation of the dictionary lookup that `readLocaleDictionary` delegates to.
- **`src/modules/products/tests/unit/validation-messages.test.ts`** — Consumer; passes a loader that imports the products validation module into `loadBeforeI18n`.
- **`src/modules/users/tests/unit/validation-messages.test.ts`** — Consumer; same pattern for the users module.

## Notes

- Lives in `tests/support` (not in any domain folder) because it is generic boot-ordering machinery; the module under test is always passed in via the `load` callback.
- `probeKey` is not decorative—it is a runtime precondition that fails the test if the isolated i18next instance somehow resolved the key, which would mean the ordering trick did not work.
- The helper depends on `jest.isolateModulesAsync` to get a fresh i18next singleton, bypassing the global initialisation performed by `tests/support/setup.ts` (Jest `setupFiles`).
- The `load` callback must return a `Promise` (i.e., use `await import(...)`), matching the ES-module async import behaviour of production `app.ts`.
