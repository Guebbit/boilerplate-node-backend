# src/modules/orders/tests/unit/serialization-guards.test.ts

## Purpose

Unit tests for the defensive guard branches in `applyOrderTransform`. The transform sits on the single path every order response passes through, so an unguarded throw converts a successful read into a 500 for the whole collection. These tests pin the "cannot happen" halves of the guards—missing `items`, non-array `items`, unpopulated product refs, legacy `_id`—that only surface on projected queries or legacy documents and are therefore the hardest regressions to notice in integration tests.

## Key elements

- **`describe('order serialization guards')`** — six `it` blocks, ordered happy-path-first so the guard tests read as explicit exceptions.
  - *derives the three totals from the line items* — happy-path smoke test: `totalItems`, `totalQuantity`, `totalPrice` are computed from `items`.
  - *survives a projection that never selected items* — document shaped like `{ email }` (no `items` key at all); asserts no throw.
  - *reports zero totals rather than omitting them when items are absent* — same input as above; asserts the three total fields are `0`, satisfying the OpenAPI `required` contract.
  - *strips a leftover _id from an embedded line item* — simulates a pre-`_id: false` document; asserts `_id` is removed from the serialized item.
  - *leaves a line item whose product was not populated alone* — `product` is `undefined` or missing; asserts the transform does not recurse into it and does not throw.
  - *tolerates items being present but not an array* — `items: 'not-an-array'`; asserts no throw and zero totals.

## Relationships

- **`src/modules/orders/model.ts`** — sole import. The test exercises `applyOrderTransform` directly; every assertion is about that function's output (or lack of throw) on a mutated `Record<string, unknown>` argument. No other modules or fixtures are referenced.

## Notes

- The `items: []` fallback inside the transform is what converts "key absent" into "zero totals," satisfying the `openapi.yaml` contract that marks the three total fields as required. Without it the response would be a contract violation, not merely an empty order.
- The `_id`-stripping test exists because documents written before `orderItemSchema` declared `_id: false` still carry a BSON-level `_id`; the transform must remove it so the serialized shape stays closed per the contract.
- The unpopulated-product test encodes the guard `item.product && typeof item.product === 'object'`; an unpopulated ref (ObjectId or string) must pass through untouched rather than being recursed into.
