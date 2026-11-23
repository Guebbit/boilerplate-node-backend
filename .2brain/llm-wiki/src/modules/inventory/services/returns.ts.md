---
source: src/modules/inventory/services/returns.ts
source_sha256: 0ce90058189152de6e4017d7758e0a66eed3d8de350703d4444b39cef3e30913
context_sha256: 5176682522f30c2f83cffa80fa2ca6f8c434f60b84150287248a3782f8d65292
generated_at: 2026-11-22T05:23:29.847974+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/returns.ts

## Purpose
Puts returned goods (units a customer sent back and staff received) back into stock, inside a transaction owned by the caller. It writes one `restock` ledger movement per line, then runs backorder allocation so waiting buyers are served from the newly sellable units.

## Key elements
- `restockReturnedLines(lines, context, session)` — the only export. It takes the following arguments:
  - `lines`: `{ productId, quantity }[]`, the goods that came back.
  - `context`: `reference` names the order and `note` names the return.
  - `session`: the caller's mongoose `ClientSession`.

  It returns `Promise<void>`. It first calls `applyToEveryLine` with `StockMovementReason.restock`. It then calls `allocateWithin` with the product IDs of the lines. It throws if any line's counters refuse the restock.

## Relationships
- `src/modules/inventory/services/transition.ts` — supplies `applyToEveryLine`, which writes the per-line `restock` movements. The `session` parameter's contract is documented by reference to `forgetAvailability` in this module.
- `src/modules/inventory/services/allocate.ts` — supplies `allocateWithin`, which allocates the restocked products to backorders after the movements are written.
- `src/types/index.ts` — supplies the `StockMovementReason` enum (`restock` is used here).
- `src/modules/inventory/services/index.ts` — a graph neighbor of this file; the file content shows no direct interaction with it.

## Notes
- It claims no reservation. The order's hold stays `shipped`. At-most-once behavior comes from the return's own `approved → received` transition, so the caller must run that transition and this function in the same transaction.
- A refused line throws. Atomicity relies on the caller's transaction, because a half-restocked return is considered worse than none.
- The `backorder_allocated` rows that allocation may write are announced by the caller, in the same session, together with its own nudge. This function does not announce anything itself.
