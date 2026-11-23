---
source: src/modules/inventory/audit.ts
source_sha256: 2053a71f8c72203ae5ad97734d3bf9071c9f55fff5468e82c882809f0b6d7754
context_sha256: c07e0b06e60ebcfa488d408db807ec4f22e15752df2cf31beecc90e39e1e64bb
generated_at: 2026-11-22T05:16:00.157395+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/audit.ts

## Purpose
Declares the audit actions owned by the inventory module and registers them into the app-wide audit type system via module augmentation, rather than a shared enum (rationale is in `src/modules/account/audit.ts`). Only five actions live here: lifecycle transitions (reserve, commit, release, expire) are audited by their callers (checkout, payment, cancellation), which already leave a ledger row naming the order. The exception is `commitForOrder` finding no hold to claim, which is this module's own invariant failing, so it is audited here.

## Key elements
- `inventoryAuditActions`: `as const` object of the action strings:
  - `ADMIN_STOCK_RECEIVED` → `admin.stock.received`
  - `ADMIN_STOCK_ADJUSTED` → `admin.stock.adjusted`
  - `ADMIN_RESERVATIONS_SWEPT` → `admin.reservations.swept`
  - `ADMIN_COMMIT_ORPHANED` → `admin.commit.orphaned`
  - `ADMIN_BACKORDER_LIMIT_SET` → `admin.backorder.limit.set`
- `declare module '@infrastructure/observability/audit'`: augments `AuditActionMap` with an `inventory` key whose type is the union of the values above.

## Relationships
The file's own content shows no imports or direct calls to its neighbors. Based on the action names, `src/modules/inventory/services/admin.ts`, `src/modules/inventory/services/holds.ts` and `src/modules/inventory/services/sweep.ts` are the likely emitters (stock receipt/adjustment, orphaned commits, sweeps), and `src/modules/inventory/tests/integration/preorder.test.ts` and `src/modules/inventory/tests/integration/service.test.ts` likely exercise them. These are inferences from the names, not visible in this file.

## Notes
- Adding an action means adding it to `inventoryAuditActions`. The `AuditActionMap` union picks it up automatically from the object's values.
- Despite the `ADMIN_` prefix on every key, `ADMIN_COMMIT_ORPHANED` is the system-invariant case described above (no hold found in `commitForOrder`), not an admin-initiated action.
- The file's doc comment points to a pipeline section of the inventory module docs (`#the-pipeline`).
