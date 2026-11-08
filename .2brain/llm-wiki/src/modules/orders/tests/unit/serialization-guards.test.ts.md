---
source: src/modules/orders/tests/unit/serialization-guards.test.ts
sha256: d770e7e4b3a1e95a73b8e902a06974838a5312f4d505742520a13242f476c648
generated_at: 2026-11-08T07:14:03.132093+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/serialization-guards.test.ts

## Purpose

Unit tests for the defensive guard branches inside `applyOrderTransform`. The transform is the single serialization chokepoint for every order response; an unguarded throw turns a successful read into a 500 for the whole collection. These tests pin the behavior when `items` is missing (projected query), `items` is not an array, or individual lines lack a `product` snapshot.

## Key elements

- **`describe('order serialization guards')`** – five `it` blocks, each targeting one guard path:
  - *Happy-path totals* – verifies `totalItems`, `totalQuantity`, `totalPrice` are derived from line items.
  - *Projection without `items`* – confirms the transform does not throw when the document only has fields like `email`.
  - *Zero-totals fallback* – asserts `totalItems = 0`, `totalQuantity = 0`, `totalPrice = '0.00'` (contract requires the fields to be present, not optional).
  - *Line item with no `product`* – ensures a `product: undefined` or absent line is skipped without recursing.
  - *`items` present but non-array* – verifies the `Array.isArray` guard catches `'not-an-array'` and falls back to zero totals.
- **Import** – `applyOrderTransform` from `@modules/orders/model` (the sole SUT).

## Relationships

- **`src/modules/orders/model.ts`** – provides `applyOrderTransform`, the function under test. Every test drives that single export; there are no other collaborators.

## Notes

- The guards exist because MongoDB projected queries (e.g. `.select('email createdAt')`) omit `items` entirely. The failure is silent until a projection is exercised, which is why the tests hard-code that shape.
- The fallback to `[]` (rather than deleting the total fields) is driven by the OpenAPI contract: `openapi.yaml` marks `totalItems`, `totalQuantity`, and `totalPrice` as required, so "zero" is a valid empty order but "absent" is a spec violation.
- The module-level doc comment frames these tests as covering the "cannot happen" halves of guards that **do** happen in production—useful context if you're tempted to simplify the guards in `model.ts`.
