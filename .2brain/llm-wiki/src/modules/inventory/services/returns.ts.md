---
source: src/modules/inventory/services/returns.ts
sha256: 25cfd745185e11759d9f9f3eaf454adc95acb7b7c6bfea0aa6120c82ef8cbf61
generated_at: 2026-10-29T04:04:31.344554+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/returns.ts

## Purpose

Single-purpose module for restocking returned goods into the inventory ledger. It writes one `restock` movement per returned line and then releases those units to backordered customers, all inside a caller-supplied Mongoose transaction.

## Key elements

- **`restockReturnedLines(lines, context, session)`** — the sole export. Creates a `restock` stock-movement for every returned line (referencing the original order via `context.reference` and the return via `context.note`), then immediately calls `allocateWithin` on the affected product IDs so backordered orders can claim the newly sellable units. Returns `Promise<void>`.

## Relationships

- **`./transition`** — imports `applyToEveryLine`, the shared helper that writes one ledger movement per line and throws on the first counter rejection. `returns.ts` passes `StockMovementReason.restock` as the reason.
- **`./allocate`** — imports `allocateWithin`, invoked *after* the restock movements commit so that backordered orders (previously starved of sellable stock) are re-evaluated within the same transaction.
- **`@types`** — imports `StockMovementReason` (specifically the `.restock` member) for the ledger entry.
- **`./index.ts`** — barrel re-export; consumers import `restockReturnedLines` from the services index rather than this path directly.

## Notes

- **Caller owns the transaction and the state transition.** This function does *not* mark the return as `received`; the caller performs `approved → received` in the same `ClientSession`. That once-only transition is what makes the restock idempotent-at-most-once.
- **No reservation is claimed.** The order's original hold already moved to `shipped` at dispatch; this path only adds sellable stock back.
- **Atomicity is all-or-nothing via the caller's session.** If any line's counter rejects, the whole transaction rolls back—there is no partial restock.
- **Backorder allocation runs in the same transaction.** The `.then(() => allocateWithin(...))` chain means the allocation reads the just-written restock movements; the caller's session also carries any `backorder_allocated` rows written by that call.
