---
source: tests/cross-cutting/locale-parity.test.ts
sha256: 3c92e161b6b208bbfb76820d57c2ed3351bf11f3ba9fc594ab167e4d60aa0b71
generated_at: 2026-11-08T09:27:42.821412+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/locale-parity.test.ts

## Purpose

Cross-cutting test asserting that every supported locale declares the **exact same set of keys** across the merged dictionaries (shared file + all registered module directories). It exists because a missing key in one locale is invisible at build time and surfaces only as a raw key string printed to a user in the wrong language — no per-module test catches that.

## Key elements

- **`flattenKeys(dictionary, prefix?)`** — Recursively extracts all leaf keys from a nested object, dot-joins them, and returns a sorted array. Used to produce a comparable key signature for any locale.
- **`supported`** — The locale list obtained at import time from `listSupportedLocales()`. Drives all subsequent assertions so the test set tracks the actual deployment configuration.
- **`reference` / `others`** — Splits `supported` into one reference locale (first element, defaulting to `'en'`) and the rest. Comparison is one-vs-rest rather than pairwise to avoid N² defect reports.
- **`referenceKeys`** — The flattened, sorted key set of the reference locale, computed once and compared against every other locale.
- **Canary test (`more than one language`)** — Fails if only one locale is configured, preventing `it.each` from running zero cases and the file passing vacuously.
- **Parity test (`it.each(others)`)** — For each non-reference locale, asserts its flattened key set is strictly equal to `referenceKeys`.
- **Canary test (`more than the shared dictionary`)** — Asserts `referenceKeys.length > 20`, ensuring `registerLocaleDirectories` was actually called and module directories merged in; without it all locales would "agree" on the shared half alone.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — Source of `listSupportedLocales` and `readLocaleDictionary`, the two functions the test relies on to enumerate locales and load merged dictionaries.
- **`src/infrastructure/i18n/index.ts`** — Barrel re-export; the test imports both functions through the `@infrastructure/i18n` package specifier, which resolves to this index.

## Notes

- **TIER 1 only.** This test covers the static, deployed JSON files loaded at boot. It must not be extended to cover database-served translations (managed by `src/modules/locales`); doing so would couple the suite's pass/fail to external data.
- **Domain-agnostic by design.** No specific module is named. Per-module copy quality is each module's `validation-messages` spec's responsibility; this file checks only the structural invariant that all locales share the same key set.
- **Locales are read, not named.** Adding or removing a language in `shared/locales/` (or via `NODE_SUPPORTED_LOCALES`) automatically includes or excludes it here without editing the test.
- **Symmetric comparison, asymmetric reporting.** Any locale could serve as reference; the first in the list is used. This keeps defect reports to one per locale rather than one per pair.
