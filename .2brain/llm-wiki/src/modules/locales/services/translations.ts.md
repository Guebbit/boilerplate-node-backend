---
source: src/modules/locales/services/translations.ts
source_sha256: f4c414c89002dad73afd36115d55bff92a405513d4f85d64a167330effad1778
context_sha256: c93a0753ebcbfa4edc3d08e612705e79e69c9257a2b796446348903cde68ecd3
generated_at: 2026-11-22T05:48:56.514838+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/translations.ts

## Purpose
The "translator's door" of the locales module. It reads every locale's translations for an entity and writes PUT/PATCH payloads into them. It is generic over whatever the `translatables` registry declares. It never touches an entity's own collection, except for the derived index-column write that the registry names.

## Key elements
- **`EntityTranslationsResult`**: the wire-shaped admin result for GET/PUT/PATCH. It holds `entityType`, `entityId`, `translations`, and `fields`, which lists every field the registry declares for that type. `translations` is already normalized, so controllers don't call `.toJSON()` on it.
- **`entityNotFoundError(entityType, entityId)`** (exported): builds the 404 `LOCALE_ENTITY_NOT_FOUND` error item. Controllers answer a malformed id with the same item.
- **`declaredFields`**: the keys of a target's `fieldRules.shape`.
- **`entityTypeUnknown` / `entityNotFound`**: 404 rejections.
- **`slotRejection`**: builds the 422 field-error rejection shared by every `planSlot` refusal.
- **`PlannedWrite`**: a validated slot, either an `upsert` (fields plus origin) or a `delete`.
- **`planSlot`**: validates one locale slot.
  - A `null` value means delete. Deleting the fallback locale is rejected.
  - The fields must be non-empty and declared.
  - Values are parsed with the entity's `fieldRules`, so values are trimmed and the entity's own rules apply.
  - `origin` defaults to `'human'`.
  - Non-fallback locales must exist in the `locales` collection via `localeRepository.findByTag`. Inactive languages are allowed, because that is where drafts live.
- **`isRejection`**: a type guard for `ResponseReject`.
- **`withCanonicalKeys`**: canonicalizes locale keys (`EN` becomes `en`, `pt-br` becomes `pt-BR`).
- **`planTranslationWrites`**: the pre-flight validation of a whole batch, with no entity id.
  - It resolves the target through `translatableTarget` and returns `{ target, fallbackLocale, planned }`, or the first rejection.
  - It works for entities that don't exist yet, such as one being created in the same request.
- **`writePlannedTranslations`**: applies an already-validated plan.
  - It reads the fallback row and derives a source digest with `deriveSourceDigest`.
  - It then runs `removeEntityLocale` or `upsertEntityLocale` per slot. The digest is passed only for non-fallback upserts, and `translatedBy` is passed through.
  - It accepts an optional `ClientSession`.
  - It also handles the derived index-column write for the fallback locale, in the part of the file past the shown content.
- The remainder of the file, including `updateEntityTranslations`, is not visible here. The file's own comments describe `updateEntityTranslations` as the generic door's caller.

## Relationships
- **`../repository`**: `localeRepository`, `translationRepository` and `deriveSourceDigest` do the actual persistence and digest work.
- **`./translatables`**: `translatableTarget` resolves a registry entry. The `TranslatableTarget` type comes from `@kernel/registry`.
- **`@kernel/translation`**: supplies the `TranslationBatch`, `TranslationWritePlan` and `TranslationWriteSlot` types. The file's comments say fallback-language content still works when `locales` is uninstalled.
- **`@infrastructure/i18n`**: `canonicalLocale`, `getFallbackLocale` and `t` for message translation.
- **`@infrastructure/http/response`**: `generateReject`, `generateSuccess` and `fieldError` build responses.
- **`@infrastructure/object-guards`**: `stripUndefined` and `fillOmittedWithNull`.
- **`@infrastructure/adapters/cache`**: `invalidateCacheTagsLogged`.
- **`@infrastructure/persistence/versioning`**: `carryVersion` and `rearmPrecondition`.
- **`@infrastructure/runtime/database`**: `withTransaction`.
- **`@infrastructure/observability/audit`** and **`../audit`**: `recordAudit` and `localeAuditActions`.
- The cache, versioning, transaction and audit imports are not exercised in the visible portion.

## Notes
- `planTranslationWrites` and `writePlannedTranslations` are deliberately split. `writePlannedTranslations` never validates, so skipping the plan step first can corrupt data.
- The whole batch is validated before anything is written, so a rejected slot leaves no partial edit.
- The fallback locale skips the `locales` collection lookup. It can't be deleted or deactivated.
- The derived index column write is centralized in `writePlannedTranslations` so every caller behaves the same way. `title` and `description` on the entity's own document must reflect the fallback-locale row.
- `writePlannedTranslations` does not touch the cache tag or audit trail. Callers with their own document (for example a product create or update, per the file's comments) own both.
- Validation failures use HTTP 422. Unknown entity types and missing entities use 404.
