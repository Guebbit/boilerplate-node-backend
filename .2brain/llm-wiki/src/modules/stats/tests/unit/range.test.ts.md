---
source: src/modules/stats/tests/unit/range.test.ts
sha256: e033b405e292e43e11b6756bfb637b7e2d22a017db4859d5b74dbabe6704d978
generated_at: 2026-11-08T08:27:09.065946+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/range.test.ts

## Purpose

Unit tests for the `checkRange` validation function and the `previousOf` period-shift helper in the stats domain layer. They pin down the acceptance/rejection rules (real days, ordering, two-year cap, 400-bucket cap) and the exact bucket-start alignment semantics.

## Key elements

- **`describe('checkRange')`** — Four test cases:
  - Verifies the successful result shape (`{ range: { bucketStarts: [...] } }`) and that the first week-bucket start may fall before `from` (Monday for a Wednesday start).
  - Parameterised rejection tests for `invalid-day` (non-existent date) and `out-of-order` (`from` after `to`).
  - Boundary test on `MAX_RANGE_DAYS` (731): exactly two years passes, one extra day is rejected as `too-long`.
  - Boundary test on `MAX_BUCKETS` (400): a day-interval range exceeding 400 days is rejected as `too-many-buckets`; the same span with a week interval passes.
- **`describe('previousOf')`** — Confirms the helper returns an equal-length period whose `to` is the day before the original `from` and whose `from` is shifted back by the period length.
- **Constants asserted inline** — `MAX_RANGE_DAYS` (731) and `MAX_BUCKETS` (400) are checked with `expect(...).toBe(...)` to guard against silent constant drift.

## Relationships

- **`src/modules/stats/domain/range.ts`** — Source under test. Provides `checkRange`, `previousOf`, `MAX_BUCKETS`, and `MAX_RANGE_DAYS`.
- **`src/modules/stats/domain/calendar.ts`** — Provides `formatDay`, used solely to render `Date` objects into `'YYYY-MM-DD'` strings inside expectations (keeps test output readable without importing a date library into the assertion).

## Notes

- `checkRange` returns a discriminated union (`{ range } | { refusal }`); the tests consistently use `'range' in checked` as the type guard.
- The first bucket start is allowed to precede `from`—this is intentional alignment to the interval's natural boundary (e.g., Monday for `week`), not a bug.
- `MAX_RANGE_DAYS` is 731 (both endpoints inclusive), not 730; the test comments make this explicit.
- `formatDay` is imported only for test readability; it plays no role in the production logic under test.
