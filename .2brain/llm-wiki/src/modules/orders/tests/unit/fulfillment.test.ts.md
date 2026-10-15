---
source: src/modules/orders/tests/unit/fulfillment.test.ts
sha256: 625f98d1b90542c99f65a124187bd5956480e17a7102db5bb3ac4ec2d6301bf3
generated_at: 2026-10-15T11:19:44.658059+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/fulfillment.test.ts

## Purpose

Unit tests for the two halves of the fulfillment-status projection: `fulfillmentStatusOf` (the row-by-row status derivation) and `fulfillmentStatusFilter` (the query filter that must select exactly the documents that derivation labels). Ensures the filter and the derivation agree for every status value and edge case.

## Key elements

- **`summary(fields)`** — local helper that spreads `NO_FULFILLMENT` (all-zero summary) then overlays the specified fields, giving each test case a fully-populated `FulfillmentSummary`.
- **`describe('fulfillmentStatusOf')`** — table-driven (`it.each`) test covering 12 combinations of `OrderStatus` × summary shape, verifying the first-match-wins priority order (pending/cancelled → delivered → shipped → partially_fulfilled → on_hold → in_progress → unfulfilled). Also checks behavior when no summary is passed at all.
- **`SAMPLES`** — 12 fixed order documents (status + optional fulfillment) that together exercise every row of the projection table and every filter branch.
- **`matches(node, sample)`** — a minimal evaluator for the specific MongoDB operators the filter uses (`$and`, `$or`, `$nor`, `$in`, `$ne`, `$gt`, dotted-path equality, and one `$expr` equality). Not a general-purpose query engine.
- **`describe('fulfillmentStatusFilter')`** — for each of the six `OrderFulfillmentStatus` values, asserts that `fulfillmentStatusFilter(value)` selects *exactly* the samples that `fulfillmentStatusOf` labels with that value, and that no value maps to an empty set.

## Relationships

- **`src/modules/orders/domain/index.ts`** → **`src/modules/orders/domain/fulfillment.ts`** — the test imports `NO_FULFILLMENT`, `fulfillmentStatusOf`, `fulfillmentStatusFilter`, and the `FulfillmentSummary` type through the domain barrel; this is the code under test.
- **`src/types/index.ts`** — provides `OrderStatus` (used in both the table and SAMPLES) and `OrderFulfillmentStatus` (the six values iterated in the filter test).

## Notes

- The `matches` helper's `$expr` branch is hard-coded to `remaining === onHold`; it is not generic. If the filter gains a new `$expr` form, this evaluator must be extended in lockstep.
- The filter test is a **cross-validation**: it never asserts a hardcoded document list, but rather that filter output ≡ derivation output over SAMPLES. This means a bug that affects both functions identically would pass; the `fulfillmentStatusOf` table (which checks against literal expected strings) guards against that.
- `NO_FULFILLMENT` is imported from the domain as the zero-default for `FulfillmentSummary`; test cases that omit a field rely on it being zero, not `undefined`.
