# src/modules/locales/tests/unit/schema-contract.test.ts

## Purpose

Asserts the declarative contracts (required paths, unique indexes, normalisation options, defaults, enum constraints) of the `localeSchema` and `localeMessageSchema` Mongoose schemas, and verifies the `deriveBaseLanguage` subtag-extraction helper. The tests inspect schema metadata only — no database, no runtime behaviour — so they act as a guard against accidental schema drift that would break tag uniqueness, translation upsert semantics, or language negotiation.

## Key elements

- **`normalises(schema, path)`** — local helper that reads a path's `options` object and returns the `lowercase`/`trim` flags, letting tests assert normalisation without re-implementing Mongoose introspection.
- **`describe('localeSchema')`** — five assertions: required path list (`baseLanguage`, `name`, `nativeName`, `tag`); unique index `locales_tag` on `tag`; `lowercase: true` + `trim: true` on both `tag` and `baseLanguage`; defaults (`direction: ltr`, `active: true`, `revision: 0`); `direction` restricted to `LocaleDirection` enum and `revision` ≥ 0.
- **`describe('deriveBaseLanguage')`** — three assertions: extracts the primary subtag (`en-GB` → `en`); passes a bare tag through unchanged; trims and lower-cases input before extraction.
- **`describe('localeMessageSchema')`** — five assertions: required paths are `key`, `locale`, `tenant` (note: `value` is *not* required); compound unique index `locale+1, tenant+1, key+1`; `locale` and `tenant` lower-cased, `key` trimmed but **not** lower-cased; `value` defaults to `''`; `timestamps: true` on both schemas.

## Relationships

- **`src/modules/locales/model.ts`** — the SUT. Imports `localeSchema`, `localeMessageSchema`, and `deriveBaseLanguage`; every assertion in the file reads metadata from those exports.
- **`src/types/index.ts`** — provides the `LocaleDirection` enum used to assert the `direction` field's allowed values.
- **`tests/support/schema.ts`** — supplies the introspection helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `defaultOf`, `enumOf`, `optionsOf`, `pathOptions`) that the tests call to read schema metadata without a running database.

## Notes

- `value` is deliberately **absent** from `requiredPaths` for `localeMessageSchema`; an empty string is a valid "declared but untranslated" state, and the schema default is `''` rather than the field being omitted.
- `key` is trimmed but **not** lower-cased, while `locale` and `tenant` are lower-cased. This asymmetry is intentional: keys are case-sensitive identifiers (`Cart.Empty` ≠ `cart.empty`).
- The `normalises` helper is file-local and not part of the shared test-support module; if more schema tests need the same check, consider promoting it to `tests/support/schema.ts`.
- All tests are pure metadata assertions — they will not catch runtime `pre('validate')` hook failures (e.g., `baseLanguage` actually being derived). Those are presumably covered elsewhere.
