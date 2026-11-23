---
source: src/modules/inventory/services/admin.ts
generated_at: 2026-11-22T05:21:18.304572+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/admin.ts

## Purpose
The operator's own stock writes: receiving a delivery, adjusting after a stocktake, and setting a product's backorder limit. Each write checks the product exists, changes stock, records an audit entry, and returns the fresh inventory level (or a rejected response).

## Key elements
- `receive(productId, quantity, note, context)`: units arrive from a supplier. It always allocates the new units to waiting paid preorders. Returns 404 if the product is unknown. Audited as `ADMIN_STOCK_RECEIVED`.
- `adjust(productId, delta, note, context)`: a signed stocktake correction. It allocates only when `delta > 0`. Returns 404 if the product is unknown, or 409 (`ERROR_CODES.INVENTORY_BELOW_RESERVED`) if the result would fall below the reserved units. Audited as `ADMIN_STOCK_ADJUSTED`.
- `setBackorderLimit(productId, backorderLimit, context?)`: sets the backorder allowance (`0` closes it, `null` removes the cap). It writes no ledger row. It diffs the old and new value with `auditChanges`, invalidates cached availability, and is audited as `ADMIN_BACKORDER_LIMIT_SET`.
- `applyAdminStockTransition` (internal): the shared body of `receive` and `adjust`. Flow:
  1. Check the product exists via `productService.findByIdRaw`.
  2. Apply the transition.
  3. On refusal, call the optional `onFailure` or default to 404.
  4. Re-read the level.
  5. `recordAudit`.
  6. Return 200.
- `receiveAndAllocate` (internal): runs `applyTransition` and `allocateWithin` in one `withTransaction`. After commit it calls `nudgeOutbox()` and `forgetAvailability`.
- `levelFor` (internal): reads the level via `stockLevelRepository.findByProductId` and presents it with `presentInventoryLevel`. Returns `null` if there is no level row.

## Relationships
- `../repository`: `stockLevelRepository` for reading levels and setting the backorder limit.
- `./transition`: `applyTransition` applies the signed stock movement.
- `./allocate`: `allocateWithin` allocates new units to waiting paid preorders inside the same transaction.
- `./availability`: `forgetAvailability` invalidates the cached availability after a write.
- `../presenter`: `presentInventoryLevel` shapes the returned level.
- `../audit`: `inventoryAuditActions` supplies the audit action names.
- `@infrastructure/observability/audit` and `audit-changes`: `recordAudit` emits audit events; `auditChanges` builds the before/after metadata for the backorder limit.
- `@infrastructure/runtime/database`: `withTransaction`.
- `@kernel/outbox`: `nudgeOutbox` wakes the outbox relay after commit.
- `src/modules/products/index.ts`: `productService.findByIdRaw` is the existence check, and supplies the title for presenting the level.
- `@infrastructure/http/response` and `@infrastructure/i18n`: `generateSuccess` / `generateReject` build responses, and `t` supplies the localized messages.

## Notes
- The product existence check runs before the write. For `receive`, the transition's condition matches any row or creates one, so an unknown product would otherwise get a level row and a ledger entry.
- `adjust`'s `onFailure` re-reads the product to tell a deletion (404) apart from a below-reserved refusal (409).
- Side effects that can't roll back (outbox nudge, availability invalidation) happen only after the transaction commits.
- `context` is required for `receive` and `adjust` but optional for `setBackorderLimit`. The doc comment says tests omit it to skip the audit emit.
- Lowering the backorder limit below the outstanding amount is allowed: existing orders stand and only new ones are refused.
