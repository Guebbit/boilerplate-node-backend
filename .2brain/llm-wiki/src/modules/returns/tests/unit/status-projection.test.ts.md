---
source: src/modules/returns/tests/unit/status-projection.test.ts
source_sha256: 21c560fc46fe174a8f1a6548ceb62778976b9e4b0e4c2fb04ebc8fea39291f97
context_sha256: 6cd49d76d2823a8dc58a02db7392b354cddd3432fc9d8beeace4410483e245dd
generated_at: 2026-11-22T07:40:10.533859+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/status-projection.test.ts

## Purpose
Unit tests for `projectReturnStatus`, the returns-domain function that collapses an order's returns into the single status word the order displays (nothing when no returns apply). The tests pin down which returns are ignored and how the remaining ones combine into `requested`, `in_progress`, `partially_returned` or `returned`.

## Key elements
- `ordered`: a `Map` of ordered quantity per product (`a` → 2, `b` → 1), which the projection compares returned quantities against.
- `ret(status, lines, kind = 'return')`: helper that builds a `ProjectedReturn` from `[productId, quantity]` pairs.
- `describe('projectReturnStatus with a remedy')`: a return closed with a `replace` or `repair` remedy projects to nothing (asserted with `toBeUndefined`), since the buyer holds the goods again.
- `describe('projectReturnStatus')` cases:
  - Projects to nothing (asserted with `toBeUndefined`): no returns, `declined` returns, `canceled` returns, and returns with no lines. A canceled or empty return also does not change the result of the other returns.
  - A `requested` return takes precedence over everything else, such as an `approved` one.
  - An `approved` return alone gives `in_progress`.
  - A `closed` return covering only some units gives `partially_returned`.
  - `received` plus `closed` returns that together cover every ordered unit give `returned`.
  - A `kind: 'cancellation'` return does not count as goods coming back. It alone projects to nothing, and mixed with a real return only the real return counts.
  - Passing a reduced ordered map (e.g. `b` → 0) lets coverage reach `returned` once every remaining unit is back.

## Relationships
- Imports `projectReturnStatus` and the `ProjectedReturn` type from `src/modules/returns/domain/index.ts`, which presumably re-exports them from `src/modules/returns/domain/status-projection.ts`, the implementation under test.
- `src/modules/delivery/tests/unit/fulfillment.test.ts` is a graph neighbor. This file does not reference it directly.

## Notes
- The caller, not the projection, subtracts canceled quantities from the ordered map before calling. The last test simulates this by setting `b` to 0.
- Multiple returns are aggregated across the order, so coverage can be completed by several returns together.
- The tests use globals (`describe`, `it`, `expect`) with no imports.
