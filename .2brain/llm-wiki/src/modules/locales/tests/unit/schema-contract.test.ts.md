---
source: src/modules/locales/tests/unit/schema-contract.test.ts
sha256: 337572ead7290f8c7af8ccf1d153daadccdcd8d89265020402742518e4d159af
generated_at: 2026-09-23T18:54:26.968455+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that lock down the schema contracts for the locales collections — required paths, unique indexes, field normalisation, defaults, and the `deriveBaseLanguage` helper. They exist to make database-level invariants (e.g. "one row per tag", "one value per locale+tenant+key") explicit, regression-guarded facts rather than implicit assumptions.

## Key elements

- **`normalises` (local helper)** — reads a schema field's `options` (`lowercase`, `trim`) so tests can assert normalisation without importing internal option builders.
- **`describe('localeSchema')`** — asserts required paths, the `locales_tag` unique index, case/trim normalisation on `tag` and `baseLanguage`, defaults (`direction`, `active`, `revision`), enum restriction on `direction`, and the `revision ≥ 0` constraint.
- **`describe('deriveBaseLanguage')`** — asserts primary-subtag extraction, passthrough of bare tags, and case/whitespace normalisation of the output.
- **`describe('localeEntrySchema')`** — asserts required paths, the compound `localeEntries_locale_tenant_key` unique index, selective normalisation (locale & tenant lowercased; key trimmed but _not_ lowercased), the `value` default of `''`, and `timestamps: true`.

## Relationships

- **`src/modules/locales/model.ts`** — source of `localeSchema`, `localeEntrySchema`, and `deriveBaseLanguage`; the entire test file exists to pin the behaviour of these three exports.
- **`src/types/index.ts`** — provides `LocaleDirection`, used to assert the enum contract on the `direction` field.
- **`tests/support/schema.ts`** — provides the assertion helpers (`defaultOf`, `enumOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathOptions`, `requiredPaths`) that turn "the schema should declare X" into a single, readable expectation.

## Notes

- Tests assert _schema declarations_ (index specs, option flags, defaults) rather than round-tripping documents through Mongoose. They verify the contract a database would enforce, not application logic.
- The `normalises` helper casts the path lookup to an inline type; if the schema library's option shape changes, this local cast will need updating.
- The distinction "key is trimmed but not lowercased" (vs. locale/tenant which are lowercased) is a deliberate contract: i18n keys are case-sensitive identifiers, while locale and tenant are case-insensitive addresses.
