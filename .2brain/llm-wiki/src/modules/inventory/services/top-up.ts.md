---
source: src/modules/inventory/services/top-up.ts
sha256: 23543116866a81ee2402005e04dcef3bfd44d9f38930df76c4c68cebbbc048dd
generated_at: 2026-10-29T04:05:02.487394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/top-up.ts

## Purpose

Re-reserves inventory units for an order after one of its parcels is reported lost. Units that left the shelf at shipping time are re-taken from whatever the shelf still has free; the shortfall is claimed as an **uncapped** backorder (the existing backorder cap governs new sales, not a promise already made). The operation runs inside the caller's Mongoose transaction.

## Key elements

- **`reserveMoreForOrder(orderId, lines, session)`** – the sole export. Processes every product line in sorted productId order, calls `takeOne` per line, assembles the resulting hold lines, and persists them via `reservationRepository.topUpItems`. Returns an array of `TopUp` records.
- **`takeOne(orderId, line, session)`** – internal. Looks up the stock level, splits the line into a *shelf* part (min of available and requested) and an *owed* part. Applies `StockMovementReason.reserve` for the shelf part and `StockMovementReason.backorder` (with `uncapped: true`) for the owed part via `applyTransition`. A product with no stock level short-circuits to `{shelf: 0, owed: 0}`.
- **`linesOf(taken)`** – internal. Flattens `TopUp[]` into `HoldLine[]`, emitting a plain stock line for the shelf part and a `kind: 'backorder'` line for the owed part.
- **`NOTES`** – frozen string constants used as ledger notes so audit trails can distinguish shelf re-reservation from the owed claim.

## Relationships

- **`../domain` (index / hold-lines)** – imports the `HoldLine` type; `linesOf` produces those records.
- **`../repository`** – calls `stockLevelRepository.findByProductId` (read) and `reservationRepository.topUpItems` (write) to update the hold.
- **`./transition`** – calls `applyTransition` to perform the actual counter mutations for both the reserve and backorder legs.
- **`./types`** – imports the `StockLine` and `TopUp` shapes used as inputs/outputs.
- **`@types` (src/types/index.ts)** – imports `StockMovementReason` enum values (`reserve`, `backorder`).
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** – exercises the lost-parcel path that eventually calls into this service.

## Notes

- **Lock ordering:** lines are processed in ascending `productId` order (`toSorted`) so two concurrent top-ups for the same product never acquire row locks in opposite order.
- **Uncapped owed:** the backorder claim passes `uncapped: true`, intentionally bypassing the cap that limits new sales. Do not "fix" this to use the capped path.
- **Deleted products:** a product with no stock level document yields `{shelf: 0, owed: 0}` silently; the loss is expected to be recorded elsewhere.
- **Hold reopen semantics:** if the order's hold had already ended, `topUpItems` reopens it as `committed`, preserving its original position in the preorder queue.
- **Cache invalidation is the caller's job:** this module does not touch any in-memory stock cache; the caller must refresh it after the session commits.
- **All-or-nothing:** any failed counter write or hold conflict throws and the caller's transaction rolls back.
