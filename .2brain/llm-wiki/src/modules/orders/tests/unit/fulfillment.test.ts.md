---
source: src/modules/orders/tests/unit/fulfillment.test.ts
sha256: 34f8b75e341faa48d8c21b02b96a0257872aeccf7134820cc3cc5fad8b2a62a1
generated_at: 2026-11-14T20:57:05.568183+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/fulfillment.test.ts

## Purpose

Unit tests that pin down the projection logic for order fulfillment status: the truth table for `fulfillmentStatusOf`, the agreement between that function and the Mongo query builder `fulfillmentStatusFilter`, and the settlement-action decision in `settlementFor`. They exist so that any change to the domain's status derivation or its query filter is caught by a concrete, enumerated matrix of order shapes.

## Key elements

- **`summary(fields)`** – local helper that spreads `NO_FULFILLMENT` then overrides with the given partial, producing a fully-populated `FulfillmentSummary` for test fixtures.
- **`describe('fulfillmentStatusOf')`** – 14-row table-driven test covering every branch of the first-match-wins projection (pending/canceled → `unfulfilled`; delivered → `fulfilled`; shipped → `shipped`; partially shipped → `partially_fulfilled`; fully held → `on_hold`; otherwise → `in_progress`/`unfulfilled`). Also asserts behavior when no summary is passed at all.
- **`SAMPLES`** – 12 representative order documents (status + optional fulfillment) used as the ground truth for filter tests.
- **`matches(node, sample)`** – a minimal in-test Mongo query evaluator supporting `$and`, `$or`, `$nor`, `$in`, `$ne`, `$gt`, dotted-path equality, and the single `$expr` equality the filter uses. It lets the suite verify the filter without a database.
- **`describe('fulfillmentStatusFilter')`** – iterates every value of `OrderFulfillmentStatus` and asserts the filter selects exactly the `SAMPLES` whose `fulfillmentStatusOf` value matches. A dedicated test also pins the `awaiting_shipment` filter to `isAwaitingGoods` and confirms it never selects shipped/fulfilled orders.
- **`describe('settlementFor')`** – 9-row table covering the settlement-action decision matrix (returns `'ship'`, `'deliver'`, `'complete'`, `'undeliverable'`, or `undefined`) across status × summary combinations.

## Relationships

- **`src/modules/orders/domain/fulfillment.ts`** – source of `fulfillmentStatusOf`, `fulfillmentStatusFilter`, `NO_FULFILLMENT`, and the `FulfillmentSummary` type; this file tests its exported contract.
- **`src/modules/orders/domain/lifecycle.ts`** – provides `isAwaitingGoods` and `settlementFor`, both exercised here.
- **`src/modules/orders/domain/index.ts`** – the barrel through which all domain symbols are imported (`from '../../domain'`).
- **`src/types/index.ts`** – provides `OrderStatus` and `OrderFulfillmentStatus` enums used throughout the assertions.
- **`tests/contract/ownership-shop.contract.test.ts`** – contract-level test that exercises the same fulfillment status derivation end-to-end; this file pins the unit-level truth table that contract test depends on.

## Notes

- The `matches` helper is intentionally minimal: it hard-codes the one `$expr` clause to `remaining === onHold` rather than evaluating arbitrary expressions. If the filter gains a new operator, `matches` must be extended in lockstep or the filter test will silently pass/fail incorrectly.
- The `fulfillmentStatusFilter` test uses `Object.values(OrderFulfillmentStatus)` to guarantee exhaustiveness — adding a new enum value without a matching sample will cause the `expected.length > 0` guard to fail, which is the intended failure mode.
- `settlementFor` tests treat `lastDeliveredAt` as a concrete 2026 date; the function only checks presence/absence, not the actual timestamp, but the fixture is kept realistic.
