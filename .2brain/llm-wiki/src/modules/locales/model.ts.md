---
source: src/modules/locales/model.ts
source_sha256: 2a5076262fce9adbd78962350ecc688d3715df773075ac1df1fbee2e5b372166
context_sha256: a3c97153c5f3c131de26629d888caea5c7f054f122fb75d2708f8a2204d942a5
generated_at: 2026-11-22T05:45:11.079003+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/model.ts

## Purpose
Defines the Mongoose schemas, document/model types, and normalization helpers for the three collections behind the OVERRIDE tier of translations: languages, locale entries, and per-entity translations. These hold runtime edits to both dictionaries. Nothing here is awaited on the request path: `t()` reaches these rows only through an overlay that `@infrastructure/i18n` rebuilds at boot, on a timer, and after a write. If Mongo is down, the overlay goes stale, but requests still resolve their own copy.

## Key elements
- `localeDisplayName`: a Zod validator derived from `CreateLocaleBody.shape.name`, wrapped with `trimmedInto`. It trims before applying the contract's bounds, so a whitespace-only name is refused at validation with a field-named error.
- `normalizeTag(tag)`: trims a BCP 47 tag and canonicalizes its case (`pt-br` → `pt-BR`). It never throws. An unparseable tag comes back trimmed and is refused by validation.
- `deriveBaseLanguage(tag)`: returns the lower-case primary subtag (`pt-BR` → `pt`). It normalizes first, because seeds call it without going through a Mongoose setter.
- `LocaleDocument`, `LocaleEntryDocument`, `TranslationDocument`: document interfaces built from the generated `Language`, `LocaleEntry` and `Translation` types. `LocaleDocument` also drops `apps`, `source` and `entryCount`, which the manifest derives from the tiers.
- `LocaleModel`, `LocaleEntryModel`, `TranslationModel`: Mongoose `Model` type aliases.
- `localeSchema`: the languages collection.
  - Fields: `tag`, `baseLanguage`, `name`, `nativeName`, `direction` (enum `LocaleDirection`, default `ltr`), `active` (default `true`) and `revision` (default 0).
  - Behavior: `tag` is canonicalized on write by `canonicalLocaleSetter`. A `pre('validate')` hook always derives `baseLanguage` from `tag`. The schema has timestamps and uses `revisionPlugin`.
  - Index: unique index `locales_tag` on `tag`.
- `localeEntrySchema`: one row per (language, app, key).
  - Fields: `locale` (the language tag stored as a string, not an ObjectId), `app` (lower-cased string), `key` (flat dotted string) and `value` (default `''`).
  - Index: unique compound index `localeEntries_locale_app_key` on `{ locale, app, key }`.
- `translationSchema`: one entity's translated fields in one locale.
  - Fields: `entityType`, `entityId` (string), `locale`, `fields` (`Mixed`, default `{}`), optional `sourceDigest`, `origin` (enum `TranslationOrigin`, default `human`) and `translatedBy`.
  - Index: unique compound index `translations_entity_locale` on `{ entityType, entityId, locale }`.

## Relationships
- `@infrastructure/i18n` (`index.ts`): supplies `canonicalLocale`, `baseLanguage` and `canonicalLocaleSetter` for tag handling. It also rebuilds the overlay from these collections.
- `@infrastructure/http/schemas`: supplies `trimmedInto`, used for `localeDisplayName`.
- `@infrastructure/persistence/revision-plugin`: `revisionPlugin` is applied to `localeSchema` and provides the edit counter behind `ETag`/`If-Match`.
- `@infrastructure/persistence/serialize`: `applySerialization` is imported here, but the visible part of the file does not show where it is used.
- `./repository`: owns the `revision` bump (`$inc`) and the cascade of entry deletes when a language is deleted. It also holds `deriveSourceDigest`, which determines when `sourceDigest` is set.
- Services, factories, presenters and tests (listed as graph neighbors): these consume the schemas, types and helpers exported here. The visible part of this file does not show the details.

## Notes
- The schemas rely on unique indexes for concurrency safety, since creation is check-then-insert. `pt-BR` and `pt-br` must not become two rows, so tags are canonicalized on write.
- `revision` (dictionary-write counter, bumped in the repository) is separate from the `revisionPlugin` counter (edit counter for `ETag`/`If-Match`).
- `revision` has no `min: 0` because it is only ever moved by `$inc`, which Mongoose does not validate.
- `locale` references the language by tag, not by id. Referential integrity is handled by the repository's cascade, not by Mongoose.
- `app` is a plain string, not an enum, because the set of apps is configuration. The service refuses unknown apps with 422.
- `translationSchema.fields` is `Mixed`. Its keys are validated by the service against the `translatables` registry, not by the schema.
- Indexes are explicitly named, so a refactor cannot leave an old index in place and build a second copy.
- `localeDisplayName` is documented as shared by the `post-locale` and `update-locale` handlers; those files are not among this page's graph neighbors.
