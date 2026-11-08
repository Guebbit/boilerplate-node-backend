---
source: src/modules/returns/tests/unit/status-projection.test.ts
sha256: f17f160aeb79980ea7238fbb80e27bb7e013c6280127cbcf8ba37a884625861b
generated_at: 2026-11-08T08:13:44.898485+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/status-projection.test.ts

## Purpose

Unit tests for `projectReturnStatus`, which collapses an order's collection of `ProjectedReturn` entries (each with a status, kind, and product lines) into a single order-level status string (`'requested'`, `'in_progress'`, `'partially_returned'`, `'returned'`, or `undefined`). The file verifies that the projection respects status priority, ignores non-relevant returns (declined, canceled, remedy-closed, line-less), and correctly accounts for partial versus full coverage across multiple returns.

## Key elements

- **`ordered`** — a `Map<string, number>` fixture representing the product-quantity composition of a test order (`a: 2`, `b: 1`).
- **`ret(status, lines, kind?)`** — local factory that builds a `ProjectedReturn` object; defaults `kind` to `'return'`.
- **`describe('projectReturnStatus with a remedy')`** — asserts that a closed return carrying a `remedy` of `'replace'` or `'repair'` is treated as if the buyer retains the goods (projection returns `undefined`).
- **`describe('projectReturnStatus')`** — the main suite covering:
  - Empty / declined / canceled / line-less returns produce `undefined`.
  - A line-less return is inert when combined with a real one.
  - `'requested'` outranks `'approved'` (status priority).
  - `'approved'` → `'in_progress'`; `'closed'` with partial units → `'partially_returned'`; full coverage across returns → `'returned'`.
  - `kind: 'cancellation'` on a closed return is excluded from the "goods coming back" count.
  - Canceled units are expected to be subtracted from the order map *by the caller* before projection (the `b: 0` case).

## Relationships

- **`src/modules/returns/domain/index.ts`** — barrel re-export; the test imports `projectReturnStatus` and the `ProjectedReturn` type from here.
- **`src/modules/returns/domain/status-projection.ts`** — the module under test; provides the `projectReturnStatus` implementation.

## Notes

- The `kind` field (`'return'` vs `'cancellation'`) is semantically distinct: a closed cancellation does not count as goods returning to the warehouse, even though it references the same product lines.
- The test at the bottom (`left` map with `b: 0`) documents a caller-side contract: subtract canceled quantities from the order *before* calling `projectReturnStatus`. The function itself does not inspect cancellation entries to reduce totals.
- Remedy is an extra property spread onto the return object (`{ ...ret('closed', …), remedy }`); it is not part of the `ProjectedReturn` type signature but is read by the projection logic.
