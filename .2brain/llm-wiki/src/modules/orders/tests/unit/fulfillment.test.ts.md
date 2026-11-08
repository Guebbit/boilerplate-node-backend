---
source: src/modules/orders/tests/unit/fulfillment.test.ts
sha256: c65d3840a9638aea4682f1411f6434759ac8995b5d73ebac5ee61907d9a7f8e2
generated_at: 2026-11-08T07:12:29.961997+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/fulfillment.test.ts

## Purpose

Unit tests for the order-fulfillment projection: verifies that `fulfillmentStatusOf` classifies every (status, summary) combination according to the documented first-match-wins priority table, and that `fulfillmentStatusFilter` produces a query selecting exactly the documents the classifier assigns to each of the six `OrderFulfillmentStatus` values.

## Key elements

- **`summary(fields)`** – local helper that spreads `NO_FULFILLMENT` defaults then applies a partial override, so each test case only names the fields it cares about.
- **`describe('fulfillmentStatusOf')`** – 13 table-driven cases (`it.each`) covering all four priority tiers (unfulfilled, shipped, partially_fulfilled, on_hold, in_progress) plus edge cases like "no summary at all" and "pending ignores the summary entirely."
- **`SAMPLES`** – 12 frozen order documents spanning every status × summary combination the filter must distinguish.
- **`matches(node, sample)`** – recursive evaluator for the subset of MongoDB operators the filter uses (`$and`, `$or`, `$nor`, `$in`, `$ne`, `$gt`, dotted-path equality, and one `$expr` that checks `remaining === onHold`). Exists because the test runs without a database.
- **`describe('fulfillmentStatusFilter')`** – for each of the six status values, asserts the filter's selection over `SAMPLES` equals the set of samples `fulfillmentStatusOf` maps to that value, and that the set is non-empty.

## Relationships

- **`src/modules/orders/domain/fulfillment.ts`** – defines `NO_FULFILLMENT`, `fulfillmentStatusOf`, `fulfillmentStatusFilter`, and the `FulfillmentSummary` type that this file exercises.
- **`src/modules/orders/domain/index.ts`** – barrel through which the above symbols are imported (`import { … } from '../../domain'`).
- **`src/types/index.ts`** – source of `OrderStatus` and `OrderFulfillmentStatus` used throughout the test cases and assertions.

## Notes

- The `$expr` branch in `matches` is hard-coded to `remaining === onHold`; if the filter gains a different `$expr` expression the helper must be updated in lockstep.
- The filter test enforces *bidirectional* agreement (filter ⇒ classifier and classifier ⇒ filter) via `toEqual`, and guards against a vacuous pass with `expected.length > 0`.
- `SAMPLES` is a plain array of object literals, not imported fixtures; adding a new status or summary shape requires extending both the `fulfillmentStatusOf` table and `SAMPLES` in the same change.
