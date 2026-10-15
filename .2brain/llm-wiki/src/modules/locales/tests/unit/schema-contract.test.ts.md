---
source: src/modules/locales/tests/unit/schema-contract.test.ts
sha256: 75d22d669f7d29e0e26c4ad0b6857e07a298f4d726338042ce423fc9924d4f5d
generated_at: 2026-10-15T10:49:00.558636+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin the schema contracts for the two locale collections (`localeSchema`, `localeEntrySchema`) and the `deriveBaseLanguage` helper. They assert required paths, unique indexes, field-level normalisation options, defaults, and enum restrictions so that a regression in any of those invariants (e.g. a lost `lowercase: true` or a changed compound index) fails in CI rather than in production.

## Key elements

- **`normalises` (local helper)** — reads `options` (`lowercase`, `trim`) off a specific path in a Mongoose schema; used throughout the file to assert per-field normalisation.
- **`describe('localeSchema')`** — five tests:
  - Required paths are `['baseLanguage', 'name', 'nativeName', 'tag']`.
  - Unique index `locales_tag` on `tag`.
  - `tag` and `baseLanguage` carry `lowercase: true, trim: true`.
  - Defaults: `direction → ltr`, `active → true`, `revision → 0`.
  - `direction` enum equals `Object.values(LocaleDirection)`.
- **`describe('deriveBaseLanguage')`** — three tests: extracts primary subtag (`en-GB → en`), passes bare tags through (`it → it`), normalises case/whitespace before splitting.
- **`describe('localeEntrySchema')`** — five tests:
  - Required paths are `['app', 'key', 'locale']` (`value` is intentionally not required).
  - Unique compound index `localeEntries_locale_app_key` on `(locale, app, key)`.
  - `locale` and `app` are lowercased; `key` is trimmed but **not** lowercased.
  - `value` defaults to `''` (empty string).
  - Both schemas have `timestamps: true`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/locales/model.ts` | Source of the three units under test: `localeSchema`, `localeEntrySchema`, `deriveBaseLanguage`. |
| `src/types/index.ts` | Provides the `LocaleDirection` enum used to assert the allowed values of the `direction` field. |
| `tests/support/schema.ts` | Supplies all assertion helpers: `defaultOf`, `enumOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `requiredPaths`. The test file contains no raw Mongoose introspection logic. |

## Notes

- The file is intentionally "documentation as test": inline comments explain *why* each invariant exists (negotiator matching, upsert semantics, key case-sensitivity). Reading the comments is part of the contract.
- `key` in `localeEntrySchema` is explicitly **not** lowercased — `Cart.Empty` and `cart.empty` are distinct translations. This is the one asymmetry between the three compound-index fields.
- `value` defaulting to `''` (rather than being optional) is deliberate: it lets the editor distinguish "declared but blank" from "not declared at all."
- `normalises` is a file-local constant, not exported. It reads a Mongoose `path()` call whose type is cast to expose `options`; if the Mongoose version changes how options are stored, this helper is the single point to fix.
