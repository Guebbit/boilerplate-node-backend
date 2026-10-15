---
source: src/modules/locales/model.ts
sha256: b64daeb4e5106632155abbb78f6d361f0b599106a69e33ba7265ccde2ee458dd
generated_at: 2026-10-15T10:43:39.839198+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/model.ts

## Purpose

Defines the three Mongoose schemas and models behind the OVERRIDE tier of i18n (languages, dictionary entries, entity translations). All lookup and write paths in the locales module read through these models; nothing here is awaited on the hot request path—`t()` resolves from an in-memory overlay that `@infrastructure/i18n` rebuilds at boot, on a timer, and after a write.

## Key elements

- **`localeDisplayName`** – A `trimmedInto`-wrapped Zod field (reused by create/update locale routes) that rejects blank display names at validation with a field-named error.
- **`normalizeTag`** – Single source of truth for BCP 47 tag normalization (`trim().toLowerCase()`). All lookups and writes must compare through this.
- **`deriveBaseLanguage`** – Extracts the ISO 639-1 primary subtag from a normalized tag. Called by the `pre('validate')` hook and by seed scripts directly.
- **`localeSchema` / `localeModel`** – Languages collection. Unique index on `tag`. `baseLanguage` is auto-derived on every save. `revision` is a monotonic counter bumped exclusively via `$inc` in the repository.
- **`localeEntrySchema` / `localeEntryModel`** – Dictionary words, one row per (locale, app, key). Unique compound index `{ locale, app, key }` also serves `{ locale }` prefix queries. `value` defaults to `''` (empty translation is a valid row).
- **`translationSchema` / `translationModel`** – Per-entity translated fields. `fields` is `Schema.Types.Mixed`; shape is validated by the service, not the schema. Unique compound index `{ entityType, entityId, locale }`.
- **`applyLocaleTransform` / `applyLocaleEntryTransform` / `applyTranslationTransform`** – Serialization helpers (via `applySerialization`) that map `_id` → `id` and strip `__v` for lean query results.
- **Document / Model type exports** (`LocaleDocument`, `LocaleEntryDocument`, `TranslationDocument`, `LocaleModel`, `LocaleEntryModel`, `TranslationModel`) – Shared type contracts consumed by repository, services, factories, and tests.

## Relationships

- **`@types`** (`src/types/index.ts`) – Imports `LocaleDirection`, `TranslationOrigin`, and the `Language`, `LocaleEntry`, `Translation` base types that the document interfaces extend (omitting `id`/timestamps, re-adding optional `createdAt`/`updatedAt`).
- **`@api/schemas.zod`** – Imports `CreateLocaleBody` to derive the `localeDisplayName` validator.
- **`src/infrastructure/http/schemas.ts`** – Imports `trimmedInto` for the display-name field.
- **`src/infrastructure/persistence/serialize.ts`** – Imports `applySerialization` to build the three transform functions.
- **`src/modules/locales/repository.ts`** – Consumes `localeModel`, `localeEntryModel`, `translationModel` for all CRUD; owns the `revision` bump logic.
- **`src/modules/locales/services/languages.ts`**, **`services/entries.ts`**, **`services/capabilities.ts`** – Read/write through the models; validate `fields` shape before writing translations.
- **`src/modules/locales/factories.ts`** – Uses the models and `deriveBaseLanguage` to build test/seed documents.
- **`src/modules/locales/tests/unit/schema-contract.test.ts`** – Asserts schema fields, defaults, and index shapes.
- **`src/modules/locales/tests/unit/service.test.ts`**, **`tests/integration/repository.test.ts`**, **`tests/factories.ts`** – Exercise the models end-to-end or in isolation.

## Notes

- **Normalization is centralized.** `normalizeTag` is the *only* place trim+lowercase is decided. Any caller that compares tags without it is a bug. The schemas also set `lowercase: true` / `trim: true` as a DB-level safety net, but the service contract expects pre-normalized input.
- **`baseLanguage` is never set by callers.** The `pre('validate')` hook derives it from `tag`. Supplying it manually will be overwritten on save.
- **`revision` has no `min` constraint on purpose.** Mongoose skips `min`/`max` validation for `$inc` operators; the field is monotonic by construction (starts at 0, only ever +1).
- **String cross-references, not ObjectId FKs.** `localeEntry.locale` and `translation.locale` store the tag string; `translation.entityId` stores a string. Referential integrity is enforced by cascade-delete in the repository, not by Mongo.
- **`translationSchema.fields` is `Schema.Types.Mixed`.** The valid key set depends on the `translatables` registry for the given `entityType`; the schema cannot express that, so the service validates before write.
- **Index key order is intentional for prefix queries.** `localeEntrySchema` index `{ locale, app, key }` serves both `{ locale }` and `{ locale, app }` lookups. `translationSchema` index `{ entityType, entityId, locale }` serves `{ entityType, entityId }` (one entity, all locales). Do not reorder without checking every query path.
- **Unique indexes are the concurrency guard.** Check-then-insert races (two concurrent `createLanguage('es')`, two concurrent imports of the same key) are refused by the DB, not by application logic.
