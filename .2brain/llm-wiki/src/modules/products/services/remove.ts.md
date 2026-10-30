---
source: src/modules/products/services/remove.ts
sha256: 08a569fac00db56d6b7d9b6f3d22ea5ec96bf41d53e8819c7604c09bef03b685
generated_at: 2026-10-29T05:29:46.720693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/remove.ts

## Purpose

Service layer for product deletion and restoration. Provides soft delete (stamp `deletedAt`), hard delete (destroy row + translations + image file), and restore (clear `deletedAt`). Each mutating operation emits a `PRODUCT_DELETED` outbox event atomically with the write, so subscribers (cart, wishlist) are notified exactly when the delete commits.

## Key elements

- **`remove(product, hardDelete?, context?)`** — Core delete. Hard path: `productRepository.deleteOne` → `removeTranslations` → `imageStore.remove`, all in one transaction with the outbox announcement. Soft path: stamps `deletedAt` and saves; idempotent if already deleted (returns 200, no re-announce).
- **`removeById(id, hardDelete?, context?)`** — Fetches the document by ID then delegates to `remove`. Returns 404 if not found.
- **`restoreById(id, context?)`** — Clears `deletedAt` on a soft-deleted product and saves. Does **not** announce any event; the downstream cascade (cart/wishlist line removal) is intentionally not reversed. Returns 404 (not found) or 409 (not soft-deleted).
- **`announceDeleted(product, hardDelete, write)`** (internal) — Reads localized titles via `titlesOf`, then runs `write` and the `PRODUCT_DELETED` outbox entry in a single transaction so the event exists iff the write committed.

## Relationships

- **`src/modules/products/repository.ts`** — `productRepository` provides `findById`, `deleteOne`, `save` (all accept a Mongoose session for transactional writes).
- **`src/modules/products/model.ts`** — `ProductDocument` is the domain type operated on by every function here.
- **`src/modules/products/events.ts`** — `PRODUCT_DELETED` constant names the outbox event announced on both soft and hard deletes.
- **`src/modules/products/audit.ts`** — `productsAuditActions` supplies the audit action constants (`ADMIN_PRODUCT_DELETED`, `ADMIN_PRODUCT_RESTORED`).
- **`src/modules/products/services/lookups.ts`** — `titlesOf` is called before deletion to capture localized titles for the event payload (a hard delete destroys the translation rows).
- **`src/kernel/outbox.ts`** — `announceInTransaction` writes the event and the domain write in one transaction.
- **`src/kernel/translation.ts`** — `removeTranslations` is called during hard delete to purge i18n rows in the same session.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` deletes the product's image file after a hard delete commits.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP responses.
- **`src/infrastructure/i18n/index.ts`** — `t` provides localized error messages for 404/409 responses.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the audit log entry.
- **`src/types/auth-context.ts`** — `CallerContext` type carried for audit attribution (may be omitted for non-request callers).
- **`src/modules/products/services/index.ts`** — Barrel re-export of `remove`, `removeById`, `restoreById`.

## Notes

- **Soft delete is idempotent.** A second `remove` call on an already-soft-deleted product returns 200 without re-announcing the event. DELETE is safe to retry; undo is explicitly `restoreById`'s job.
- **`hardDelete` flag on the event payload** is the only signal subscribers use to distinguish soft from hard delete. Hard delete also removes translations and the image file; soft delete preserves both so a restore can recover the product intact.
- **Restore announces nothing.** The cart/wishlist line removal triggered by the original delete is not rolled back.
- **Response is synchronous to the write, not to the cascade.** The HTTP 200 returns once the transaction commits; subscribers process the outbox event independently via relay retry.
- **Translations are removed through the port (`removeTranslations`), not via the event.** A subscriber must not be expected to clean up i18n rows.
