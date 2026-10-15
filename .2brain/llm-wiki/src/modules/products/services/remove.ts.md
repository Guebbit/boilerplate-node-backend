---
source: src/modules/products/services/remove.ts
sha256: fb9deedd1bfb22b23c4fea6d5a4f77920dc9a2436d056256c6f9fe0b0478d728
generated_at: 2026-10-15T11:45:15.958677+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/remove.ts

## Purpose
Service layer for deleting and restoring products. Owns the three write paths (soft delete, hard delete, restore) and their side-effects: transactional event announcement, translation cleanup, image file removal, and audit logging.

## Key elements

- **`remove(product, hardDelete?, context?)`** — Performs a soft or hard delete on an already-fetched `ProductDocument`. Hard delete removes the row, translations, and image file; soft delete stamps `deletedAt` (idempotent — a second call is a no-op). Returns a localized `ResponseSuccess`/`ResponseReject`.
- **`removeById(id, hardDelete?, context?)`** — Fetches the product by ID, then delegates to `remove`. Returns 404 if not found.
- **`restoreById(id, context?)`** — Undoes a soft delete by clearing `deletedAt` and saving. Returns 404 if absent, 409 if not soft-deleted. Does **not** announce any event.
- **`announceDeleted(product, hardDelete, write)`** *(internal)* — Runs the given write and a `PRODUCT_DELETED` outbox event inside the same Mongoose transaction. Reads titles via `titlesOf` first so the event payload carries the names for downstream messages.

## Relationships

- **`repository.ts`** — Uses `productRepository.deleteOne`, `.save`, and `.findById` for all DB I/O.
- **`kernel/outbox.ts`** — `announceInTransaction` writes the `PRODUCT_DELETED` event atomically with the delete; the relay handles delivery/retries.
- **`kernel/translation.ts`** — `removeTranslations('product', id, session)` called inside the hard-delete transaction to drop other-language rows.
- **`adapters/image-store.ts`** — `imageStore.remove(product.imageUrl)` called after the hard-delete transaction commits (sequential, not in-transaction).
- **`observability/audit.ts`** — `recordAudit` writes an audit row on both delete and restore.
- **`products/audit.ts`** — Provides `productsAuditActions.ADMIN_PRODUCT_DELETED` / `ADMIN_PRODUCT_RESTORED` action constants.
- **`products/events.ts`** — Supplies the `PRODUCT_DELETED` event name.
- **`products/services/lookups.ts`** — `titlesOf(product)` reads localized titles before the row is gone.
- **`http/response.ts`** — `generateSuccess` / `generateReject` shape every return value.
- **`i18n/index.ts`** — `t()` localizes the user-facing response message.
- **`types/index.ts`** — `CallerContext` type for optional audit attribution.
- **`services/index.ts`** — Re-exports the public functions from this module.

## Notes

- **Soft delete is idempotent**: if `product.deletedAt` is already set, the function returns success immediately without re-announcing the event. Undoing a delete is `restoreById`'s job, never a second DELETE.
- **Translation removal is in-transaction, not event-driven**: it runs only on hard delete, inside the same session. Subscribers must not rely on the `PRODUCT_DELETED` event for translation cleanup — the `hardDelete` boolean in the payload is their signal to distinguish soft from hard.
- **Restore announces nothing**: the comment makes explicit that downstream effects (cart/wishlist line removals) are not reversed; a restore only puts the product back on sale.
- **Image removal is fire-and-forget after commit**: it sits in a `.then()` chain outside the transaction, so a failure there does not roll back the DB write.
- **The module is a leaf for consumers**: it does not import or reference any subscriber (cart, wishlist, inventory). The dependency arrow stays one-way via the outbox.
