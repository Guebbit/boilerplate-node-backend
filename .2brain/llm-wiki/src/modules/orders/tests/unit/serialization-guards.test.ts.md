---
source: src/modules/orders/tests/unit/serialization-guards.test.ts
sha256: 24b5fe016d350dc8e0e39c14aea96ecca221904c5991e32e00783b6b338d83d0
generated_at: 2026-09-23T19:15:06.726679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/serialization-guards.test.ts

## Purpose

Unit tests that lock in the defensive guards inside `applyOrderTransform`. The transform is the single choke point every order response passes through, so a throw there converts a valid read into a 500. These tests exist to ensure the guards (which handle "cannot happen" shapes like projected documents or non-array `items`) actually prevent that failure.

## Key elements

- **`describe('order serialization guards')`** — single test suite, five cases:
  - *Happy path* — verifies `totalItems`, `totalQuantity`, `totalPrice` are derived correctly from line items.
  - *Projection without `items`* — confirms a document shaped like `{ email: … }` does not throw.
  - *Zero-total fallback* — asserts that when `items` is absent the three totals are set to `0` (not omitted), satisfying the required-field contract in `openapi.yaml`.
  - *Unpopulated product refs* — `item.product` is `undefined` or a plain value; the transform must skip rather than recurse.
  - *`items` present but not an array* — `Array.isArray` guard prevents a throw and yields zero totals.

## Relationships

- **`src/modules/orders/model.ts`** — sole import. Provides `applyOrderTransform`, the function under test. Every assertion in this file exercises that one transform (or, equivalently, its internal `applyOrderItems` / `applyOrderTotals` helpers).

## Notes

- Tests are ordered intentionally: the happy path comes first so the remaining four read as exception cases they guard.
- The `openapi.yaml` contract is load-bearing context: the three total fields are *required*, so the transform must emit `0` rather than omitting them when items are missing. Changing the fallback to `undefined` would break the API contract even though no test here checks for it by name.
- `applyOrderItems` and `applyOrderTotals` are not exported from `model.ts` for direct testing; they are exercised only through `applyOrderTransform`.
