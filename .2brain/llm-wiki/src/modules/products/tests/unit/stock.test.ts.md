---
source: src/modules/products/tests/unit/stock.test.ts
source_sha256: 1ef7e43fa59a9e6bb55d3d99d651b64c91c8a30f65448e550877ce298755abbb
context_sha256: dc2ab5cc12765188b85778e25dc9def62c30e2f59202deb3a2c7f32e3ba2db95
generated_at: 2026-11-22T07:19:58.045483+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/stock.test.ts

## Purpose
Unit tests for the two pure stock helpers in `src/modules/products/domain/stock.ts`: `availableStock` and `preorderAllowanceLeft`. No database is involved. The tests cover the cases that callers (`@modules/inventory`, `@modules/cart`) can pass in.

## Key elements
- **`describe('availableStock')`** — table-driven (`it.each`) cases of `(onHand, reserved) → expected`:
  - `(10, 0) → 10`, `(10, 4) → 6`, `(10, 10) → 0`.
  - Missing counters: `(undefined, undefined) → 0`, `(5, undefined) → 5`, `(undefined, 5) → 0`.
- **Negative clamp test** — `availableStock(3, 8)` returns `0`. The test comment says this state should be unreachable but is asserted anyway, so a negative count never reaches a screen.
- **`describe('preorderAllowanceLeft')`** — table-driven cases of `(limit, claimed) → expected`:
  - `(10, 3) → 7`, `(10, 10) → 0`, `(3, 5) → 0` (over-claimed gives 0).
  - `(undefined, undefined) → 0`, `(4, undefined) → 4`.
  - `(null, 5) → 999_999` (no cap).

## Relationships
- Imports `availableStock` and `preorderAllowanceLeft` from `../../domain/stock` (`src/modules/products/domain/stock.ts`). That module is the only unit under test.

## Notes
- Absent `onHand` counters (`undefined`) count as nothing to sell, not unlimited. The test comment calls this the safe direction for a number that decides whether to take payment.
- For `preorderAllowanceLeft`, a `null` limit means no cap and returns `999_999`. A comment explains that the contract wants an integer and the buyer is never told the count. An `undefined` limit returns `0`, so `null` and `undefined` behave differently.
