---
source: src/modules/stats/domain/calendar.ts
sha256: 4cd72b1960be489b8234ef28bf10e3e6b6be8454e4fd7286e91a7316e282ba2f
generated_at: 2026-10-29T05:55:09.284334+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/calendar.ts

## Purpose

Pure-arithmetic calendar-day operations for the stats module. A day is represented as three integers (`year`, `month`, `day`) with no clock time and no timezone; all arithmetic runs on UTC-midnight timestamps. This keeps the rules trivially table-testable and defers zone/clock concerns to `services/range.ts`, which is where a day becomes an instant.

## Key elements

- **`CalendarDay`** – interface: `{ year, month, day }`; `month` is 1-based (1–12).
- **`parseDay(text)`** – parses a strict `YYYY-MM-DD` string; returns `undefined` for malformed input *or* impossible dates (e.g. `2026-02-30`) via a round-trip through `Date`.
- **`formatDay(day)`** – serializes a `CalendarDay` to zero-padded `YYYY-MM-DD`.
- **`addDays(day, amount)`** – shifts a day by a signed number of whole days.
- **`inclusiveDays(from, to)`** – returns the inclusive day count between two days; ≤ 0 when `to < from`.
- **`bucketStart(day, interval)`** – snaps a day to the first day of its bucket (day / Monday-first week / month).
- **`nextBucket(start, interval)`** – returns the first day of the *next* bucket after `start`; handles December→January rollover for months.

Internal helpers `toUtc` / `fromUtc` convert between `CalendarDay` and a UTC-midnight timestamp (the single arithmetic representation). The `ISO_DAY` regex enforces the exact four-digit / two-digit / two-digit shape before parsing.

## Relationships

- **`@domain-primitives/time`** – provides the `DAY_MS` constant used by `addDays` and `inclusiveDays`.
- **`@types`** – provides the `StatsInterval` union type (`'day' | 'week' | 'month'`) consumed by `bucketStart` and `nextBucket`.
- **`src/modules/stats/domain/index.ts`** – re-exports this module's public API for consumers within the stats domain.
- **`src/modules/stats/domain/range.ts`** – builds date ranges on top of the day primitives defined here.
- **`src/modules/stats/services/range.ts`** – the place where a calendar day is turned into a zoned instant; this file deliberately avoids that step.
- **`src/modules/stats/tests/unit/calendar.test.ts`** – unit tests covering parsing, formatting, arithmetic, bucketing, and edge cases (Feb 30, Dec→Jan rollover, Sunday-as-last-day).
- **`src/modules/stats/tests/unit/range.test.ts`** – exercises range logic that depends on the day-level functions exported here.

## Notes

- **Week is Monday-first.** `getUTCDay()` returns 0 for Sunday; the formula `(day + 6) % 7` shifts that to 6, so `bucketStart` snaps to the Monday on or before the given day.
- **`inclusiveDays` is not a duration.** It is a *count of days* (both endpoints included), so a single day yields `1`, not `0`.
- **`parseDay` is the only validation gate.** No other function checks for impossible dates; callers must use `parseDay` (or construct `CalendarDay` values by hand knowing they are valid).
- **No timezone logic lives here by design.** The module doc comment explicitly pushes that responsibility to `services/range.ts`; don't add `Intl` / `getTimezoneOffset` calls to this file.
