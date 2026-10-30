---
source: src/modules/inventory/services/admin.ts
sha256: 9ea735bb2a62d579ecff431b1d1853b5d803798f0100627eb1ee23a27a379d9c
generated_at: 2026-10-29T04:02:52.385078+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/admin.ts

## Purpose

Operator-facing stock write operations: receiving a delivery, correcting stock after a stocktake, and setting the backorder allowance. It is the "back-office" counterpart to the customer-facing allocation path, ensuring every write is transactional, audited, and reflected in the catalogue cache.

## Key elements

- **`receive(productId, quantity, note, context)`** — exported. Records an incoming delivery (always positive quantity) and, in the same transaction, allocates the new units to the oldest paid preorders. Returns the updated `InventoryLevel` or a 404.
- **`adjust(productId, delta, note, context)`** — exported. Applies a signed stocktake correction. Refuses (409) if the result would drop below reserved units; otherwise returns the updated level or 404.
- **`setBackorderLimit(productId, backorderLimit, context?)`** — exported. Sets or clears the per-product backorder cap. Not a stock movement (no ledger row); audited via `auditChanges` diff.
- **`applyAdminStockTransition(config)`** — internal. Shared pipeline for `receive`/`adjust`: product existence check → apply transition (optionally with allocation) → failure branch → read-back → audit → response.
- **`receiveAndAllocate(reason, productId, quantity, note)`** — internal. Wraps `applyTransition` + `allocateWithin` inside a single `withTransaction`; after commit, nudges the outbox and refreshes the stock cache.
- **`levelFor(productId, title)`** — internal. Reads a product's level row and runs it through `presentInventoryLevel`; returns `null` if no row exists.
- **`AdminStockTransition`** — interface describing the per-operation parameters that differentiate `receive` from `adjust` (failure handler, allocation flag, audit metadata builder).

## Relationships

- **`services/transition.ts`** — calls `applyTransition` (core stock counter mutation) and `refreshStockCache` (catalogue sync).
- **`services/allocate.ts`** — calls `allocateWithin` to distribute newly-arriving units to waiting preorders within the same transaction.
- **`repository.ts`** — reads/writes `InventoryLevel` rows via `stockLevelRepository` (`findByProductId`, `setBackorderLimit`).
- **`audit.ts` (module-local)** — pulls `inventoryAuditActions` constants (`ADMIN_STOCK_RECEIVED`, `ADMIN_STOCK_ADJUSTED`, `ADMIN_BACKORDER_LIMIT_SET`) for audit records.
- **`presenter.ts`** — calls `presentInventoryLevel` to shape the domain level into the API response form.
- **`infrastructure/runtime/database.ts`** — wraps the receive+allocate pair in `withTransaction` for atomicity.
- **`infrastructure/observability/audit.ts`** — calls `recordAudit` after every successful write.
- **`infrastructure/observability/audit-changes.ts`** — calls `auditChanges` in `setBackorderLimit` to record a field-level diff.
- **`infrastructure/http/response.ts`** — builds `ResponseSuccess` / `ResponseReject` via `generateSuccess` / `generateReject`.
- **`infrastructure/i18n/index.ts`** — uses `t` for localized error messages.
- **`kernel/outbox.ts`** — calls `nudgeOutbox` post-commit to wake the outbox relay.
- **`modules/products/index.ts`** — calls `productService.findByIdRaw` for the pre-write existence check and for disambiguating 404 vs 409 in `adjust`'s failure path.

## Notes

- `adjust` with a **positive** delta also triggers allocation (`allocates: true`), matching the invariant that any increase in `available` must serve waiting paid preorders first.
- The `onFailure` callback on `adjust` re-reads the product to distinguish "product deleted between check and write" (404) from "correction would go below reserved" (409). `receive` omits this callback because its only guard is product existence.
- `setBackorderLimit` intentionally does **not** call `applyTransition` or write a ledger row — it is a configuration change, not a stock movement, and is audited with a field diff instead.
- The `context` parameter is required on `receive` and `adjust` (a stock write without an actor is untraceable) but optional on `setBackorderLimit` (tests omit it to skip the audit emit).
- Non-transactional side effects (`nudgeOutbox`, `refreshStockCache`) are deferred to **after** the transaction commit via the `.then` chain on `receiveAndAllocate`.
