---
source: src/modules/products/services/translated-write.ts
sha256: e5f84a15a9e613651eea0f650339588187bb7321dbaa252b9355cc74ec423e94
generated_at: 2026-10-15T11:46:04.884032+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/translated-write.ts

## Purpose

The multilingual write door for products: it persists a product row and its per-locale translation rows in a single database transaction, serving both the create and the PUT/PATCH update paths. It exists so that the product and its translations always commit or roll back atomically, and so that the derived (fallback-locale) column stays in sync without the caller managing it.

## Key elements

- **`writeCreate(data, context, imageExtras?)`** — Validates the translation batch via `planTranslations`, then inside one `withTransaction`: inserts the product (merging `imageExtras` and the fallback-locale title/description), writes all translation rows, and returns a `201` success via `finishCreate`.
- **`writeUpdate(id, data, context, imageExtras?)`** — Same pattern for PUT/PATCH. If a `translations` batch is present it plans and writes rows alongside the update; if the fallback locale is touched it also refreshes the derived `title`/`description` columns. Returns the `finishUpdateById` success or a rejection (e.g. 404) unchanged.
- **`clearOmittedLocales(id, changes)`** — PUT-only helper. Reads all stored translation locales, nulls any locale the body omits, and nulls any omitted `description` inside a stated locale (via `clearOmittedFields`). The fallback locale is guaranteed present by the schema and is never deleted.
- **`toUpsertTranslationsRequest(translations)`** — Adapter that reshapes this module's flat `{ title?, description? } | null` per-locale shape into the kernel's `TranslationBatch` (`{ fields, origin? }`), omitting `undefined` keys.
- **`prefixTranslationErrors(rejection)`** — Rewrites error `details.field` paths by prepending `translations.` so pointers reflect the nested body shape.
- **`ProductImageExtras`** — Server-derived image fields (`imageUrl`, `thumbnailUrl`, `pendingImageKey`) that join the write *after* schema validation; never part of the client contract body.
- **`TRANSLATED_FIELDS`** — `['description']`; the set of fields eligible for `clearOmittedFields` null-ing (title is the row's own key, not "translated" in the same sense).

## Relationships

- **`@kernel/translation`** — Core dependency: `planTranslations`, `isTranslationPlan`, `writeTranslations`, `readAllTranslations`, `clearOmittedFields`, and the `TranslationBatch` type all come from here. This file is a thin product-domain consumer of the generic translation port.
- **`@infrastructure/i18n`** — `getFallbackLocale()` supplies the canonical fallback locale key used to extract the derived-column values and to guard against its absence.
- **`../model`** (`src/modules/products/model.ts`) — Provides `zodProductCreateSchema`, `zodProductUpdateSchema` (used for type-level inference of `data`) and the `ProductDocument` return shape.
- **`./crud`** (`src/modules/products/services/crud.ts`) — `insertProduct`, `updateByIdInTransaction` perform the raw row writes; `finishCreate` / `finishUpdateById` handle post-commit side effects (outbox, audit, image enqueue) and shape the final response.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the product + translations writes in a single session.
- **`@infrastructure/http/response`** — `generateSuccess` and the `ResponseSuccess` / `ResponseReject` union types structure every return value.
- **`@types`** — `CallerContext`, `ProductTranslationFieldsPatch`, `ProductTranslationFieldsWrite` define the auth/translation field contracts.
- **`src/modules/products/services/index.ts`** — Re-exports this module so controllers import from the barrel.

## Notes

- **PUT ≡ PATCH here.** The controller calls `clearOmittedLocales` before invoking `writeUpdate` for PUT, so by the time `writeUpdate` runs, every omitted locale is already `null`. A single code path therefore serves both verbs.
- **`imageExtras` is post-validation.** It is merged into the insert/update payload *after* Zod validation passes. On create, `imageUrl: null` explicitly means "no image" (bypassing the schema's `undefined`-only default); on update it follows the same rule.
- **`origin` is always implicit.** `toUpsertTranslationsRequest` never sets `origin`; the kernel port defaults it to `'human'`. There is no machine-import path through this door.
- **Error paths are nested.** Because `translations` is a field *inside* the product body (unlike the generic translation endpoint where it *is* the body), `prefixTranslationErrors` rewrites every field pointer so clients see `translations.it.title`, not `it.title`.
- **`touch` flag.** In `writeUpdate`, `touch: plan !== undefined` is passed to `updateByIdInTransaction` to signal that the derived column must be refreshed even if no other mutable column changed.
- **Fallback locale is load-bearing.** Both `writeCreate` and `writeUpdate` index into `data.translations[getFallbackLocale()]` to populate the product row's `title`/`description`. The schema refinements guarantee its presence, but the code still uses a `as` cast in `writeCreate` — if the schema ever changes, that cast is the first thing to break.
