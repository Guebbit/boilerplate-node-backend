# src/modules/locales/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin down the schema contracts for the two locale collections (`localeSchema`, `localeMessageSchema`) and the `deriveBaseLanguage` helper. They assert required fields, unique indexes, normalisation flags, defaults, enum restrictions, and case/whitespace handling so that a regression in any of those contracts is caught before it reaches the database.

## Key elements

- **`normalises`** (local helper) — reads a schema path's `options` object and returns `{ lowercase?, trim? }`, used to assert normalisation rules without importing Mongoose internals.
- **`describe('localeSchema')`** — verifies required paths (`baseLanguage`, `name`, `nativeName`, `tag`), the single unique index `locales_tag`, `lowercase + trim` on both `tag` and `baseLanguage`, defaults (`direction: ltr`, `active: true`, `revision: 0`), the `LocaleDirection` enum on `direction`, and `revision.min === 0`.
- **`describe('deriveBaseLanguage')`** — asserts the function extracts the primary subtag (`en-GB → en`), passes through bare tags (`it → it`), and normalises case and surrounding whitespace (`'  EN-gb ' → 'en'`).
- **`describe('localeMessageSchema')`** — verifies required paths (`key`, `locale`, `tenant`; `value` is *not* required), the compound unique index `localeMessages_locale_tenant_key` (locale+tenant+key), `lowercase` on `locale`/`tenant` but **not** on `key` (only `trim`), `value` defaulting to `''`, and `timestamps: true` on both collections.

## Relationships

- **`src/modules/locales/model.ts`** — source of the three units under test: `localeSchema`, `localeMessageSchema`, and `deriveBaseLanguage`. This file imports and exercises them; it never mutates or re-exports them.
- **`src/types/index.ts`** — provides `LocaleDirection`, used to assert the `direction` enum values and the `direction` default.
- **`tests/support/schema.ts`** — supplies the schema-inspection helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`, `pathOptions`, `defaultOf`, `enumOf`) that let tests read Mongoose schema metadata without instantiating a model.

## Notes

- `key` is deliberately **not** lower-cased: `Cart.Empty` and `cart.empty` are distinct translation keys. All other identifier-like fields (`tag`, `baseLanguage`, `locale`, `tenant`) are lower-cased to protect their unique indexes.
- `baseLanguage` is *required* in the schema yet never supplied by callers; a `pre('validate')` hook in the model derives it via `deriveBaseLanguage`. The tests lock in that "required + derived" pairing.
- `value` defaults to `''` (empty string) rather than being absent, distinguishing "declared but untranslated" from "not declared."
- The compound unique index on `localeMessageSchema` is what makes a merge an upsert; the tests assert both the index spec and `unique=true` to prevent a silent downgrade to a non-unique index.
