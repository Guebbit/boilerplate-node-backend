---
source: src/modules/locales/model.ts
sha256: 1a8a0071037ff126670614fa989030ff808efab0a0007e41d42e41c4809e9610
generated_at: 2026-11-14T20:19:46.871539+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/model.ts

## Purpose

Defines the three Mongoose schemas behind the OVERRIDE tier — the `locales`, `localeEntries`, and `translations` collections. These schemas are the persistence contract for locale metadata, per-key translations, and entity-level translations. Nothing here is awaited on the request path; `t()` resolves through an i18n overlay that reads these rows at boot, on a timer, and after writes.

## Key elements

- **`localeDisplayName`** — A Zod validation helper (via `trimmedInto`) shared by the `post-locale` and `update-locale` routes; rejects blank display names with a field-named error.
- **`normalizeTag(tag)`** — Trims and canonical-cases a BCP 47 tag (`pt-br` → `pt-BR`). Single source of truth for tag normalization; never throws.
- **`deriveBaseLanguage(tag)`** — Returns the lower-cased ISO 639-1 subtag (`pt-BR` → `pt`). Used by the `pre('validate')` hook and by seeds that bypass Mongoose setters.
- **`localeSchema`** — Schema for registered languages. Unique index on `tag`. `baseLanguage` is derived in a `pre('validate')` hook. Carries an `active` flag and a monotonically-incrementing `revision` counter. Plugins: `revisionPlugin`, `applySerialization`.
- **`localeEntrySchema`** — Schema for per-key translations. Unique compound index `{ locale, app, key }`. `value` defaults to `''` (empty translation is legitimate). `locale` stores the tag string, not an ObjectId ref.
- **`translationSchema`** — Schema for entity-level translations. Unique compound index `{ entityType, entityId, locale }`. `fields` is `Mixed` (validated by service, not schema). `sourceDigest` is optional (absent on the fallback-locale row).
- **Document / Model type aliases** — `LocaleDocument`, `LocaleEntryDocument`, `TranslationDocument`, `LocaleModel`, `LocaleEntryModel`, `TranslationModel` for typed access throughout the module.

## Relationships

- **`src/infrastructure/i18n/index.ts`** / **`src/infrastructure/i18n/locale-tag.ts`** — Supply `canonicalLocale`, `canonicalLocaleSetter`, and `baseLanguage`, which the schemas use as setters and which the `pre('validate')` hook and `deriveBaseLanguage` rely on.
- **`src/infrastructure/persistence/revision-plugin.ts`** — Applied to `localeSchema`; manages the `ETag` / `If-Match` revision counter (distinct from the `revision` field).
- **`src/infrastructure/persistence/serialize.ts`** — `applySerialization` plugin applied to schemas for consistent output serialization.
- **`src/infrastructure/http/schemas.ts`** — `trimmedInto` and `CreateLocaleBody` shape feed the `localeDisplayName` export and field validation.
- **`src/modules/locales/repository.ts`** — Owns the actual `model()` calls, the `bumpRevision` `$inc` write, and cascade deletes; this file provides only the schemas and types it composes.
- **`src/modules/locales/factories.ts`** — Builds document instances from these schemas for service and test use.
- **`src/modules/locales/services/languages.ts`**, **`src/modules/locales/services/entries.ts`**, **`src/modules/locales/services/capabilities.ts`** — Read/write through the models defined here.
- **`src/modules/locales/tests/factories.ts`**, **`src/modules/locales/tests/integration/repository.test.ts`** — Construct documents and assert schema-level guarantees (unique indexes, derived fields).

## Notes

- **`tag` normalization is the single source of truth.** Both `normalizeTag` and the schema's `set: canonicalLocaleSetter` enforce the same canonical form; callers must not re-normalize. A stray space or case mismatch is a caller bug.
- **`baseLanguage` is derived, never written.** The `pre('validate')` hook keeps it in sync on every path (including one-off scripts). Do not set it manually in factories unless replicating the hook.
- **`localeEntrySchema.value` uses `default: ''`, not `required: true`.** An empty string is a valid "not yet translated" state; `required` would reject it.
- **`revision` on `localeSchema` has no `min: 0`.** It is monotonic by construction (`$inc: 1` only), and Mongoose does not validate `min` on `$inc` updates.
- **Indexes are explicitly named** to prevent accidental duplicate index creation during refactors.
- **`locale`, `app`, `key` in entries and `entityType`, `entityId`, `locale` in translations are stored as plain strings**, not ObjectId refs, to avoid joins and to keep the collection generic across entity types.
- **The file is truncated in the provided content**; a `normalizeLanguage` (or similar) serialization helper appears at the bottom.
