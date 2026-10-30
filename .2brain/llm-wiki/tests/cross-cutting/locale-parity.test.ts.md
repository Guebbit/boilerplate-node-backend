---
source: tests/cross-cutting/locale-parity.test.ts
sha256: 3c92e161b6b208bbfb76820d57c2ed3351bf11f3ba9fc594ab167e4d60aa0b71
generated_at: 2026-10-29T06:46:51.449623+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/locale-parity.test.ts

## Purpose

Cross-cutting test that asserts every supported locale declares an identical set of keys across the **merged** dictionary (shared file + all per-module locale files). It exists because a missing key in one language is otherwise invisible: each JSON file is valid on its own, and the gap only surfaces as a raw key printed to a user in production. The test is deliberately domain-agnostic — it holds no matter how many modules exist.

## Key elements

- **`flattenKeys(dictionary, prefix)`** — recursively walks a nested object and returns a sorted array of dot-joined leaf-key strings (e.g. `"common.confirm"`).
- **`supported`** — the locale list obtained at test-load time via `listSupportedLocales()`. No language is hard-coded.
- **`reference` / `referenceKeys`** — the first entry of `supported` (defaults to `'en'`) and its flattened key set; every other locale is compared against it.
- **Three test cases** inside `describe('locale files')`:
  1. *Canary*: asserts `supported.length > 1` so the `it.each` below is not vacuous.
  2. *Parity* (`it.each(others)`): each non-reference locale's key set must `toEqual` the reference key set.
  3. *Canary*: asserts the reference has more than 20 keys, guarding against the case where `registerLocaleDirectories` was never called and every locale "matches" on the shared half alone.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — the `@infrastructure/i18n` barrel that this file imports from. Exports `listSupportedLocales` and `readLocaleDictionary`.
- **`src/infrastructure/i18n/catalog.ts`** — the module behind the barrel that implements `listSupportedLocales` (returns the set of locales the deployment actually ships) and `readLocaleDictionary` (returns the merged dictionary for a given locale, i.e. shared keys + all registered module keys).

## Notes

- **Tier 1 scope only.** The test checks the *static, deployed* dictionary files loaded at boot. It must not be extended to cover the dynamic database rows served by `src/modules/locales` (`entryCount` in `GET /locales`); those are owned by a different team/repo.
- **No languages are named.** Adding or removing a language in config or on disk automatically adjusts what is asserted, with no test to edit.
- **Per-module copy fidelity is out of scope.** Each module's own `validation-messages` spec verifies that its translations are semantically correct; this file only checks that the *key sets* line up.
- **The `>20` threshold** in the merge canary is a heuristic, not a contract — it simply needs to be above the shared-file key count so that a failed module-registration is caught.
