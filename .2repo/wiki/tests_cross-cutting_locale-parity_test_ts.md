# tests/cross-cutting/locale-parity.test.ts

## Purpose

Asserts that every supported locale declares exactly the same set of leaf keys across the **merged** (shared + all module) dictionaries. A missing translation is otherwise invisible at build time — each JSON file is valid in isolation, and the runtime defect is simply the raw key string printed to a user in the wrong language. This file is the single, domain-agnostic guard that catches that gap.

## Key elements

- **`flattenKeys(dictionary, prefix?)`** — recursively collects all leaf keys of a nested object as sorted, dot-joined strings (e.g. `messages.error.notFound`). Used to produce a comparable key set.
- **`supported`** — the runtime list of locales from `listSupportedLocales()`. Not hardcoded, so adding or removing a language needs no test edit.
- **`reference` / `others`** — first locale is the reference; all others are compared against it (symmetric check, avoids O(n²) pair reporting).
- **Three assertions in `describe('locale files')`:**
  - *Canary:* `supported.length > 1` — prevents a vacuous pass with a single locale.
  - *Parity (parameterised):* each non-reference locale's key set equals the reference's.
  - *Merge canary:* `referenceKeys.length > 20` — proves `registerLocaleDirectories` actually ran and module dictionaries were merged in.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — barrel import source for `listSupportedLocales` and `readLocaleDictionary`; the test depends on this module's public API.
- **`src/infrastructure/i18n/catalog.ts`** — implements `readLocaleDictionary` (and likely `listSupportedLocales`), which loads the shared and per-module JSON files and returns the merged dictionary that this test inspects.

## Notes

- **Tier 1 only.** The test covers the static, build-time dictionary files shipped with the repository. It must **not** be extended to cover database rows served by `src/modules/locales`; dynamic completeness is reported by `entryCount` in `GET /locales`. Conflating the two would make a half-translated DB entry fail a test suite that doesn't own the translation.
- **No domain naming.** This file deliberately references no specific module. Per-module copy correctness is the responsibility of each module's own `validation-messages` spec.
- **Locale list is dynamic.** Languages are discovered via `listSupportedLocales()` (which can be narrowed by `NODE_SUPPORTED_LOCALES`), not hard-coded. This was a deliberate fix: the previous `en`-vs-`it` hardcoding let a third language go unchecked.
