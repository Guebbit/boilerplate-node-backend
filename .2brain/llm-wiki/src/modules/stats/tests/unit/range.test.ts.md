---
source: src/modules/stats/tests/unit/range.test.ts
source_sha256: e033b405e292e43e11b6756bfb637b7e2d22a017db4859d5b74dbabe6704d978
context_sha256: ae91f9b90616547e5c227df17a704fdb6944bcdc9de135420856088bb6865a8c
generated_at: 2026-11-22T07:53:12.813332+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/tests/unit/range.test.ts

## Purpose
Unit tests for the rules a requested stats period must pass: real calendar days, in order, at most two years, and at most 400 buckets. The bucket cap exists mainly for the case of a day-by-day chart over two years.

## Key elements
- `describe('checkRange')`:
  - Accepts a valid period and lists every bucket start. The first week bucket can start before `from` (`2026-03-11`, a Wednesday, gives buckets starting `2026-03-09`, `03-16` and `03-23`).
  - Refuses `2026-02-30` as `invalid-day` and a `to` before `from` as `out-of-order`. The refusal is returned as `{ refusal }`.
  - Allows exactly `MAX_RANGE_DAYS` (asserted to be 731, i.e. `2026-01-01` to `2028-01-01` with both ends counted). One more day gives `too-long`.
  - Asserts `MAX_BUCKETS` is 400. `2026-01-01` to `2027-02-05` with `day` interval gives `too-many-buckets`. `2026-01-01` to `2027-02-04` with `week` interval is accepted.
- `describe('previousOf')`: for `2026-03-08` to `2026-03-14`, the previous period is the equal-length one ending the day before, `2026-03-01` to `2026-03-07`.

## Relationships
- Imports `MAX_BUCKETS`, `MAX_RANGE_DAYS`, `checkRange` and `previousOf` from `src/modules/stats/domain/range.ts`, which is the code under test.
- Imports `formatDay` from `src/modules/stats/domain/calendar.ts` to turn day values into `YYYY-MM-DD` strings for assertions.

## Notes
- `checkRange` returns either `{ range }` or `{ refusal }`. The tests narrow on `'range' in checked`, and `previousOf` throws `'range refused'` if the setup unexpectedly fails.
- The boundary cases are set one day either side of the limit (731 days, 400 buckets).
