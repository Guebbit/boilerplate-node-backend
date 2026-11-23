---
source: src/modules/products/services/translated-write.ts
source_sha256: 78168cd8471ace1d43b873927f21fba6c49cf23e162f73cf971948665b32cd0d
context_sha256: 7bdf112f8c0869e40c998427ee7f6a1decd1ccb66b063401c7fdcfdd53574c32
generated_at: 2026-11-22T07:14:26.427894+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/translated-write.ts

## Purpose
Defines the product module's write operations, `create` and `updateById`. Each writes a product row and its translation rows in one transaction. No function writes the product row alone, so a title can't change without the fallback-locale translation changing too. It also provides `clearOmittedLocales`, which gives PUT its replace-the-whole-set semantics.

## Key elements
- `create(data, context, imageExtras?)`: plans the translations batch first, so a bad batch opens no transaction. It then runs `insertProduct` and `writeTranslations` inside `withTransaction`. The fallback-locale entry's `title` and `description` are copied onto the product row (the derived column). Afterwards it calls `finishCreate` and returns `generateSuccess(..., 201)`.
- `updateById(id, data, context, imageExtras?)`: splits `translations` from the other fields and plans the translations if present. Inside one transaction it runs `updateByIdInTransaction`, then `writeTranslations` only if the outcome has `updated`. If the fallback locale is upserted, its title and description go onto the row. `touch` is set when a plan exists. Afterwards it calls `finishUpdateById`. Otherwise it returns the not-found/reject outcome as is.
- `clearOmittedLocales(id, changes)`: for PUT. It reads the stored translations with `readAllTranslations`. A stated locale has its omitted `description` filled with `null` (via `fillOmittedWithNull` and `TRANSLATED_FIELDS = ['description']`). Every stored locale missing from the body becomes `null`, meaning delete.
- `toUpsertTranslationsRequest` (private): converts the module's flat `{ title, description? } | null` per-locale shape into the kernel's `TranslationBatch` (`{ fields }`). It leaves `origin` to the port's default, `human`.
- `prefixTranslationErrors` (private): rewrites the `details.field` of plan rejections to `translations.<field>`, because `translations` is a nested field in this module's body.

## Relationships
- `@kernel/translation` supplies `planTranslations`, `isTranslationPlan`, `writeTranslations`, `readAllTranslations` and the `TranslationBatch` type. The `'product'` resource key is passed to each.
- `./crud` supplies `insertProduct`, `updateByIdInTransaction`, `finishCreate` and `finishUpdateById`. This file composes them with the translation writes.
- `@infrastructure/runtime/database` provides `withTransaction`, which supplies the session used by both the row writes and the translation writes.
- `@infrastructure/i18n` provides `getFallbackLocale()` to pick the locale mirrored onto the product row.
- `@infrastructure/http/response` provides `generateSuccess`, `ResponseSuccess` and `ResponseReject`.
- `@infrastructure/object-guards` provides `fillOmittedWithNull`.
- `../model` provides `zodProductCreateSchema`, `zodProductUpdateSchema` and the `ProductDocument` type.
- `@types` provides `CallerContext`, `ServerImageFields` and `ProductTranslationFieldsPatch`.

## Notes
- Validation happens before this file runs. The create schema refuses a missing or `null` fallback locale, and the update schema refuses `null` for it. The code relies on this and reads `data.translations[getFallbackLocale()]` without a check.
- `imageExtras` is server-derived and is merged only after validation. On create, `imageUrl: imageExtras.imageUrl ?? undefined` makes `null` mean "no image" so the schema default can apply.
- A missing description is stored as no field, never `''`.
- `clearOmittedLocales` must run before `updateById` so a PUT arrives with every omitted locale already `null`. That way `updateById` serves both PUT and PATCH.
- Post-transaction steps (relay wake-up, audit, image enqueue, old-image delete) live in the `finish*` helpers. The doc comment says each catches its own failure.
