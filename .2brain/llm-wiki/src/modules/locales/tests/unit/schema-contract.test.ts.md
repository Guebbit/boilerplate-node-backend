---
source: src/modules/locales/tests/unit/schema-contract.test.ts
sha256: 0889f3837e69ce9eb3042d713c3b3e4b240647c1872f32b5e08f3dc4aeadcf86
generated_at: 2026-11-14T20:25:18.383095+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that lock down the schema contracts of `localeSchema` and `localeEntrySchema` (required fields, unique indexes, field-level normalisation, defaults, enums) and the `deriveBaseLanguage` helper. They exist to guarantee that the two unique indexes (`locales_tag`, `localeEntries_locale_app_key`) and the tag/app/locale normalisation rules cannot be silently weakened, because those rules are what make the translation tier addressable and merges safe as upserts.

## Key elements

- **`stored(schema, path, value)`** – local helper that invokes a path's `set` option (the value setter) to verify what a raw input becomes at storage time, without running full validation.
- **`normalises(schema, path)`** – local helper that reads a path's `lowercase` / `trim` option flags.
- **`describe('localeSchema')`** – asserts required paths, the `locales_tag` unique index, tag canonicalisation (`'  EN-gb '` → `'en-GB'`), defaults (`direction: ltr`, `active: true`, `revision: 0`), and the `direction` enum.
- **`describe('deriveBaseLanguage')`** – asserts primary-subtag extraction (`'en-GB'` → `'en'`), passthrough for bare tags, and case/whitespace normalisation.
- **`describe('localeEntrySchema')`** – asserts required paths (`app`, `key`, `locale` — not `value`), the compound unique index `localeEntries_locale_app_key`, locale/app normalisation vs. key's intentional lack of lowercasing, `value` defaulting to `''`, and `timestamps: true` on both schemas.

## Relationships

- **`src/modules/locales/model.ts`** — the system under test; provides `localeSchema`, `localeEntrySchema`, and `deriveBaseLanguage`.
- **`src/types/index.ts`** — supplies the `LocaleDirection` enum used to assert the `direction` field's allowed values and default.
- **`tests/support/schema.ts`** — provides the assertion helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `defaultOf`, `enumOf`, `optionsOf`) that extract schema metadata as comparable strings/values.

## Notes

- `stored` exercises **only** the `set` setter, not the full Mongoose validation pipeline. A malformed tag like `'en-a'` is expected to pass through the setter unchanged and be rejected later by schema validation — these tests deliberately do not cover that path.
- Index assertions are on the **string representation** of the spec (e.g. `'locales_tag: unique=true'`), not on a live database, so they verify the *declaration* in the schema definition.
- In `localeEntrySchema`, `key` is trimmed but **not** lowercased, while `locale` and `app` are both lowercased. This asymmetry is intentional and tested: `Cart.Empty` and `cart.empty` must remain distinct.
