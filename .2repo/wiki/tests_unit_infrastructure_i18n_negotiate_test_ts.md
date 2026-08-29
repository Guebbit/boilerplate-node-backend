# tests/unit/infrastructure/i18n/negotiate.test.ts

## Purpose

Unit tests for `negotiateLocale`, the pure function that resolves a client-supplied `Accept-Language` header (or the absence of one) into a concrete supported locale. Because malformed and edge-case headers are tedious to reproduce over real HTTP, the function is exercised here directly rather than only through integration tests.

## Key elements

- **`SUPPORTED`** – Local constant `['en', 'it']` used as the supported-locale list across most test cases, keeping tests independent of the real catalogue.
- **`describe('negotiateLocale')`** – A single test block containing:
  - **Basic resolution** (`it.each`) – exact match, case-insensitivity, and region-stripping (e.g. `it-CH` → `it`).
  - **q-weight ordering** – highest weight wins; ties break by header order.
  - **Unsupported / refused entries** – languages not in the list are skipped; `q=0` entries are ignored.
  - **Fallback scenarios** (`it.each`) – `undefined`, empty string, wildcard `*`, all-unsupported, and punctuation-soup headers all fall back to the first supported locale.
  - **Unparseable q-weight** – `it;q=banana` is still honoured (not discarded).
  - **Fallback-not-supported** – if the fallback locale itself isn't in the supported list, the first entry of the list wins.
  - **Default argument** – calling `negotiateLocale('it')` with no list negotiates against the i18next-registered catalogue, confirming the function's default parameter.

## Relationships

- **`src/infrastructure/i18n/negotiate.ts`** – Provides the `negotiateLocale` function under test. All assertions target its return value.
- **`src/infrastructure/i18n/index.ts`** – The barrel re-export through which the test imports `negotiateLocale` (`from '@infrastructure/i18n'`).

## Notes

- The test imports via the barrel (`@infrastructure/i18n`) rather than the module path, so it also implicitly exercises the re-export wiring in `index.ts`.
- The "default argument" test is the only case that does **not** pass an explicit supported list; it relies on the real i18next catalogue being initialised, making it slightly more coupled to runtime setup than the other cases.
- The file's header comment explicitly documents *why* this unit test exists (malformed-header edge cases), which is a convention worth preserving if tests are refactored.
