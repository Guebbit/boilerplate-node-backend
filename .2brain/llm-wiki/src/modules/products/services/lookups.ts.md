---
source: src/modules/products/services/lookups.ts
source_sha256: a283687c956194b8353b5b932f554a1f9add6dfd1b9200fda874af552430f9e7
context_sha256: 6c95d154315e77c1416130be9a3fab3e2bdb9bd0d24064a53457385fab89c78b
generated_at: 2026-11-22T07:13:13.099327+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/lookups.ts

## Purpose
Read and cache "doors" onto the products collection for sibling modules (`inventory`, `orders`, `cart`, `wishlist`, sitemap, event handlers). Other modules go through these service functions rather than touching the product collection or repository directly. The file also builds per-locale product names, with the product's own columns filling the fallback-language slot.

## Key elements
- `findByIdRaw(productId)`: plain, untransformed document, for modules that read a product's own columns.
- `findByIdRawScoped(productId, scope)`: same read, narrowed by the caller's scope (from `callerScope`). A hidden or removed product comes back `null` to a caller without `display:Product`.
- `isLive(productId)`: resolves to a boolean: whether the product exists and has no `deletedAt`. Used by late `product.deleted` handlers, since a retried delivery can arrive after a restore.
- `findPublicById(productId)`: publicly visible product or `null`, used by `cart` and `wishlist`.
- `findManyByIds(ids)`: batch read in one round trip. It returns every id, past the `findAll` default cap, and a malformed id rejects the promise.
- `countPublic(ids, { excludePreorders })`: counts how many ids are publicly visible, using `productRepository.publicScope()`. It returns 0 for an empty list without querying. With `excludePreorders`, it adds a `$nor` filter on `releaseDate > now` and `purchasable != false`. It serves the inventory low-stock gauge.
- `translationsWithFallback(product)`: all locales (drafts included) for the admin editor, locale → `{ title, description? }`.
- `titlesOf(product)`: locale → title for only the locales the shop serves, plus the fallback. A draft language's title is never included.
- `titlesById(productId)`: `titlesOf` by id. It works for soft-deleted products and returns `{}` if there is no such product.
- `listPublicPage(page, pageSize)`: one sitemap page (1-based) of `ListedProduct` (id and last-change date), in a stable order.
- `countListed()`: number of products in the public catalogue.
- `withFallbackRow` (private): copies the translation rows. It fills the fallback locale from the product's `title`/`description` if no row exists for it.

## Relationships
- `../repository` (`productRepository`, `ListedProduct`): every read and count goes through it (`findByIdRaw`, `findByIdRawScoped`, `findPublicById`, `findByIds`, `findById`, `count`, `publicScope`, `listedPage`).
- `@infrastructure/persistence/create-repository`: `toObjectId` converts ids in `countPublic`.
- `@kernel/translation`: `readAllTranslations` (drafts included) and `readServedTranslations` (served locales only) supply translation rows.
- `@infrastructure/i18n`: `getFallbackLocale()` picks the slot filled from the product's own columns.
- `../model` (`ProductDocument`) and `@types` (`ProductTranslationFields`): type-only imports.
- Neighbors such as `read.ts` and `remove.ts` sit in the same service layer. This file's content does not show how they use it.

## Notes
- `description` is checked with `'description' in fields` rather than `=== undefined`, because `TranslationFields` is typed `Record<string, string>` but a row can omit the key.
- `titlesOf` accepts either a hydrated or a lean document (`_id`, `title`, `description`).
- `titlesOf` exists so a message can copy product names in and never look the product up again. It only copies served-locale titles, so a draft title cannot leak into an inbox, stream, export or mail.
- `countPublic` wraps the query in `Promise.resolve().then(...)`, so a malformed id rejects the promise rather than throwing synchronously.
