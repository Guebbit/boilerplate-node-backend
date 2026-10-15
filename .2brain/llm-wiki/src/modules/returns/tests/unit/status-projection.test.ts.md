---
source: src/modules/returns/tests/unit/status-projection.test.ts
sha256: bbfa2cceffa7c70dcd02c6d61dfd56f67400b212947fd04cb2fd7437e4fcf23d
generated_at: 2026-10-15T12:02:25.816969+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/status-projection.test.ts

## Purpose

Unit tests for `projectReturnStatus`, the function that collapses an order's set of returns into a single display status (`'requested'`, `'in_progress'`, `'partially_returned'`, `'returned'`, or `undefined`). The tests pin down the priority rules, edge cases (empty returns, no-line returns, mixed kinds), and the special handling of cancellations.

## Key elements

- **`ret` helper** – Builds a `ProjectedReturn` object from a shorthand tuple of status, line items, and optional `kind` (defaults to `'return'`). Used by every test case to keep setup terse.
- **`ordered` map** – The canonical "units still expected back" fixture: 2 × `a`, 1 × `b`. Represents what the caller has already subtracted cancelled quantities from.
- **`describe('projectReturnStatus')`** – Ten test cases covering:
  - Empty input → `undefined`
  - Declined returns and no-line returns are ignored (don't affect the result)
  - `requested` takes priority over `approved`
  - `approved` with full quantity → `'in_progress'`
  - Partially covered quantities → `'partially_returned'`
  - Full coverage across multiple returns → `'returned'`
  - Cancellation kind: its lines are excluded from the "units coming back" count; the caller pre-subtracts them from the `ordered` map

## Relationships

- **`src/modules/returns/domain/index.ts`** — The test imports `projectReturnStatus` and the `ProjectedReturn` type from this barrel. It does not reach into `status-projection.ts` directly.
- **`src/modules/returns/domain/status-projection.ts`** — The implementation under test. The function and the `ProjectedReturn` type are defined here and re-exported through the domain index.

## Notes

- The `ordered` map is the *post-cancellation* expectation. The last test makes this explicit: the caller is responsible for subtracting cancelled quantities before invoking `projectReturnStatus`. The function itself does not inspect `kind` to skip cancellation lines; it simply compares closed/received line quantities against whatever map it receives.
- `'cancellation'` is the only alternate `kind` exercised. The helper defaults to `'return'` so most cases omit it.
- A return with zero lines is treated as a no-op even when its status would otherwise be terminal (`'closed'`); it neither satisfies nor blocks the projection.
