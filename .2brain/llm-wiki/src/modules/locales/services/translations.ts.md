---
source: src/modules/locales/services/translations.ts
sha256: e48864b11e4fc7991dac246cdbb3ca74756d7a65cf8bf8fce2227376222e28ef
generated_at: 2026-11-14T20:22:35.613992+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translations.ts

## Purpose

The admin-facing service door for reading and writing per-locale translations on any translatable entity. It is fully generic: it resolves a target's declared fields and validation rules from the registry, validates a whole PUT/PATCH batch before any write, then applies the validated plan to the translations collection. It also writes the derived index column (fallback-locale content mirrored onto the entity document) in exactly one place so no caller can drift.

## Key elements

- **`EntityTranslationsResult`** — exported interface: the wire shape a controller returns for GET (entityType, entityId, `translations: Translation[]`, and the list of declared `fields`).
- **`entityNotFoundError(entityType, entityId)`** — exported 404 error-item factory shared with controllers so malformed IDs and genuinely missing IDs are indistinguishable to the caller.
- **`declaredFields(target)`** — extracts the ordered list of translatable field names from a target's `fieldRules.shape`.
- **`planSlot(entityType, target, fallbackLocale, locale, value)`** — validates one locale slot: rejects null-for-fallback, empty fields, unknown fields, and schema violations; returns a `PlannedWrite` (`upsert` or `delete`) or a 422 rejection. Looks up the `locales` collection for non-fallback tags to reject unknown locales.
- **`planTranslationWrites(entityType, payload)`** — batch-level pre-flight: canonicalises all locale keys (RFC 4647), iterates slots via `planSlot`, short-circuits on the first rejection. Returns the resolved `target`, `fallbackLocale`, and the full `PlannedWrite[]` alongside, or the rejection.
- **`writePlannedTranslations(entityType, entityId, fallbackLocale, planned, translatedBy, session?)`** — applies an already-validated plan: upserts or deletes rows via `translationRepository`, then writes the derived index column for the fallback locale. Does **not** invalidate cache or record audit; callers own those. Accepts a Mongoose session for transactional use.
- **`withCanonicalKeys(payload)`** — re-keys a locale map to canonical spelling via `canonicalLocale`.
- **`isRejection(value)`** — type-guard narrowing a `ResponseReject` out of a union.

## Relationships

- **`src/kernel/registry.ts` (`TranslatableTarget`)** — every validation and field check delegates to the target resolved here; the file never hard-codes entity types.
- **`src/kernel/translation.ts` (`TranslationBatch`, `TranslationWritePlan`, `TranslationWriteSlot`)** — the shared type contracts for batch shape and slot semantics that this file both consumes and produces.
- **`src/infrastructure/i18n/index.ts` → `locale-tag.ts`, `catalog.ts`, `context.ts`** — provides `canonicalLocale` (key normalisation), `getFallbackLocale`, and `t` (i18n message lookup for error strings).
- **`src/infrastructure/object-guards.ts`** — `stripUndefined` narrows zod-parsed output; `fillOmittedWithNull` normalises omitted fields.
- **`src/infrastructure/http/response.ts`** — all error/success response shapes (`generateReject`, `fieldError`, `generateSuccess`, `ResponseReject`, `ResponseSuccess`) come from here.
- **`src/infrastructure/adapters/cache.ts`** — `invalidateCacheTagsLogged` is imported for cache invalidation in the full write path.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is imported; paired with `localeAuditActions` from the sibling `audit.ts` for the audit trail the caller is expected to write.
- **`src/infrastructure/persistence/versioning.ts`** — `carryVersion` and `rearmPrecondition` are imported for optimistic-concurrency handling in the write/audit section.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps multi-write sequences (e.g. entity doc + translations) in a single MongoDB transaction.
- **`src/modules/locales/audit.ts`** — supplies the `localeAuditActions` map that `recordAudit` calls reference.
- **`src/modules/cart/tests/unit/merge-rule.test.ts`** — exercises merge rules that depend on the translation write path; not a direct import but an integration consumer.

## Notes

- **Two-phase contract (plan → write):** `planTranslationWrites` and `writePlannedTranslations` are intentionally separate so internal callers can validate inside their own transaction and skip this module's cache/audit duties. Calling `writePlannedTranslations` without a prior `planTranslationWrites` will silently corrupt data — there is no internal re-validation.
- **Fallback locale is special-cased twice:** it is never deletable, never deactivated, and its write never hits the `locales` collection (so the system still works if that collection is dropped).
- **Inactive locales are writable:** `planSlot` allows upserts for inactive languages by design (drafting), but read paths filter them out via `inactiveTags`.
- **The file never touches the entity's own collection** except through the single derived-index-column write performed in `writePlannedTranslations`; all other persistence goes through `translationRepository`.
- **`origin` defaults to `'human'`** only for internal callers that omit it; the PATCH wire contract always supplies it explicitly.
