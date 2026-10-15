---
source: src/modules/stats/tests/unit/range.test.ts
sha256: e033b405e292e43e11b6756bfb637b7e2d22a017db4859d5b74dbabe6704d978
generated_at: 2026-10-15T12:05:44.610686+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/range.test.ts

## Purpose

Unit tests for the range-validation domain logic in `domain/range.ts`. Verifies that `checkRange` enforces the four rules (valid calendar days, ordered endpoints, ≤ 731 days, ≤ 400 buckets) and that `previousOf` shifts a range back by its own length, ending the day before `from`.

## Key elements

- **`describe('checkRange')`** — five test cases:
  - Accepts a valid period and asserts the exact list of `bucketStarts` (first bucket may start *before* `from`, e.g. a Wednesday falls in a Monday-starting week).
  - `it.each` over two invalid inputs: an impossible date (`2026-02-30` → `invalid-day`) and reversed endpoints (`out-of-order`).
  - Boundary: exactly 731 days is accepted; 732 is refused with `'too-long'`.
  - Boundary: a range requiring 401 day-buckets is refused with `'too-many-buckets'`; the same span with a `week` interval passes.
- **`describe('previousOf')`** — asserts the returned `{ from, to }` is the same-length window ending one day before the original `from`.

## Relationships

- **`src/modules/stats/domain/range.ts`** — the module under test. Provides `checkRange`, `previousOf`, `MAX_BUCKETS` (400), and `MAX_RANGE_DAYS` (731). The tests assert the constant values directly to pin the contract.
- **`src/modules/stats/domain/calendar.ts`** — supplies `formatDay`, used solely to convert internal day-objects to `'YYYY-MM-DD'` strings for readable assertions.

## Notes

- The first test intentionally picks a Wednesday (`2026-03-11`) to document that week-bucket starts may precede `from`.
- The two boundary tests (731 vs 732 days; 400 vs 401 buckets) are the critical regression guards; changing either constant requires updating both the assertion on the constant and the boundary date in the test.
- `checkRange` return is a discriminated union (`{ range }` | `{ refusal }`); tests use the `'range' in checked` narrowing pattern rather than a type guard, matching how production code consumes the result.
