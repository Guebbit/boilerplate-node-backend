---
source: src/modules/orders/tests/unit/fulfillment.test.ts
source_sha256: 34f8b75e341faa48d8c21b02b96a0257872aeccf7134820cc3cc5fad8b2a62a1
context_sha256: 4a5b18b9c25364db1ae727a6017b1e26a0169836d469d260ae3190c40c6bda71
generated_at: 2026-11-22T06:36:21.770206+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/fulfillment.test.ts

## Purpose
Unit tests for the order fulfillment projection. They cover every row of the `fulfillmentStatusOf` table in read order (first match wins), check that the listing filter `fulfillmentStatusFilter` agrees with it, and check the `settlementFor` transitions.

## Key elements
- `summary(fields)` — test helper. Spreads a partial over `NO_FULFILLMENT`, so unspecified fields are zero.
- `describe('fulfillmentStatusOf')` — a table-driven `it.each` whose rows are labeled by table row number (1–4). Expected results:
  - Row 1 is decided by status alone. `pending` and `canceled` give `unfulfilled`, `delivered` gives `fulfilled` and `shipped` gives `shipped`. A pending order stays `unfulfilled` whatever the summary says.
  - Row 2: something shipped and units remain gives `partially_fulfilled`, even if the rest is held.
  - Row 3: nothing shipped and every remaining unit held gives `on_hold`, which beats `in_progress` and applies to `paid` orders.
  - Row 4: `processing` with only some units held, or with no summary, gives `in_progress`. `paid` gives `unfulfilled`.
  - One extra test calls `fulfillmentStatusOf` with no summary argument.
- `SAMPLES` — a fixed list of order documents (status plus optional summary) that covers every fulfillment value.
- `matches(node, sample)` — a small in-test Mongo-style matcher. It supports `$and`, `$or`, `$nor`, `$in`, `$ne`, `$gt`, equality on dotted paths (keys prefixed with `fulfillment.`), and a single `$expr` clause.
- `describe('fulfillmentStatusFilter')`:
  - For each value of `OrderFulfillmentStatus`, the filter must select exactly the samples whose `fulfillmentStatusOf` equals that value. Each value must be reachable by at least one sample.
  - `'awaiting_shipment'` must select exactly the samples where `isAwaitingGoods(status)` is true. Each selected sample must read `unfulfilled`, `in_progress`, `on_hold` or `partially_fulfilled`.
- `describe('settlementFor')` — a table of status and summary combinations. The expected result is `undefined`, `'ship'`, `'complete'`, `'deliver'` or `'undeliverable'`.

## Relationships
- Imports `NO_FULFILLMENT`, `fulfillmentStatusFilter`, `fulfillmentStatusOf`, `isAwaitingGoods`, `settlementFor` and the `FulfillmentSummary` type through the domain barrel (`src/modules/orders/domain/index.ts`). The implementations are presumably in `src/modules/orders/domain/fulfillment.ts` and `src/modules/orders/domain/lifecycle.ts`, but the barrel's contents are not visible in this file.
- Imports `OrderStatus` and `OrderFulfillmentStatus` from `@types` (`src/types/index.ts`).
- `tests/contract/ownership-shop.contract.test.ts` has no visible interaction with this file.

## Notes
- `matches` is hand-written and handles only the operators the filter currently uses. If the filter gains a new operator, the matcher must be extended or the tests will misjudge it.
- The `$expr` branch is hardcoded to compare `fulfillment.remaining` with `fulfillment.onHold`. It does not evaluate the actual expression.
- `values` comes from `Object.values(OrderFulfillmentStatus)`, so a new enum member automatically gets a test case. The reachability assertion then fails until a sample produces that value.
- `'awaiting_shipment'` is passed to the filter as a literal and is not in the `values` loop. The test relies on the filter accepting it as input.
