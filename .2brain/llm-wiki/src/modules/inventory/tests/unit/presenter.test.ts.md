---
source: src/modules/inventory/tests/unit/presenter.test.ts
source_sha256: 47f330d3f9d9531624a3d7e4c23cbfe03f6e62e2eb71ee7b3f27d65876d4f969
context_sha256: 2f5250701fc16b44514ed7f30c3a71da6026b4891145f15eb8730059e52d9c5a
generated_at: 2026-11-22T05:28:32.850564+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/unit/presenter.test.ts

## Purpose
Unit tests for the wire form of the inventory stock counters. They pin down one rule: a stored `null` backorder cap is serialized as an absent key, never as `null`, while a cap of `0` is still reported.

## Key elements
- `row(backorderLimit)`: test helper building a preorder row (`productId: 'p1'`, `backordered: 4`, `ordered: 4`, `held: 1`, `paid: 3`) with the given cap.
- `describe('presentInventoryLevel')`:
  - A cap of `0` is kept: `backorderLimit` is `0`.
  - A `null` cap leaves the `backorderLimit` property out.
- `describe('presentPreorderLevel')`:
  - With a cap of `10` and `sellsAgainstCap: true`, the result matches `{ backorderLimit: 10, left: 6 }`.
  - With a `null` cap, both `backorderLimit` and `left` are omitted.
  - With `sellsAgainstCap: false`, `left` is omitted even when a cap exists.

## Relationships
Imports `presentInventoryLevel` and `presentPreorderLevel` from `src/modules/inventory/presenter.ts` (the code under test). The tests pass plain object literals as input and the second argument as `{ title, sellsAgainstCap }`. The first argument for `presentInventoryLevel` is a level object, and its second argument is the string `'T'`.

## Notes
- Absence is asserted with `not.toHaveProperty`, so a key present with value `null` or `undefined` would fail those tests.
- The `left: 6` expectation in the capped case comes from the fixture's counters (cap 10, `backordered: 4`). The test does not state the formula.
