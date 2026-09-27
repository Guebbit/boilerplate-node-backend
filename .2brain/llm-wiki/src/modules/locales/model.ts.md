---
source: src/modules/locales/model.ts
sha256: a65c5f782d0f8e11ba353509e8cb0cecd27b4679606d71be82674dea4fd9d782
generated_at: 2026-09-27T14:59:23.456244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/model.ts

## Purpose

Defines the Mongoose schemas, models, document types, and shared validation helpers for the three collections behind the i18n OVERRIDE tier: registered languages, per-tenant dictionary entries, and per-entity translations. This file is the single source of truth for shape, indexes, and derivation logic; nothing here is awaited on the request path — `t()` resolves via a boot/timer/after-write overlay.

## Key elements

- **`localeDisplayName`** — Zod schema (`string().trim().min(1)`) shared by create/update locale routes; catches the single-space edge case before Mongoose's `required` check.
- **`normalizeTag(tag)`** — Trim + lowercase a BCP 47 tag. The one canonical normalization used by every lookup and write in this module.
- **`deriveBaseLanguage(tag)`** — Extracts the ISO 639-1 primary subtag (e.g. `pt-BR` → `pt`). Called both by the `pre('validate')` hook and directly by seeds.
- **`localeSchema` / `localeModel`** — Languages collection. Unique index on `tag` (lowercased). `baseLanguage` is derived in a `pre('validate')` hook so it cannot drift from `tag`.
- **`localeEntrySchema` / `localeEntryModel`** — One row per (language, tenant, key). Compound unique index `{locale, tenant, key}` doubles as a serving index for both per-tenant and per-language reads. `key` is a flat dotted string, not a nested object. `value` defaults to `''` (empty translation is valid).
- **`translationSchema` / `translationModel`** — One entity's translated fields in one locale. `fields` is `Schema.Types.Mixed` (validated by the service, not the schema). Compound unique index `{entityType, entityId, locale}`.
- **`applyLocaleTransform` / `applyLocaleEntryTransform` / `applyTranslationTransform`** — Serialization transforms built from `applySerialization` (maps `_id` → `id`, strips `__v`).
- **Document/Model type interfaces** — `LocaleDocument`, `LocaleEntryDocument`, `TranslationDocument` and their `Model<…>` type aliases for typed Mongoose usage.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — Imports `applySerialization` to build the three transform functions.
- **`src/types/index.ts`** — Supplies `LocaleDirection`, `TranslationOrigin`, `Language`, `LocaleEntry`, `Translation` used in schema definitions and document interfaces.
- **`src/modules/locales/repository.ts`** — Consumes the three models for CRUD; owns the `revision` bump on entry writes.
- **`src/modules/locales/factories.ts`** — Instantiates documents via the models/schemas defined here.
- **`src/modules/locales/services/languages.ts` / `entries.ts` / `capabilities.ts`** — Validate inputs against `localeDisplayName` / `normalizeTag` and read/write through the models.
- **`src/modules/locales/index.ts`** — Re-exports the models, schemas, and helpers for the module's public surface.
- **`src/modules/locales/tests/unit/schema-contract.test.ts`** — Asserts schema shapes, indexes, and defaults defined here.
- **`src/modules/locales/tests/unit/service.test.ts` / `tests/factories.ts`** — Use the models and document types in unit tests.
- **`src/modules/locales/tests/integration/repository.test.ts`** — Exercises repository CRUD against these schemas (unique-index collisions, revision bumps).
- **`tests/integration/app/demo-restore.test.ts`** — Integration path that exercises the full stack including these collections.

## Notes

- **Index ordering is load-bearing.** `localeEntrySchema` places `tenant` before `key` so a single compound index serves both `find({locale, tenant})` and `find({locale})` by prefix. Same pattern in `translationSchema`: `entityId` sits before `locale` to serve `{entityType, entityId}` lookups.
- **`pre('validate')`, not `pre('save')`.** The `baseLanguage` derivation hook runs at validation time because `required: true` is checked there; a `pre('save')` hook would fire too late.
- **String foreign keys, not ObjectIds.** `locale` in entries/translations and `entityId` in translations are plain strings. Referential integrity is enforced by repository-level cascade, not by Mongo refs.
- **Mongoose pluralization quirk.** `LocaleEntry` becomes the collection `localeentries` (no hyphen) on disk, same as `AuditLog` → `auditlogs`.
- **`translationSchema.fields` is untyped.** It is `Schema.Types.Mixed` by design — the valid key set depends on the `translatables` registry for `entityType`, which the schema cannot reference. Validation lives in the service layer.
- **`value: ''` is intentional.** An empty string represents "key exists, not yet translated." Using `required: true` on a String would reject it.
