---
source: src/modules/stats/domain/calendar.ts
sha256: 4cd72b1960be489b8234ef28bf10e3e6b6be8454e4fd7286e91a7316e282ba2f
generated_at: 2026-11-08T08:24:11.842853+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/calendar.ts

## Purpose

Pure calendar-day arithmetic for the stats module. A "day" is just three numbers (year, month, day) with no clock time and no timezone. This file provides parsing, formatting, day-offset math, and bucketing (day / week / month) as simple, table-testable operations. Timezone awareness is intentionally deferred to `services/range.ts`, which converts a day into an instant.

## Key elements

- **`CalendarDay`** — interface `{ year, month, day }`; `month` is 1–12.
- **`parseDay(text)`** — parses a strict `YYYY-MM-DD` string; returns `CalendarDay | undefined`. Rejects impossible dates (e.g. `2026-02-30`) via a round-trip through `Date`.
- **`formatDay(day)`** — serialises a `CalendarDay` back to `YYYY-MM-DD` (zero-padded).
- **`addDays(day, amount)`** — shifts a day by `amount` whole days (negative goes back).
- **`inclusiveDays(from, to)`** — count of days from `from` to `to` inclusive; ≤ 0 when `to` precedes `from`.
- **`bucketStart(day, interval)`** — snaps a day to the first day of its bucket (`day` | Monday of its week | 1st of its month).
- **`nextBucket(start, interval)`** — advances a bucket start to the following bucket; handles Dec → Jan year rollover for months.
- **`toUtc` / `fromUtc`** — private helpers converting between `CalendarDay` and a UTC-midnight millisecond timestamp; the internal representation all arithmetic uses.

## Relationships

- **`src/domain-primitives/time.ts`** — supplies the `DAY_MS` constant used by `addDays` and `inclusiveDays`.
- **`src/types/index.ts`** — provides the `StatsInterval` union type consumed by `bucketStart` and `nextBucket`.
- **`src/modules/stats/services/range.ts`** — the layer where a `CalendarDay` is turned into a timezone-aware instant; this file deliberately stops short of that conversion.
- **`src/modules/stats/domain/range.ts`** — sibling domain module that builds time-range logic on top of the day primitives defined here.
- **`src/modules/stats/domain/index.ts`** — barrel that re-exports this module for external consumers.
- **`src/modules/stats/tests/unit/calendar.test.ts`** — unit tests covering parse/format/offset/bucket logic.
- **`src/modules/stats/tests/unit/range.test.ts`** — exercises calendar functions indirectly through range calculations.

## Notes

- `month` is **1-based** in the public API but 0-based inside `Date.UTC`; `toUtc`/`fromUtc` handle the off-by-one. Never pass `CalendarDay.month` directly to a `Date` method.
- Week buckets are **Monday-first**: `bucketStart` computes the offset with `(getUTCDay() + 6) % 7`, placing Sunday as the 7th day.
- `parseDay` validation relies on JavaScript `Date` normalisation (e.g. Feb 30 rolls to Mar 2), so the round-trip comparison is the *only* guard against invalid dates—there is no explicit leap-year table.
- `inclusiveDays` returns **0** (not a negative count) when `to` is exactly one day before `from`; it goes negative for larger gaps. Callers should treat any value ≤ 0 as an empty/invalid range.
