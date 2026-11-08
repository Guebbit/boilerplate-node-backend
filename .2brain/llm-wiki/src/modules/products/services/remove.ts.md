---
source: src/modules/products/services/remove.ts
sha256: 08a569fac00db56d6b7d9b6f3d22ea5ec96bf41d53e8819c7604c09bef03b685
generated_at: 2026-11-08T07:48:11.745609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/remove.ts

## Purpose

Implements soft delete, hard delete, and restore of a product. Coordinates the database write, side-effect cleanup (translations, image), event announcement, and audit logging into a single transactional unit, then returns an HTTP-shaped response object.

## Key elements

- **`announceDeleted`** (internal) – Runs a caller-supplied `write` and publishes a `PRODUCT_DELETED` outbox event in the same Mongoose transaction. Pre-fetches product titles (via `titlesOf`) so the event payload carries display names for subscribers.
- **`remove`** (exported) – Core delete logic. Hard path: deletes the row, removes translation rows, deletes the image file, records audit, returns `200` with `undefined`. Soft path: idempotent no-op if `deletedAt` already set; otherwise stamps `deletedAt` and saves. Both paths announce via the outbox.
- **`removeById`** (exported) – Convenience wrapper: fetches the document by ID, returns a localized 404 if missing, then delegates to `remove`.
- **`restoreById`** (exported) – Clears `deletedAt` on a soft-deleted product and saves. Returns 404 if the product doesn't exist, 409 (`PRODUCT_NOT_DELETED`) if it was never soft-deleted. Does **not** publish an event.

## Relationships

- **`repository.ts`** – All reads/writes go through `productRepository` (`findById`, `deleteOne`, `save`).
- **`outbox.ts`** – `announceInTransaction` wraps the write so the `PRODUCT_DELETED` event commits atomically with the delete.
- **`translation.ts`** – `removeTranslations` is called inside the hard-delete transaction to cascade translation rows.
- **`image-store.ts`** – `imageStore.remove` is called after the hard-delete transaction commits to delete the physical file.
- **`lookups.ts`** – `titlesOf` is called before the transaction to snapshot titles for the event payload (hard delete removes them from the DB).
- **`events.ts`** – Supplies the `PRODUCT_DELETED` event name used in the outbox entry.
- **`audit.ts` (products)** – Provides `productsAuditActions` enum values for audit records.
- **`audit.ts` (infrastructure)** – `recordAudit` writes the audit row after the operation succeeds.
- **`response.ts`** – `generateSuccess` / `generateReject` shape the returned response objects.
- **`i18n`** – `t()` localizes 404 / 409 error messages.
- **`types` (`CallerContext`)** – Optional request context forwarded to audit; omitted when no HTTP request is behind the call.
- **`services/index.ts`** – Re-exports this module's public API.

## Notes

- **Soft delete is idempotent.** If `deletedAt` is already set, `remove` returns immediately with the existing document—no write, no event, no audit. Re-issuing DELETE is safe by design.
- **Translation cleanup is transactional, not event-driven.** `removeTranslations` runs inside the same transaction as the hard-delete write. It is *not* triggered by a subscriber reacting to `PRODUCT_DELETED`; doing so would be too late (the rows would already be gone) and would couple the module to subscriber internals.
- **Subscribers distinguish soft vs hard via the `hardDelete` flag on the event payload.** The event fires for both paths; the flag is the only differentiator.
- **Restore is intentionally silent.** It clears `deletedAt` and saves. Downstream effects of the original delete (cart lines, wishlist entries) are not reversed.
- **The image file is removed *after* the transaction commits** (`.then(() => imageStore.remove(...))`), so a transaction rollback does not leave a dangling file deletion. Conversely, a crash between commit and `imageStore.remove` leaves an orphaned file—there is no compensating cleanup here.
- **The response does not wait for event delivery.** The outbox relay retries independently; this function resolves as soon as the local transaction commits.
