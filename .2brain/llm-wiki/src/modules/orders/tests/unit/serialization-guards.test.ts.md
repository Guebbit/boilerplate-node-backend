---
source: src/modules/orders/tests/unit/serialization-guards.test.ts
sha256: 0a516ae6402345463c5cc0e4acaf3574b53a6310a81254548b6942ebb3744f96
generated_at: 2026-10-29T05:00:26.102812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/serialization-guards.test.ts

## Purpose

Unit tests that lock down the defensive guard branches in `applyOrderTransform`. The transform sits on the single path every order response takes; if a guard throws, a successful read becomes a 500 for the entire collection. These tests exist so that the "cannot happen" halves of guards (missing `items`, non-array `items`, absent `product`) are verified to degrade gracefully rather than crash.

## Key elements

- **`describe('order serialization guards')`** — the sole suite; contains five tests.
- **"derives the three totals from the line items"** — happy-path check that `totalItems`, `totalQuantity`, `totalPrice` are computed from line items. Serves as the baseline that makes the following tests readable as exception cases.
- **"survives a projection that never selected items"** — passes a document with only `email`; asserts `applyOrderTransform` does not throw.
- **"reports zero totals rather than omitting them when items are absent"** — same input shape as above; asserts all three totals are `0` (required by `openapi.yaml`).
- **"leaves a line item with no product snapshot alone"** — `items` present but individual lines lack `product` (undefined or missing); asserts no throw.
- **"tolerates items being present but not an array"** — `items` is a string; asserts no throw and zero totals.

## Relationships

- **`src/modules/orders/model.ts`** — provides `applyOrderTransform`, the single function under test. This file is the only consumer in the test suite that exercises its guard branches rather than its arithmetic.

## Notes

- The tests target *guards*, not correctness of the math. The happy-path test is included purely as context so the exception tests read as "this is what breaks without the guard."
- The `items` guard is the most critical: a Mongoose projection like `.select('email createdAt')` yields a document with no `items` key at all, so `serialized.items` is `undefined`, not an empty array. Removing `Array.isArray(serialized.items)` would surface the failure only on projected reads — the hardest case to notice.
- Zero vs. absent matters contractually: `openapi.yaml` marks the three total fields `required`, so returning `undefined` is a spec violation while returning `0` is a valid "empty order."
- The file uses `Record<string, unknown>` for inputs rather than a typed model, deliberately simulating the untyped document shapes that reach the transform at runtime.
