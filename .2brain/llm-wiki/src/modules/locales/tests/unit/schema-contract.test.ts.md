---
source: src/modules/locales/tests/unit/schema-contract.test.ts
source_sha256: 6a8eb7a6e5384139ee169ca0701f1c68fe831a2a83f10d652a13a00651f4b716
context_sha256: 07c5d7c553ed96795cfd7c4859e1eed4fbf1da7e9f995338616092adba80af6d
generated_at: 2026-11-22T05:51:42.917500+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/unit/schema-contract.test.ts

## Purpose
Unit tests that pin the contracts of the locale Mongoose schemas (`localeSchema`, `localeEntrySchema`) and the `deriveBaseLanguage` helper. They guard the two unique indexes that make the translation tier addressable (`locales_tag` and `localeEntries_locale_app_key`, which lets a merge be an upsert) and the tag normalisation that keeps those indexes from being bypassed by case variants like `EN-gb` vs `en-GB`.

## Key elements
- `stored(schema, path, value)` — helper that runs a string path's own `set:` option on a value, returning what would be stored.
- `normalises(schema, path)` — helper returning a path's schema options (`lowercase`, `trim`) so tests can assert them.
- `describe('localeSchema')` — asserts:
  - required paths are `baseLanguage`, `name`, `nativeName`, `tag`;
  - a single unique index `locales_tag` on `tag+1`;
  - `tag` is trimmed and canonicalised (`'  EN-gb '` → `en-GB`, `zh-hant-tw` → `zh-Hant-TW`), and a malformed tag such as `en-a` is stored as written rather than throwing;
  - `baseLanguage` is lowercase and trimmed;
  - defaults are `direction = LocaleDirection.ltr`, `active = true`, `revision = 0`;
  - the `direction` enum equals `Object.values(LocaleDirection)`.
- `describe('deriveBaseLanguage')` — takes the primary subtag (`en-GB` → `en`), leaves bare tags alone (`it`), and lowercases and trims input (`'  EN-gb '` → `en`).
- `describe('localeEntrySchema')` — asserts:
  - required paths are `app`, `key`, `locale` (`value` is deliberately not required);
  - a compound unique index `localeEntries_locale_app_key` on `locale+1, app+1, key+1`;
  - `locale` is canonicalised (`PT-br` → `pt-BR`), `app` is lowercased, and `key` is trimmed but not lowercased;
  - `value` defaults to `''`;
  - `timestamps` is enabled on both schemas.

## Relationships
- `src/modules/locales/model.ts` — source of `localeSchema`, `localeEntrySchema` and `deriveBaseLanguage`, the code under test.
- `src/types/index.ts` — supplies the `LocaleDirection` enum (imported via `@types`) used for the direction default and enum checks.
- `tests/support/schema.ts` — schema-introspection helpers (imported via `@tests/schema`): `defaultOf`, `enumOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `requiredPaths`.

## Notes
- The tests inspect schema definitions only. They don't touch a database, so they verify index declarations, not index enforcement.
- `baseLanguage` is required but never supplied by callers. A `pre('validate')` hook derives it, but that hook is not exercised here; only the required flag and `deriveBaseLanguage` are tested.
- Keys are intentionally case-sensitive: `Cart.Empty` and `cart.empty` are distinct keys, so lowercasing them would silently merge two strings.
- An empty-string `value` is a legitimate translation, so "declared but untranslated" stays distinguishable from a missing key.
