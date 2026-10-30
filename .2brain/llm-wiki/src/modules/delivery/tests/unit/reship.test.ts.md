---
source: src/modules/delivery/tests/unit/reship.test.ts
sha256: a35271d50af5e40630e6f35bed3f92d1b2036f48222810118b4afad21ea3a4a6
generated_at: 2026-10-29T03:50:13.590743+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/reship.test.ts

## Purpose

Unit tests for the pure reshipment planning logic in the delivery domain. Verifies that `planReopening` selects the correct fulfillment orders (latest first) and their shipped units, that `shareOwed` distributes owed units without exceeding what each order reopened, and that `withLoss` rewrites lines after units are taken back.

## Key elements

- **`line(productId, quantity, shipped?)`** – test factory that builds a `FulfillmentLine` with zero `cancelledQuantity`.
- **`fulfillmentOrder(id, number, lines, physical?)`** – test factory that builds a `ReopenableFulfillmentOrder`; `physical` defaults to `true`.
- **`describe('planReopening')`** – covers latest-first selection, refusal when shipped < requested, exclusion of digital orders, and that only requested product lines are opened.
- **`describe('shareOwed')`** – covers proportional distribution in plan order, the cap at each order's reopened quantity, and the empty-owed edge case.
- **`describe('reopening through withLoss')`** – confirms that a line whose entire quantity moved to the owed order is removed, while a partially-reopened line retains zero `shippedQuantity`.

## Relationships

- **`src/modules/delivery/domain/index.ts`** – the sole import source; re-exports `planReopening`, `shareOwed`, `withLoss` and the `FulfillmentLine` / `ReopenableFulfillmentOrder` types.
- **`src/modules/delivery/domain/reship.ts`** – implementation under test for `planReopening` and `shareOwed`.
- **`src/modules/delivery/domain/lost.ts`** – implementation under test for `withLoss`.
- **`src/modules/delivery/domain/fulfillment.ts`** – provides the `FulfillmentLine` and `ReopenableFulfillmentOrder` type shapes exercised by the helpers.

## Notes

- The test imports from the domain barrel (`../../domain`) rather than reaching into individual module files, so adding a new export to `domain/index.ts` is sufficient to make it importable here.
- `planReopening` returning `undefined` (not an empty array) is the documented "refusal" signal; assertions use `toBeUndefined()` accordingly.
- The `withLoss` test asserts the output array length implicitly via `.filter(Boolean)`, relying on `withLoss` to drop fully-moved lines rather than leaving a zero-quantity stub.
