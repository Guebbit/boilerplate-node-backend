---
source: src/modules/locales/model.ts
sha256: 42e43465af993bf09a8d142ef59a01cceed1f00160b1fe07eda254cae6de8ef3
generated_at: 2026-10-29T04:21:17.698741+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/model.ts

## Purpose

Defines the three Mongoose schemas and their document/model type aliases for the **OVERRIDE tier** of the i18n system: registered languages, per-key dictionary entries, and entity-level translations. These are the runtime-editable rows that the `@infrastructure/i18n` overlay reads at boot, on a timer, and after writes. Nothing in this file is ever awaited on the request path—a Mongo outage or a malformed key only makes the overlay stale, never fails a request.

## Key elements

- **`localeDisplayName`** – A shared Mongoose string validator (trimmed, `minLength: 1` after trim) used by both `create-locale` and `update-locale` routes.
- **`normalizeTag(tag)`** – Trims + lowercases a BCP 47 tag. The single normalization point for all lookups/writes in the module.
- **`deriveBaseLanguage(tag)`** – Extracts the ISO 639-1 primary subtag (`pt-BR` → `pt`). Called by the `pre('validate')` hook and directly by seed scripts.
- **`LocaleDocument` / `LocaleEntryDocument` / `TranslationDocument`** – Mongoose document interfaces that `Omit` the generated API types of `id`, timestamps, and (for `Language`) the derived fields `apps`, `source`, `entryCount`.
- **`LocaleModel` / `LocaleEntryModel` / `TranslationModel`** – `Model<…>` type aliases for the three collections.
- **`localeSchema`** – Schema for the `Locale` collection: `tag` (unique, lowercased), `baseLanguage` (derived), `name`, `nativeName`, `direction`, `active`, `revision`. Includes a `pre('validate')` hook that populates `baseLanguage` and a named unique index `locales_tag`.
- **`localeEntrySchema`** – Schema for the entry collection: `locale` (tag string, not ObjectId), `app`, `key`, `value`. Named unique compound index `localeEntries_locale_app_key`.
- **`translationSchema`** – Schema for entity translations: `entityType`, `entityId`, `locale`, `fields` (`Mixed`), `sourceDigest`, `origin`, `translatedBy`. Named unique compound index `translations_entity_locale`.
- **`applyLocaleTransform` / `applyLocaleEntryTransform` / `applyTranslationTransform`** – Serialization transforms (via `applySerialization`) that map `_id` → `id` and strip `__v` from lean query results.
- **`localeModel`** (and sibling model exports) – The `model<…>()` entrypoints that register each schema with Mongoose.

## Relationships

- **`src/infrastructure/http/schemas.ts`** – Provides `trimmedInto`, which `localeDisplayName` wraps to enforce trimmed-string bounds at validation time.
- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, the factory behind the three `*Transform` exports.
- **`src/modules/locales/repository.ts`** – Consumes `localeModel`, the entry model, and the translation model for all CRUD and the `bumpRevision` `$inc` logic; owns the cascade-delete of entries when a language is removed.
- **`src/modules/locales/services/languages.ts`** – Queries the `Locale` collection through the repository; relies on `normalizeTag` and `active` flag semantics defined here.
- **`src/modules/locales/services/entries.ts`** – Reads/writes the entry collection; validates `app` and `key` before a row is written (the schema itself does not enumerate valid apps).
- **`src/modules/locales/services/capabilities.ts`** – Reads language metadata (direction, active, revision) to build capability responses.
- **`src/modules/locales/presenters.ts`** – Shapes `LocaleDocument` / `LocaleEntryDocument` into wire-format responses using the `*Transform` helpers.
- **`src/modules/locales/factories.ts`** – Constructs document instances against these schemas for service injection in tests.
- **`src/modules/locales/index.ts`** – Re-exports the public surface of this module (types, models, transforms) for the rest of the codebase.
- **Test files** (`tests/factories.ts`, `tests/unit/schema-contract.test.ts`, `tests/unit/service.test.ts`, `tests/integration/*.test.ts`) – Instantiate the models, assert schema contracts (required fields, defaults, enum bounds), and exercise repository round-trips against the three collections.

## Notes

- **`baseLanguage` is hook-derived, not assignment-derived.** The `pre('validate')` hook guarantees every write path (including ad-hoc scripts and tests that bypass the repository) gets a consistent value. Don't set it manually.
- **`value` in entries uses `default: ''`, not `required: true`.** An empty translation is a legitimate row (imported-but-untranslated key). Mongoose `required` on a String rejects `""`.
- **`fields` in translations is `Schema.Types.Mixed`.** Validation of which keys are legal for a given `entityType` is the service's job (via the `translatables` registry), not the schema's.
- **Compound index column order is intentional.** `localeEntrySchema` puts `locale` first (prefix serves both per-app and per-language reads); `translationSchema` puts `entityId` before `locale` (the common read is "all locales for one entity"). Do not reorder.
- **`revision` has no `min: 0`.** Mongoose does not validate `$inc` operators against `min`/`max`; the field is monotonic by construction (`$inc: 1` only, starting at 0), so the constraint is unenforceable and unnecessary.
- **`locale` / `app` / `entityId` are plain strings, not ObjectIds.** There is no cross-collection join; referential integrity is enforced at the repository layer (cascade delete) or the service layer (422 on unknown app).
- **The module is never on the request hot path.** The i18n overlay (`@infrastructure/i18n`) is the sole reader of these rows at request time; services here are write-path only.
