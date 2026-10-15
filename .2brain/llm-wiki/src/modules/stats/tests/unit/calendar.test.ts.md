---
source: src/modules/stats/tests/unit/calendar.test.ts
sha256: ab8c07a321631178878c3cf38d69af945a223a2045dd0fd86f0d14dbf7b7174c
generated_at: 2026-10-15T12:05:26.162157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/calendar.test.ts

## Purpose

Unit tests for the pure calendar-arithmetic functions in the stats domain. The focus is on edge cases: invalid calendar dates, leap-year boundaries, month/year rollover, and the Monday-start week convention. No clocks, no time zones — just three-integer day values.

## Key elements

- **`describe('parseDay')`** — Verifies that `parseDay` accepts a strict `YYYY-MM-DD` string and returns `{ year, month, day }`; rejects malformed strings (single-digit month, short year, empty, natural-language) by returning `undefined`; accepts Feb 29 only in a leap year (2028) and rejects it in a non-leap year (2026).
- **`describe('addDays and inclusiveDays')`** — Checks that `addDays` correctly crosses month and year boundaries in both directions. Confirms `inclusiveDays` counts both endpoints (1 for same day, 7 for a week) and returns **0** (not a negative number) when `end` precedes `start`.
- **`describe('bucketStart and nextBucket')`** — Verifies `bucketStart` snaps a date to the first day of its day / week (Monday) / month. Asserts that **Sunday falls at the end of its own week**, not the start of the next. Checks `nextBucket` advances by exactly one bucket, including December → January.

## Relationships

- **`src/modules/stats/domain/calendar.ts`** — The sole import source. This test file exercises all six exported functions: `addDays`, `bucketStart`, `formatDay`, `inclusiveDays`, `nextBucket`, `parseDay`. No other dependencies.

## Notes

- `parseDay` signals failure by returning `undefined` (not by throwing); tests use `toBeUndefined()` accordingly.
- Weeks are **Monday-start**: `bucketStart(…, 'week')` on a Sunday returns the Monday seven days prior, not the following Monday.
- `inclusiveDays` is clamped at 0 for reversed arguments — it never returns a negative count.
- Test data intentionally uses `2026` (non-leap) and `2028` (leap) to pin leap-year logic without depending on "current year."
