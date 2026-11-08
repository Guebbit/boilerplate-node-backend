---
source: src/modules/locales/model.ts
sha256: 80a9377d9438701d2f3ab11f6cfc272136ef74ffb50315e7f9826820b1460692
generated_at: 2026-11-08T06:23:14.312839+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/model.ts

## Purpose

Defines the three Mongoose schemas, document/model types, indexes, and serialization transforms for the locale subsystem: **languages** (`Locale`), **dictionary entries** (`LocaleEntry`), and **entity translations** (`Translation`). It is the single source of truth for how these collections are shaped, indexed, and normalized on the way out of Mongo.

## Key elements

- **`localeDisplayName`** — Reusable Zod validator (via `trimmedInto`) for a language's display name; rejects blank-after-trim input with a field-named error.
- **`normalizeTag`** — Trims + lowercases a BCP 47 tag. Single definition of "normalized" used across the module.
- **`deriveBaseLanguage`** — Extracts the ISO 639-1 primary subtag (e.g. `pt-BR` → `pt`) from a normalized tag.
- **`LocaleDocument` / `LocaleEntryDocument` / `TranslationDocument`** — Mongoose `Document` interfaces that override the generated `@types` shapes (swapped `id`/`_id`, optional timestamps).
- **`LocaleModel` / `LocaleEntryModel` / `TranslationModel`** — Mongoose `Model<>` type aliases for typed queries.
- **`localeSchema`** — Schema for the languages collection. Fields: `tag` (unique, lowercased), `baseLanguage` (derived via `pre('validate')` hook), `name`, `nativeName`, `direction`, `active`, `revision`. Unique index `locales_tag` on `{ tag: 1 }`.
- **`localeEntrySchema`** — Schema for one translated string per (locale, app, key). Unique compound index `localeEntries_locale_app_key` on `{ locale, app, key }`. `value` defaults to `''` so an untranslated row is legal.
- **`translationSchema`** — Schema for entity-level translations. `fields` is `Mixed` (validated by the service, not the schema). Unique index `translations_entity_locale` on `{ entityType, entityId, locale }`.
- **`applyLocaleTransform` / `applyLocaleEntryTransform` / `applyTranslationTransform`** — Serialization helpers (via `applySerialization`) that map `_id` → `id` and strip `__v` from lean query results.
- **`localeModel`** (and entrypoint models) — The exported `mongoose.model()` registrations; the only place each collection's model is instantiated.

## Relationships

- **`@infrastructure/http/schemas`** — Provides `trimmedInto`, the Zod wrapper that builds `localeDisplayName`.
- **`@infrastructure/persistence/serialize`** — Provides `applySerialization`, which the three `*Transform` exports call to generate their document-to-JSON mappers.
- **`@api/schemas.zod`** — Supplies `CreateLocaleBody.shape.name` as the base Zod schema for `localeDisplayName`.
- **`@types`** — Supplies `LocaleDirection`, `TranslationOrigin` (enum values for schema `enum`/`default`) and the base `Language` / `LocaleEntry` / `Translation` interfaces that the document types `Omit` from.
- **`./repository.ts`** — Consumes the models and the transform functions for all CRUD reads/writes; owns the `revision` `$inc` bump.
- **`./factories.ts`** / **`./presenters.ts`** — Build and reshape documents using the types and transforms exported here.
- **`./services/*`** — Validate against the contract before writing through the repository; rely on the schema's `enum`/`default` values for `direction` and `origin`.
- **Tests** (`tests/unit/schema-contract.test.ts`, `tests/integration/*`) — Assert index names/uniqueness, field defaults, and that the pre-validate hook fires.

## Notes

- `baseLanguage` is **never** supplied by a caller; it is always derived in a `pre('validate')` hook. Any code path that writes a `Locale` document (seeds, scripts, tests) will get it set automatically.
- `revision` has no `min: 0` because Mongoose skips `min`/`max` validation on `$inc` updates. It is monotonic by construction.
- The unique indexes are the **only** concurrency guard for duplicate detection (e.g., two simultaneous `createLanguage('es')` calls). Service-layer check-then-insert is not safe on its own.
- `localeEntrySchema` and `translationSchema` store `locale` as a plain string (lowercased, trimmed) rather than an ObjectId reference to avoid a join on the hot read path.
- `translationSchema.fields` is `Mixed`; shape validation is the **service's** responsibility (via the `translatables` registry), not the schema's.
- Index names are explicit strings, not auto-generated, to prevent a rename from silently creating a duplicate index alongside the old one.
