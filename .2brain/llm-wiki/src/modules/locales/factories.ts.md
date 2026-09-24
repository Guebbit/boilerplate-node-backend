---
source: src/modules/locales/factories.ts
sha256: ef90ebf2e173b6a2c92d70d566c31570a6f3bfe62b7ed19cc953b36a16ed2816
generated_at: 2026-09-23T18:49:37.626927+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/factories.ts

## Purpose

Builds minimal, schema-conformant fixtures for the two locale collections (language and entry) so that integration and contract tests can seed deterministic data without hand-constructing full documents. It exists to separate fixture construction from the persistence layer, keeping test setup readable and ensuring only explicitly stated fields (plus schema defaults) appear in the seeded record.

## Key elements

- **`makeLocale(overrides: LocaleOverrides): LocaleFixture`** — Assembles a language fixture. Derives `baseLanguage` via `deriveBaseLanguage(tag)` (same logic as the `createLanguage` service path) so a fixture can never express a value the API would reject. Sets `name` and `nativeName` to the BCP-47 tag. Requires `_id` and `tag`.
- **`makeLocaleEntry(overrides: LocaleEntryOverrides): LocaleEntryFixture`** — Assembles a single translated-string fixture. Requires `_id`, `locale` (tag), and `key`. No derived fields.
- **`LocaleOverrides` / `LocaleEntryOverrides`** — Public override types; extend `OverridesFor<…>` from the persistence factory module so any schema-defaulted field can be optionally stated.
- **`LocaleFixture` / `LocaleEntryFixture`** — Output types; `Partial<Document>` plus the identity/addressing fields that `insertIfAbsent` / `upsertById` key on.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — Supplies `identityOf`, `stripUndefined`, and the generic `OverridesFor<T>` helper used by both factories.
- **`src/modules/locales/model.ts`** — Supplies `deriveBaseLanguage` (used inside `makeLocale`) and the `LocaleDocument` / `LocaleEntryDocument` types that shape the fixture output.
- **`src/types/index.ts`** — Source of the `Language` and `LocaleEntry` domain types that parameterize `OverridesFor`.
- **Test files** (e.g. `translation-resolution.test.ts`, `product-write.test.ts`, `contract/product-write.test.ts`) — Import `makeLocale` / `makeLocaleEntry` to seed locale data before exercising API endpoints or repository methods.

## Notes

- `makeLocale` hard-sets `name` and `nativeName` to the tag _before_ spreading overrides, so passing `name` in the overrides will override it. `makeLocaleEntry` has no such implicit fields.
- `baseLanguage` is always derived from `tag`; a caller cannot supply it directly. This is intentional — the comment notes it prevents fixtures from representing a dataset the public API can never produce.
- Because both factories pin `_id`, idempotency in `insertIfAbsent` / `upsertById` is keyed on the ObjectId, not on `(locale, key)` or `tag`. Two calls with different `_id` but the same logical identity will create two rows.
- Fields omitted from the overrides fall through to Mongoose schema `default:` values at write time; the factories do not inject defaults themselves.
