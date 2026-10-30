---
source: src/modules/products/services/translated-write.ts
sha256: 3f6ae1ac71e5928eb0d2ca916e93262ed39a9b9c7f270dc9564ef73624bb778d
generated_at: 2026-10-29T05:30:32.183246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/translated-write.ts

## Purpose

Implements the two write operations (`create`, `updateById`) for multilingual products. Each call writes the product row and all its translation rows inside a single database transaction, guaranteeing that the derived fallback-locale title/description columns always stay in sync with the translation rows. A third export, `clearOmittedLocales`, normalizes a PUT body so every stored locale is explicitly addressed before `updateById` runs.

## Key elements

- **`create`** – Validates the translation plan (no DB write yet), then inside `withTransaction` calls `insertProduct` → `writeTranslations`. Post-commit side effects (relay, audit, image queue) are delegated to `finishCreate`. Returns `201` on success.
- **`updateById`** – Plans translations only if the body carries a `translations` key. Inside `withTransaction` calls `updateByIdInTransaction` (which handles the 404 check and row update) and, when the row was actually updated and a plan exists, `writeTranslations`. Delegates post-commit cleanup to `finishUpdateById`. Serves both PUT and PATCH (PUT is pre-normalized by `clearOmittedLocales`).
- **`clearOmittedLocales`** – Reads all stored translation locales for a product, then fills the `translations` map so that (a) omitted locales become `null` (delete signal) and (a) stated locales get `description: null` when the field is absent. Returns the widened `changes` object.
- **`toUpsertTranslationsRequest`** *(internal)* – Converts the module's flat `{ title?, description? } | null` per-locale shape into the kernel's `TranslationBatch` (`{ fields, origin? }` per locale).
- **`prefixTranslationErrors`** *(internal)* – Rewrites error field pointers from `it.title` to `translations.it.title` so rejections align with this module's nested body shape.
- **`TRANSLATED_FIELDS`** – `['description']`; passed to `fillOmittedWithNull` so only `description` is treated as a clearable field (title is the row's own column, not a "translated" field).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/translation.ts` | Core port: `planTranslations`, `isTranslationPlan`, `writeTranslations`, `readAllTranslations`, `TranslationBatch` type. All translation I/O flows through this module. |
| `src/modules/products/services/crud.ts` | `insertProduct`, `updateByIdInTransaction` perform the raw row writes; `finishCreate` / `finishUpdateById` run post-commit side effects (outbox, audit, image queue). |
| `src/modules/products/model.ts` | Zod schemas (`zodProductCreateSchema`, `zodProductUpdateSchema`) gate what reaches these functions; `ProductDocument` is the return shape. |
| `src/infrastructure/runtime/database.ts` | `withTransaction` wraps the row + translation writes into one atomic unit. |
| `src/infrastructure/http/response.ts` | `generateSuccess` builds the 201 envelope; `ResponseReject` / `ResponseSuccess` are the union return types. |
| `src/infrastructure/i18n/index.ts` (→ `catalog.ts`) | `getFallbackLocale()` identifies which locale's entry feeds the derived columns. |
| `src/infrastructure/object-guards.ts` | `fillOmittedWithNull` powers the PUT "omitted = null" semantics in `clearOmittedLocales`. |
| `src/types/index.ts` (→ `auth-context.ts`, `server-image.ts`) | `CallerContext`, `ProductTranslationFieldsPatch`, `ServerImageFields` type the function parameters. |
| `src/modules/products/services/index.ts` | Re-exports this module's public API to the rest of the product service layer. |

## Notes

- **PUT vs PATCH unification.** `updateById` is a single code path. The controller calls `clearOmittedLocales` *before* invoking it for PUT, so omitted locales arrive as explicit `null`. PATCH skips that step and sends only the changed locales.
- **`imageExtras` is server-derived.** It is never part of the client contract; it is merged in only after Zod validation has passed, keeping the schema surface clean.
- **Derived columns.** The product row's `title` and `description` columns mirror the *fallback locale's* translation. On create they come from `fallbackEntry`; on update only if the fallback locale entry is present in the body. `touch: plan !== undefined` signals `updateByIdInTransaction` to refresh the derived column even when no translation rows changed.
- **Error-pointer nesting.** Because this module nests translations under a `translations` key (unlike the generic kernel door), `prefixTranslationErrors` rewrites field pointers so the 422 body matches the request shape.
- **No standalone row write exists.** There is intentionally no public function that writes only the product row without its translations; the "door" is always the paired operation.
