---
source: tests/cross-cutting/locale-parity.test.ts
sha256: 4c4b7da960d8c2664217ee91ba067cc2d4895511d6b29510d24f5cbf2ce2548d
generated_at: 2026-09-23T19:56:24.885156+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/locale-parity.test.ts

## Purpose

Cross-cutting parity test that asserts every supported locale declares **exactly the same set of keys** across the merged dictionaries (shared file + all per-module locale files). It catches the silent failure mode where a key exists in one locale but not another, which would otherwise surface to users as the raw key string in the wrong language. It is deliberately domain-agnostic: it checks a structural property that must hold regardless of how many modules exist.

## Key elements

- **`flattenKeys(dictionary, prefix?)`** — recursively collects every leaf key of a nested dictionary, dot-joins the path, and returns a sorted `string[]`. Used to turn a shape into a comparable key-set.
- **`supported`** — the runtime list from `listSupportedLocales()`; drives both which locales are tested and how many.
- **`reference` / `others`** — the first element of `supported` (typically `en`) is the baseline; the rest are compared against it.
- **`referenceKeys`** — `flattenKeys(readLocaleDictionary(reference))`; the canonical key-set every other locale must match.
- **`describe('locale files')`** — three tests:
  1. *Canary:* `supported.length > 1`, so the `it.each` below isn't vacuous.
  2. *Parity (per locale):* each non-reference locale's flattened keys equal `referenceKeys`.
  3. *Canary:* `referenceKeys.length > 20`, proving the per-module merge actually ran (otherwise all locales would trivially agree on the shared half alone).

## Relationships

- **`src/infrastructure/i18n/index.ts`** — the import target (`@infrastructure/i18n`); provides `listSupportedLocales` and `readLocaleDictionary` that this test calls to enumerate locales and load their merged dictionaries.
- **`src/infrastructure/i18n/catalog.ts`** — implementation behind those two functions; this test exercises the *output* of the catalog's merge logic (`registerLocaleDirectories`), which is why the `> 20 keys` canary exists.

## Notes

- **TIER 1 only.** This test covers the static dictionary files shipped in this repository (loaded at boot). It must **not** be extended to assert completeness of database-backed translations served by `src/modules/locales`; dynamic completeness is tracked via `entryCount` in `GET /locales`.
- **Languages are discovered, not named.** The test iterates whatever `listSupportedLocales()` returns, so adding or removing a locale (or narrowing via `NODE_SUPPORTED_LOCALES`) requires zero test edits.
- **Per-module *content* correctness** (e.g., whether a message reads well) is asserted by each module's own `validation-messages` spec. This file only checks key-set equality.
- **Comparison is one-reference, not pairwise.** Any locale can serve as the reference because "same keys" is symmetric; picking the first avoids N² duplicate defect reports.
