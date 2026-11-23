---
source: src/modules/stats/domain/calendar.ts
source_sha256: e277eb135446e62d8e7c6073978187e41b2315713d448f15b12b0e74a6b82728
context_sha256: 7153d8c0b698c0018cef9da000e496cbd778c60eec09e2f79cfeff826458735e
generated_at: 2026-11-22T07:50:34.023295+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/domain/calendar.ts

## Purpose
Zone-free calendar-day arithmetic for the stats module. A day is represented as three numbers (`year`, `month`, `day`) with no clock or timezone. The timezone only matters when a day is converted to an instant, which happens in `src/modules/stats/services/range.ts`. This keeps the rules plain arithmetic that a table of test cases can cover.

## Key elements
- `CalendarDay` — interface `{ year, month (1-12), day }`.
- `parseDay(text)` — parses strict `YYYY-MM-DD`. Returns `undefined` if the format is wrong or the date doesn't exist (e.g. `2026-02-30`). It validates by round-tripping through UTC `Date`.
- `formatDay(day)` — produces the zero-padded `YYYY-MM-DD` string that `parseDay` reads back and the API echoes.
- `addDays(day, amount)` — moves a day forward or backward by whole days. Negative amounts go back.
- `inclusiveDays(from, to)` — counts days from `from` to `to`, inclusive at both ends. Returns 0 or less when `to` is before `from`.
- `bucketStart(day, interval)` — returns the first day of the bucket containing `day`. That is the day itself for `'day'`, the Monday on or before it for `'week'`, or the 1st of the month for `'month'`.
- `nextBucket(start, interval)` — returns the first day of the following bucket: +1 day, +7 days, or the 1st of the next month (rolling December into January of the next year).
- Private helpers `toUtc` and `fromUtc` convert between `CalendarDay` and a UTC-midnight timestamp. All arithmetic goes through them.

## Relationships
- Imports `DAY_MS` from `src/domain-primitives/time.ts` for day-length arithmetic.
- Imports the `StatsInterval` type from `src/types/index.ts`. The code distinguishes `'day'`, `'week'` and `'month'`.
- `src/modules/stats/services/range.ts` is where days become instants. The module header names it as the place the timezone is applied.
- `src/modules/stats/domain/range.ts` and `src/modules/stats/domain/index.ts` are neighbors in the domain layer. The index presumably re-exports this module, but that isn't visible in this file.
- Tested by `src/modules/stats/tests/unit/calendar.test.ts`. `range.test.ts` is also a neighbor.

## Notes
- Weeks are Monday-first. The code computes `(getUTCDay() + 6) % 7` to get the days since Monday.
- `nextBucket` expects a `start` that `bucketStart` returned. The `'month'` branch is the fallthrough and assumes `start.day` is 1.
- `parseDay` accepts only 4-digit-year, 2-digit-month, 2-digit-day input.
- `inclusiveDays` uses `Math.round` on the millisecond difference, so it assumes UTC-midnight values (no DST drift).
