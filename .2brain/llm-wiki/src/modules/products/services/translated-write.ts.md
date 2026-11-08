---
source: src/modules/products/services/translated-write.ts
sha256: 3f6ae1ac71e5928eb0d2ca916e93262ed39a9b9c7f270dc9564ef73624bb778d
generated_at: 2026-11-08T07:48:58.763625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/translated-write.ts

## Purpose

The multilingual write surface for products. Provides the two mutation doors — `create` and `updateById` — that persist a product row together with its per-locale translation rows in a single database transaction, guaranteeing that the fallback-locale title can never be changed without its translation row changing with it. Also exports `clearOmittedLocales`, the PUT-semantics preparer that turns a sparse body into the full locale set expected by `updateById`.

## Key elements

- **`create(data, context, imageExtras?)`** — Validates the translation batch via `planTranslations`, then inside one `withTransaction` inserts the product row, writes all translation rows, and returns a 201 via `finishCreate`.
- **`updateById(id, data, context, imageExtras?)`** — Plans translations (if any), then in one transaction performs the 404 check, row update, derived-column refresh, and translation upsert. Serves both PUT and PATCH because `clearOmittedLocales` normalises PUT before it reaches here.
- **`clearOmittedLocales(id, changes)`** — Reads all stored translation locales, marks any locale absent from the PUT body as `null`, and fills omitted `description` within stated locales with `null` (via `fillOmittedWithNull`). The fallback locale is always present (schema refinement).
- **`toUpsertTranslationsRequest`** *(internal)* — Converts the module's flat `{ title?, description? } | null` per-locale shape into the kernel's `TranslationBatch` (`{ fields, origin? }`). `origin` is intentionally omitted so the port defaults to `"human"`.
- **`prefixTranslationErrors`** *(internal)* — Rewrites error `details.field` from e.g. `"it"` to `"translations.it"` to match this module's nested request-body shape.
- **`TRANSLATED_FIELDS`** — `['description']`; the subset of translated fields (beyond the always-present `title`) that `fillOmittedWithNull` applies to.

## Relationships

- **`@kernel/translation`** — Consumes `planTranslations`, `isTranslationPlan`, `readAllTranslations`, `writeTranslations`, and the `TranslationBatch` type. This file is a product-specific caller of that generic translation port.
- **`./crud`** — Delegates the actual row insert/update and the post-commit side-effects (outbox, audit, image enqueue) to `insertProduct`, `updateByIdInTransaction`, `finishCreate`, and `finishUpdateById`.
- **`../model`** — Imports `zodProductCreateSchema`, `zodProductUpdateSchema` (used to type `data` and to derive `ProductDocument`); the schemas' refinements (fallback-locale presence, `null`-for-fallback rejection) are relied upon but not re-checked here.
- **`@infrastructure/runtime/database`** — Wraps every multi-write sequence in `withTransaction` so row + translations + derived column commit atomically.
- **`@infrastructure/http/response`** — Shapes every return value via `generateSuccess` / `ResponseReject` / `ResponseSuccess`.
- **`@infrastructure/i18n`** — Calls `getFallbackLocale()` to pick the locale whose title/description populate the derived index column.
- **`@infrastructure/object-guards`** — Uses `fillOmittedWithNull` inside `clearOmittedLocales` to materialise "stated but omitted" fields as explicit `null`.
- **`@types`** — Imports `CallerContext`, `ProductTranslationFieldsPatch`, and `ServerImageFields` for parameter/return typing.

## Notes

- **PUT vs PATCH sharing one path.** `clearOmittedLocales` runs *before* `updateById` for PUT, so by the time `updateById` sees `translations` every stored locale is explicitly present (value or `null`). PATCH skips `clearOmittedLocales` and sends only the locales being touched.
- **`imageExtras` is server-side only.** It is never part of the client contract; it is merged after validation and inside the transaction, the same ordering the controller uses.
- **`null` vs `undefined` for `imageUrl` on create.** The schema default applies to `undefined`; an explicit `null` means "no image." The code uses `imageExtras.imageUrl ?? undefined` to preserve that distinction.
- **No-description means absent, not empty.** The code omits the `description` key entirely rather than writing `''` when it is `undefined`.
- **Error-field prefixing.** This module's request body nests translations under `translations.*`, unlike the generic translation endpoint where the body is the batch itself. `prefixTranslationErrors` bridges the two shapes so 422 responses carry the correct pointer.
