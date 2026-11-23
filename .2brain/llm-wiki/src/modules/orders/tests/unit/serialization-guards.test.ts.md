---
source: src/modules/orders/tests/unit/serialization-guards.test.ts
source_sha256: 5ba445cba8ee1353471834a62311b983a6740aa22267877065b2fb5c8cdd3042
context_sha256: 97d8100b325fe784a0d4c999f42a5adddbecd00d640bcf96aab4dd17366f1c33
generated_at: 2026-11-22T06:38:04.068436+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/serialization-guards.test.ts

## Purpose
Unit tests for the defensive branches of the order serialization transform. The transform runs on every response, so a throw would turn a successful read into a 500 for the whole collection. The tests pin down the guards that handle shapes that look impossible but occur in practice, mainly projected queries that return documents with no `items`.

## Key elements
- **Happy path test**: two line items (`10.00` × 2, `5.00` × 3) produce `totalItems` 2, `totalQuantity` 5 and `totalPrice` `'35.00'`.
- **Projection test**: a document with only `email` (as from `.select('email createdAt')`) must not throw.
- **Zero totals test**: with `items` absent, the transform still sets `totalItems` 0, `totalQuantity` 0 and `totalPrice` `'0.00'`. The `openapi.yaml` contract marks these fields required, so they must be present as zero rather than omitted.
- **Missing product snapshot test**: line items with `product: undefined` or no `product` key must not throw. The transform's `item.product && typeof item.product === 'object'` check prevents recursing into nothing.
- **Non-array items test**: `items: 'not-an-array'` must not throw and yields `totalItems` 0.

## Relationships
- Imports `applyOrderTransform` from `@modules/orders/model` (`src/modules/orders/model.ts`) and calls it directly on plain `Record<string, unknown>` objects. It is the only unit under test.
- The module docs name `applyOrderItems` and `applyOrderTotals` as the functions carrying the items guard. They are not imported here and are exercised only through `applyOrderTransform`.

## Notes
- The transform mutates its argument in place, and the tests assert on the same object they pass in.
- Removing the `Array.isArray` guard would fail only on projected reads, which is why this file exists.
- The `product` guard is needed because the schema does not require `product` on a line item.
