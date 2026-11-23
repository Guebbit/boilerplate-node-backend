---
source: src/modules/orders/tests/unit/order-number.test.ts
source_sha256: bd098ea76489ec2080e92dc28c4406883366dfc87717da952a6a4d1989267a22
context_sha256: b03cdb1270d60e655755d4d7a32935dc3918de263f411a4e9ed0bc1325ab5f8f
generated_at: 2026-11-22T06:37:00.609589+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/order-number.test.ts

## Purpose
Unit tests for `parseOrderNumber`, which reads an order number as a customer might quote it and converts it to the stored (canonical) form. The tests cover which inputs are accepted and normalized, and which are rejected.

## Key elements
- **Accepted-input table** (`it.each`): each `[raw, canonical]` pair is expected to parse to the canonical form via `toBe`.
  - Already-canonical input stays unchanged: `2026-000041`.
  - Surrounding whitespace is trimmed: `' 2026-000041 '`.
  - A leading `#` is accepted, with or without a following space: `#2026-000041`, `# 2026-41`.
  - A short sequence part is zero-padded to 6 digits: `2026-41` → `2026-000041`, `2026-0` → `2026-000000`.
- **Rejected-input list** (`it.each`): each of these is asserted with `toBeUndefined`:
  - `''`, `'#'`, `'abc'` (empty or non-numeric input).
  - `'41'`, `'26-41'` (missing or short year part).
  - `'2026-'` (empty sequence).
  - `'2026-4x'` (non-digit in the sequence).
  - `'2026/41'` (wrong separator).
  - `'2026-1234567890'` (sequence too long).

## Relationships
- Imports `parseOrderNumber` from `src/modules/orders/services/order-numbering.ts` and tests only that function.

## Notes
- Invalid input is expected to yield an undefined result (`toBeUndefined`), not a thrown error.
- The tests imply a 4-digit year and a sequence of at most 6 digits, padded to 6. The 10-digit sequence is rejected, but the exact upper bound is not tested.
- `describe` and `it` are used as globals, with no import, so the test runner (likely Jest or Vitest) must provide them.
