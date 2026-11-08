---
source: src/modules/stats/tests/unit/calendar.test.ts
sha256: ab8c07a321631178878c3cf38d69af945a223a2045dd0fd86f0d14dbf7b7174c
generated_at: 2026-11-08T08:26:50.033458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/stats/tests/unit/calendar.test.ts

## Purpose

Unit tests for the pure calendar-arithmetic domain module. The suite locks down edge-case behavior (month/year rollover, leap-year February, week-start-on-Monday, Sunday-as-week-end) without any clock, timezone, or I/O involvement.

## Key elements

- **`describe('parseDay')`** — verifies `parseDay` returns `{ year, month, day }` for valid `YYYY-MM-DD` strings and `undefined` for malformed or out-of-range dates (including non-leap-year Feb 29).
- **`describe('addDays and inclusiveDays')`** — confirms `addDays` handles ±1 across month and year boundaries, and that `inclusiveDays` is inclusive on both ends, returns `1` for a single day, and returns `0` (not negative) when end < start.
- **`describe('bucketStart and nextBucket')`** — pins `bucketStart` to the correct first-day for day/week/month buckets (week = Monday, Sunday belongs to its own week), and `nextBucket` to step forward exactly one bucket, including Dec → Jan month rollover.
- **`formatDay`** — imported and used solely as an assertion helper to convert a date object back to a `YYYY-MM-DD` string for `expect(...).toBe(...)`.

## Relationships

- **`src/modules/stats/domain/calendar.ts`** — the sole dependency. All six functions under test (`parseDay`, `addDays`, `formatDay`, `inclusiveDays`, `bucketStart`, `nextBucket`) are imported from this module. No other file is touched.

## Notes

- Tests are synchronous, mock-free, and timezone-independent; they can be run with plain `jest` without any setup.
- `parseDay` signals failure by returning `undefined` rather than throwing — assertions use `toBeUndefined()`.
- `inclusiveDays` with a reversed range yields `0`, not a negative number or an exception.
- Week bucketing is explicitly Monday-first; the Sunday test (`2026-03-15` → bucket `2026-03-09`) guards against a common off-by-one where Sunday is treated as the start of the next week.
