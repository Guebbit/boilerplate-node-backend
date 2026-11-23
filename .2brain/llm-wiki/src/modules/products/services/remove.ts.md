---
source: src/modules/products/services/remove.ts
source_sha256: b9bbddef28e8bca166c7e05bc85c1004504b24fd3260306180e5f503905f5c89
context_sha256: 78ad29f351ac26c9b60e9b2c22bbdd9fb5c86b84886db66386da3bfad8f564b9
generated_at: 2026-11-22T07:13:41.674849+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/remove.ts

## Purpose
Implements soft delete, hard delete, and restore for products. Each operation announces its effect through the transactional outbox, so the event exists exactly when the write committed. The module does not know who subscribes (cart and wishlist are mentioned as examples), which keeps the dependency one-way.

## Key elements
- **`removeById(id, hardDelete = false, context?)`** (exported): loads the product via `productRepository.findById`. Returns a 404 reject (`products.not-found`) if it is missing, otherwise delegates to `remove`.
- **`restoreById(id, context?)`** (exported): clears `deletedAt` and saves the product.
  - Returns 404 if the product is missing, and 409 with `ERROR_CODES.PRODUCT_NOT_DELETED` if it is not soft-deleted.
  - It announces `PRODUCT_TERMS_CHANGED` in the same transaction, because `inventory` may still hold an answer that says the product cannot be ordered.
  - It records the `ADMIN_PRODUCT_RESTORED` audit entry.
- **`remove(product, hardDelete, context?)`** (internal): does the actual delete.
  - **Hard delete:** inside one transaction it runs `productRepository.deleteOne` and then `removeTranslations('product', id, session)`. After commit it calls `imageStore.remove(product.imageUrl)`, records the audit entry and returns `generateSuccess(undefined, 200)`.
  - **Soft delete:** if `deletedAt` is already set, it returns success without doing anything, so repeating DELETE is safe. Otherwise it sets `deletedAt = new Date()`, saves in a transaction and returns the saved document.
  - Both paths record `ADMIN_PRODUCT_DELETED` with `metadata: { hardDelete }`.
- **`announceDeleted(product, hardDelete, write)`** (internal): reads the titles with `titlesOf`, then calls `announceInTransaction`. The `PRODUCT_DELETED` event payload is `{ productId, hardDelete, titles }`.

## Relationships
- **`../repository`** (`productRepository`): `findById`, `save` and `deleteOne`, with the session passed in.
- **`@kernel/outbox`** (`announceInTransaction`): runs the write and enqueues the event atomically.
- **`../events`**: supplies `PRODUCT_DELETED` and `PRODUCT_TERMS_CHANGED`.
- **`./lookups`** (`titlesOf`): reads the product's titles before the write.
- **`@kernel/translation`** (`removeTranslations`): deletes translation rows on hard delete.
- **`@infrastructure/adapters/image-store`**: deletes the image file on hard delete.
- **`@infrastructure/observability/audit`** and **`../audit`**: `recordAudit` plus the `productsAuditActions` constants.
- **`@infrastructure/http/response`**: `generateSuccess` and `generateReject`, which build the return values.
- **`@infrastructure/i18n`**: `t(...)` for the error messages.
- **`../model`** (`ProductDocument`) and **`@types`** (`CallerContext`): types.
- **`@api/error-codes`**: `ERROR_CODES`.

## Notes
- Titles are read before the write because a hard delete removes the other languages' translation rows, and the event must still carry the names subscribers print.
- Translations are removed directly through the port, not through the `PRODUCT_DELETED` event. That event also fires on soft delete, and soft-deleted products can be restored, so their translations and counters must survive. Subscribers use `hardDelete` on the payload to tell the two cases apart.
- On hard delete, the image removal and the audit entry run after the transaction commits, so they are not covered by it.
- Restore only clears `deletedAt`. The product returns in its prior state (on sale, off sale or hidden). Side effects of the delete, such as emptied carts and wishlists, are not undone.
- `context` is optional. `recordAudit` is called with it as-is, and the doc comments say to omit it for callers with no request behind them.
- The response does not wait for the downstream cascade, which is handled by the outbox relay with retries.
