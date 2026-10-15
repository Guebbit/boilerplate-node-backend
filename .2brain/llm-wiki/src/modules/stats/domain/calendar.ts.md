---
source: src/modules/stats/domain/calendar.ts
sha256: 8546065a6691abb0ac481a96253a3d98ad729e1aac8f4044203f1618d4d58314
generated_at: 2026-10-15T12:03:03.488494+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/calendar.ts

## Purpose

Pure calendar-day arithmetic with no clocks or time zones. A day is just `{year, month, day}`; all internal math runs on UTC-midnight timestamps so DST is never a concern. This module supplies the date primitives (parsing, formatting, shifting, bucketing) that the stats range layer builds on.

## Key elements

- **`CalendarDay`** — `{year, month, day}` with `month` 1–12 (not JS's 0-based).
- **`CalendarInterval`** — `'day' | 'week' | 'month'`, the bucket sizes a report can request.
- **`parseDay(text)`** — parses `YYYY-MM-DD`; returns `undefined` for malformed or impossible dates (e.g. `2026-02-30`) via a UTC round-trip check.
- **`formatDay(day)`** — writes `YYYY-MM-DD` with zero-padding.
- **`addDays(day, amount)`** — shifts a day by N whole days (negative goes back).
- **`inclusiveDays(from, to)`** — whole-day span inclusive at both ends; ≤ 0 if `to` precedes `from`.
- **`bucketStart(day, interval)`** — snaps to the first day of the day/week/month bucket. Weeks are **Monday-first** (Sunday is the last day of the week).
- **`nextBucket(start, interval)`** — advances to the start of the following bucket (handles year rollover for months).
- Internal: `toUtc` / `fromUtc` convert between `CalendarDay` and a UTC-midnight timestamp; `DAY_MS` = 86 400 000.

## Relationships

- **`domain/index.ts`** — re-exports this module's public API (`CalendarDay`, `CalendarInterval`, the functions above) so consumers import from the domain barrel.
- **`domain/range.ts`** — defines `CalendarRange` (from/to `CalendarDay`) and interval-related types that consume `CalendarInterval`; `bucketStart`/`nextBucket` are the primitives a range iterator would call.
- **`services/range.ts`** — the layer where a `CalendarDay` becomes an actual instant (UTC timestamp) for API transport; the doc comment here explicitly defers zone handling to that service.
- **`tests/unit/calendar.test.ts`** — unit tests covering every export (parsing, round-tripping, shifting, bucket boundaries, month/year rollovers).
- **`tests/unit/range.test.ts`** — tests the range layer; depends on calendar types and bucket helpers indirectly.

## Notes

- **Week convention:** `bucketStart` uses a Monday-first week (`getUTCDay()` shifted by +6, mod 7). Any consumer assuming Sunday-first will get off-by-one results.
- **`month` is 1-based** in `CalendarDay` but `Date`'s `getUTCMonth`/`setUTCMonth` are 0-based; the `toUtc`/`fromUtc` helpers handle the offset — don't bypass them.
- **`parseDay` returns `undefined`**, not a throw. Callers must null-check before using the result.
- **All arithmetic is integer-millisecond over UTC**, so no DST drift is possible; however, this also means the module is intentionally *zone-agnostic* — attach a zone only at the service boundary.
- **`inclusiveDays`** is +1 (both endpoints counted). Use `addDays`-based math if you need exclusive spans.
