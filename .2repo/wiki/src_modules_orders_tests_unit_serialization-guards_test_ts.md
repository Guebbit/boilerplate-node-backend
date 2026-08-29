# src/modules/orders/tests/unit/serialization-guards.test.ts

## Purpose

Unit tests for the defensive guard branches in the order serialization transform. These tests exercise the "cannot happen" paths (missing `items`, non-array `items`, unpopulated `product`, legacy `_id`) that the happy-path flow never hits, ensuring the transform never throws at the single serialization choke-point through which every order response passes.

## Key elements

- **`describe('order serialization guards')`** — suite scoped to guard behavior rather than full integration.
- **"derives the three totals from the line items"** — happy-path: `totalItems`, `totalQuantity`, `totalPrice` computed correctly from an `items` array.
- **"survives a projection that never selected items"** — document shaped like a `.select('email createdAt')` result (no `items` key) must not throw.
- **"reports zero totals rather than omitting them"** — when `items` is absent the transform sets all three totals to `0`, satisfying the OpenAPI contract that marks them required.
- **"strips a leftover _id from an embedded line item"** — legacy documents (written before `orderItemSchema`'s `_id: false`) still carry a BSON `_id`; the transform removes it.
- **"leaves a line item whose product was not populated alone"** — `product` missing or non-object (e.g. an unpopulated ObjectId/string) does not trigger a recursive descent or throw.
- **"tolerates items being present but not an array"** — `items: 'not-an-array'` is handled by the `Array.isArray` guard; totals default to `0`.

## Relationships

- **`src/modules/orders/model.ts`** — the sole import. `applyOrderTransform` is the function under test; all assertions call it directly on a plain `Record<string, unknown>` object, simulating the shape Mongoose hands to the post-serialization transform.

## Notes

- The file-level doc comment is the primary rationale: because the transform is the single serialization point, a throw here turns a successful read into a 500 for *every* order in the collection, not just the one with bad data.
- The `Array.isArray` guard is the critical path: `.select()` projections produce documents with no `items` key at all, and the transform runs on them identically to full documents.
- Zero-totals (not omission) is a contract requirement driven by `openapi.yaml` marking `totalItems`, `totalQuantity`, and `totalPrice` as required fields.
- Tests use `Record<string, unknown>` rather than a typed order shape, intentionally modeling the untyped data Mongoose can produce after projection or with legacy documents.
