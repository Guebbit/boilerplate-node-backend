---
source: src/modules/products/services/remove.ts
sha256: d7fbaf6034e8e37f930bc61cf7517b0d617521a7fa13501f7280b004dbb9d391
generated_at: 2026-11-14T21:28:56.955314+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/remove.ts

## Purpose
Implements the product deletion and restore operations (soft delete, hard delete, and undo). It coordinates the write, the `PRODUCT_DELETED` outbox event, translation cleanup, image removal, and audit logging within a single transaction so that the event exists exactly when the delete commits.

## Key elements
- **`removeById(id, hardDelete?, context?)`** — Public entry point. Fetches the product by ID, then delegates to `remove`. Returns 404 if not found.
- **`restoreById(id, context?)`** — Undoes a soft delete by clearing `deletedAt`. Returns 404 if missing, 409 if the product was not soft-deleted. Announces no event (carts/wishlists that emptied stay emptied).
- **`remove(product, hardDelete?, context?)`** (internal) — Core logic. Hard delete: removes the row + translations in one transaction, then deletes the image file. Soft delete: stamps `deletedAt` once (idempotent—repeating is a no-op). Both paths publish `PRODUCT_DELETED` via the outbox and record an audit row.
- **`announceDeleted(product, hardDelete, write)`** (internal) — Reads the product's translated titles *before* the write (hard delete destroys them), then runs `write` and the outbox event in the same transaction.

## Relationships
- **`src/modules/products/repository.ts`** — `productRepository` performs the actual `deleteOne` / `save` / `findById` calls.
- **`src/kernel/outbox.ts`** — `announceInTransaction` writes the `PRODUCT_DELETED` event atomically with the data change; the relay retries delivery to subscribers.
- **`src/kernel/translation.ts`** — `removeTranslations` is called only on hard delete, inside the same transaction, to drop the product's rows in other languages.
- **`src/infrastructure/adapters/image-store.ts`** — The image adapter's `remove` method deletes the stored image file after a hard delete commits.
- **`src/modules/products/events.ts`** — Exports the `PRODUCT_DELETED` event name used in the outbox payload.
- **`src/modules/products/audit.ts`** — `productsAuditActions` supplies the audit action codes (`ADMIN_PRODUCT_DELETED`, `ADMIN_PRODUCT_RESTORED`).
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the audit log entry.
- **`src/infrastructure/i18n/index.ts`** — `t` provides localized error messages for "not found" and "not deleted".
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP responses returned to callers.
- **`src/modules/products/services/lookups.ts`** — `titlesOf` fetches the product's translated names before a hard delete erases them.
- **`src/modules/products/services/index.ts`** — Re-exports `removeById` and `restoreById` for consumers of the products service barrel.
- **`src/types/auth-context.ts`** — `CallerContext` type threaded through for audit attribution.

## Notes
- **Idempotency contract:** A second soft delete is a silent no-op (returns 200 with the existing doc). Undo is always `restoreById`, never a second DELETE.
- **Event disambiguation:** Both soft and hard deletes emit `PRODUCT_DELETED`; subscribers distinguish them via the `hardDelete` boolean on the payload. This is why translations are removed via the direct port call (`removeTranslations`) rather than by reacting to the event.
- **Image deletion is outside the transaction:** The image file is removed *after* the DB transaction commits. If that call fails, the row is already gone—the image is an orphan, not a data-integrity concern.
- **`context` is optional:** Omitting it means the caller has no request/session behind it (a system job, for instance); the audit call is still made but with no user attribution.
- **Restore does not re-announce:** Products that were on sale, off sale, or hidden at delete time come back exactly as they were; the cascade effects (emptied cart lines, cleared wishlists) are intentionally not reversed.
