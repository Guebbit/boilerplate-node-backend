---
source: src/modules/stats/tests/unit/calendar.test.ts
source_sha256: ab8c07a321631178878c3cf38d69af945a223a2045dd0fd86f0d14dbf7b7174c
context_sha256: ccdf9114d95a2881090cd6526a56a1c9f49bede86df02991e2e10bf4d96e47cc
generated_at: 2026-11-22T07:52:55.978853+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/tests/unit/calendar.test.ts

## Purpose
Unit tests for the calendar arithmetic in `src/modules/stats/domain/calendar.ts`. Days are plain `{ year, month, day }` triples with no clock or time zone. The tests focus on edge cases: dates a month doesn't have, weeks that start on Monday, and months that end in December.

## Key elements
- **`parseDay` tests**
  - A valid ISO date (`'2026-03-05'`) parses to `{ year: 2026, month: 3, day: 5 }`.
  - A table-driven `it.each` checks that `parseDay` yields no result (asserted with `toBeUndefined`) for each of these inputs:
    - `2026-02-30`
    - `2026-13-01`
    - `2026-00-10`
    - `2026-3-5` (unpadded)
    - `26-03-05` (short year)
    - the empty string
    - `tomorrow`
  - 29 February is accepted in 2028 (a leap year) and rejected in 2026.
- **`addDays` / `inclusiveDays` tests**
  - `addDays` crosses a year boundary forward (2026-12-31 + 1 gives 2027-01-01) and a month boundary backward (2026-03-01 − 1 gives 2026-02-28).
  - `inclusiveDays` counts both endpoints: the same day gives 1, a day and the day six later give 7, and an end before the start gives 0.
- **`bucketStart` / `nextBucket` tests** (use Wednesday 2026-03-11 as the reference date)
  - `bucketStart` returns the day itself for `'day'`, the preceding Monday (2026-03-09) for `'week'`, and the first of the month for `'month'`.
  - A Sunday (2026-03-15) belongs to the week that began on Monday 2026-03-09. A Monday maps to itself.
  - `nextBucket` steps one bucket forward:
    - day: 03-11 → 03-12
    - week: 03-09 → 03-16
    - month: 2026-12-01 → 2027-01-01
- `formatDay` is used throughout to turn results back into `YYYY-MM-DD` strings for assertions.

## Relationships
The file imports `addDays`, `bucketStart`, `formatDay`, `inclusiveDays`, `nextBucket` and `parseDay` from `src/modules/stats/domain/calendar.ts`. It tests only that module's public functions, with no mocks or other dependencies.

## Notes
- Bucket granularities exercised are `'day'`, `'week'` and `'month'`. Weeks run Monday to Sunday.
- `inclusiveDays` returns 0, not a negative number, when the end precedes the start.
- Invalid `parseDay` input is expected to produce no result (`toBeUndefined`); the tests do not cover throwing.
