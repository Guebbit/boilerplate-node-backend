---
source: src/modules/delivery/tests/unit/reship.test.ts
sha256: 7ca08a4ba5c548a36e4675773b26ce6d26aea7592bcd1dda6f29b61f6133b087
generated_at: 2026-11-08T05:47:02.583366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/reship.test.ts

## Purpose

Unit tests for the pure reshipment (reopening) domain logic: verifying that `planReopening` picks units from the latest physical fulfillment orders first, that `shareOwed` caps each order at its reopened quantity, and that `withLoss` correctly adjusts or removes lines when units move to the owed order.

## Key elements

- **`line(productId, quantity, shipped?)`** – test factory for a `FulfillmentLine`; defaults `shipped` to `quantity`.
- **`fulfillmentOrder(id, number, lines, physical?)`** – test factory for a `ReopenableFulfillmentOrder`; defaults `physical` to `true`.
- **`describe('planReopening', …)`** – four cases: latest-first ordering, refusal when shipped < returned, refusal for digital orders, and line scoping (only requested productIds are reopened).
- **`describe('shareOwed', …)`** – two cases: distributing owed units in plan order without exceeding each order's reopened amount; empty-owed returns empty arrays.
- **`describe('reopening through withLoss', …)`** – one case: partially reopened line gets `shippedQuantity` zeroed; a line fully moved to the owed order is dropped from the result.

## Relationships

- Imports `planReopening`, `shareOwed`, `withLoss` and the types `FulfillmentLine`, `ReopenableFulfillmentOrder` from **`src/modules/delivery/domain/index.ts`** (the barrel that re-exports from `reship.ts` and `lost.ts`).
- No direct interaction with the `services/*` neighbors; those are integration-level consumers, not unit-test targets here.

## Notes

- Refusal cases assert `toBeUndefined()` — the domain functions signal "cannot reship" by returning `undefined` rather than throwing.
- The `withLoss` test uses `.filter(Boolean)` because the function removes lines entirely when their full quantity moves to the owed order; expect an array shorter than the input.
- The `line` helper's `shipped` default mirrors production where a freshly shipped line has `shippedQuantity === quantity`; pass an explicit third arg to simulate partial shipping.
