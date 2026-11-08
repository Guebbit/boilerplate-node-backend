---
source: src/modules/locales/factories.ts
sha256: 6d390cd4dcd5ed1b462687ccd3610c25973524fe42569702dfa09a3c9f17822a
generated_at: 2026-11-08T06:22:51.372296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/factories.ts

## Purpose

Builds the two shapes of locale fixture data — a language row and a translated-entry row — for use by repositories' `create` methods. The factories exist so that test/integration code can seed records that are structurally identical to what the API would produce, without duplicating derivation logic (e.g. `baseLanguage`).

## Key elements

- **`LocaleOverrides`** — type describing the fields `makeLocale` accepts; extends `OverridesFor<Language>` and requires `tag` (BCP 47 string).
- **`LocaleFixture`** — the return type of `makeLocale`; a `Partial<LocaleDocument>` with guaranteed `_id` and `tag`.
- **`makeLocale(overrides)`** — constructs a language fixture. Sets `name` and `nativeName` to the tag, derives `baseLanguage` via `deriveBaseLanguage(tag)` (mirroring `createLanguage`), and merges in any caller-supplied overrides (undefined values stripped).
- **`LocaleEntryOverrides`** — type describing the fields `makeLocaleEntry` accepts; requires `locale` and `key`.
- **`LocaleEntryFixture`** — the return type of `makeLocaleEntry`; a `Partial<LocaleEntryDocument>` with guaranteed `_id`, `locale`, and `key`.
- **`makeLocaleEntry(overrides)`** — constructs a single translated-string fixture; applies `identityOf` and spreads remaining fields (undefined values stripped).

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — provides `identityOf` (generates `_id`, `createdAt`, `updatedAt`) and the `OverridesFor` type used to shape both override interfaces.
- **`src/infrastructure/object-guards.ts`** — provides `stripUndefined`, which both factories apply to their field spreads so that absent keys don't clobber schema defaults.
- **`src/modules/locales/model.ts`** — supplies `deriveBaseLanguage` (called by `makeLocale` to compute the same value `createLanguage` would) and the `LocaleDocument` / `LocaleEntryDocument` types that fixture types extend.
- **`src/types/index.ts`** — source of the `Language` and `LocaleEntry` types used in the `OverridesFor<…>` generics.
- **`src/modules/locales/tests/factories.ts`** — a test-facing wrapper that calls `makeLocale` / `makeLocaleEntry` to seed integration test data.
- **`scenarios/locales.ts`** — consumes the fixtures to arrange locale state in scenario-based tests.

## Notes

- `baseLanguage` is **always** derived from `tag`; passing it as an override in `makeLocale` is possible but would be silently correct only if it matches `deriveBaseLanguage(tag)`'s output. The comment warns against stating it, since a fixture that diverges would seed a record the API could never produce.
- Both factories pin an `_id` because `insertIfAbsent` / `upsertById` key idempotency on the id, not on `locale`+`key` or `tag`.
- Any field a factory does **not** explicitly set falls through to the Mongoose schema's `default:` values in `./model`, keeping the seeded record a faithful schema record rather than a factory guess.
- `tag` is lowercased by the schema on write; fixtures may pass either case.
