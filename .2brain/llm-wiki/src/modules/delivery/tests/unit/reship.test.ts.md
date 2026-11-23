---
source: src/modules/delivery/tests/unit/reship.test.ts
source_sha256: 7ca08a4ba5c548a36e4675773b26ce6d26aea7592bcd1dda6f29b61f6133b087
context_sha256: 077a98d3407ba7835a54b7cd175230ec0ea8341ea3da1e105db13cc50bd0521a
generated_at: 2026-11-22T05:05:37.486165+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/reship.test.ts

## Purpose
Unit tests for the pure "reship" logic of the delivery module: choosing which fulfillment orders give back their shipped units (latest first), refusing when the order did not ship enough, and sharing the owed part of a reopening so no fulfillment order hands over more than it reopened. Everything is tested without services or I/O.

## Key elements
- `line(productId, quantity, shipped = quantity)`: test helper building a `FulfillmentLine` (shipped in full by default, `canceledQuantity: 0`, title `Product <id>`).
- `fulfillmentOrder(id, number, lines, physical = true)`: helper building a `ReopenableFulfillmentOrder`.
- `describe('planReopening')`:
  - takes units from the latest fulfillment order first (`fo2` before `fo1`);
  - refuses (asserted with `toBeUndefined()`) when fewer units shipped than come back;
  - refuses (also `toBeUndefined()`) for a non-physical (digital) fulfillment order;
  - only opens units for the requested product lines.
- `describe('shareOwed')`:
  - distributes owed units across plan entries in plan order, capped at what each reopened;
  - gives an empty list for a fulfillment order when nothing is owed. Results are read with `.get(fulfillmentOrderId)`, so the return value is keyed by fulfillment order id.
- `describe('reopening through withLoss')`: with `withLoss`, a line reopened in full goes back to `shipped = 0`, and a line owed entirely is dropped from the fulfillment order.

## Relationships
- Imports `planReopening`, `shareOwed`, `withLoss` and the types `FulfillmentLine` and `ReopenableFulfillmentOrder` from the delivery domain barrel (`src/modules/delivery/domain/index.ts`). The implementations live in the domain files `reship.ts` and `lost.ts`, with `FulfillmentLine` coming from `fulfillment.ts`. The listed neighbors suggest these are re-exported through the barrel.
- The listed services (`holds.ts`, `override-sync.ts`, `preorder-sweep.ts`, `read.ts`, `release-date-impact.ts`, `slip.ts`) are not imported or referenced in this test.

## Notes
- The `withLoss` test builds its expected value with an odd `[ {...} ].filter(Boolean)` construct. The comment explains that `b` was owed in full and so leaves the fulfillment order.
- `planReopening` refusal is asserted with `toBeUndefined()` rather than an exception.
