---
source: src/modules/returns/tests/unit/status-projection.test.ts
sha256: f34b5e1e1fdf956ee6f6627f3b3282f87888a3fcfa2d504760124eeb95e8f2b9
generated_at: 2026-10-29T05:51:29.066553+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/status-projection.test.ts

## Purpose
Unit tests for `projectReturnStatus`, verifying how a set of return records projects down to the single status word an order displays. Covers the full status spectrum (requested → in_progress → partially_returned → returned), edge cases (empty, declined, canceled, no-lines), cancellation-vs-return kind, and remedy (replace/repair) handling.

## Key elements
- **`ordered`** – A `Map<string, number>` fixture representing an order with product `a` (qty 2) and product `b` (qty 1). Serves as the "remaining units" argument to every test call.
- **`ret(status, lines, kind?)`** – Local factory that builds a `ProjectedReturn` object. Defaults `kind` to `'return'`; tests pass `'cancellation'` to exercise that branch.
- **`describe('projectReturnStatus with a remedy')`** – Asserts that a closed return whose remedy is `replace` or `repair` yields `undefined` (buyer still holds the goods).
- **`describe('projectReturnStatus')`** – The main suite covering: empty array, `declined`, `canceled`, empty-lines, `requested` priority, `approved` → `in_progress`, partial vs. full coverage → `partially_returned` / `returned`, cancellation kind excluded from coverage, and caller-side subtraction of cancelled units before the call.

## Relationships
- **`src/modules/returns/domain/index.ts`** – Re-exports `projectReturnStatus` and the `ProjectedReturn` type consumed by this test.
- **`src/modules/returns/domain/status-projection.ts`** – The implementation file under test (the function's logic lives here).

## Notes
- The function's contract is "remaining units after the caller has already subtracted cancelled quantities." The cancellation test (`b: 0`) makes this explicit: the test does **not** expect the function to subtract cancellations internally.
- `projectReturnStatus` returns `undefined` (not a string) whenever no goods are held back — callers must handle the `undefined` case.
- Status priority is strictly ordered: `requested` beats `approved`; a single `requested` return in the list overrides all others.
- The remedy tests are isolated in their own `describe` block, signalling that remedy handling is a distinct concern from plain status projection.
