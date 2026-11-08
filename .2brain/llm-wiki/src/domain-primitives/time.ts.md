---
source: src/domain-primitives/time.ts
sha256: 884df2bc0262cb01f1736a538314c688751e86d057243090725539bd31d3d0cb
generated_at: 2026-11-08T03:16:08.421252+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/time.ts

## Purpose

A single, import-free module that centralises time-unit constants (minutes, hours, days in both ms and s) and a small set of zone-aware calendar helpers. It sits below every architectural tier so that `domain/` code, infrastructure adapters, and test doubles all share the same spellings of "a day" and the same logic for "the 5th in Rome" without pulling in a framework or a date library.

## Key elements

- **`MINUTE_MS`, `HOUR_MS`, `DAY_MS`** — duration constants in milliseconds, used for retention windows, cooldowns, and JS timers.
- **`HOUR_SECONDS`, `DAY_SECONDS`** — the same in seconds, for Mongo `expireAfterSeconds` and HTTP cache `max-age`.
- **`endOfUtcDay(instant)`** — returns `23:59:59.999` UTC of the instant's day; used so a printed "until the 5th" deadline isn't cut off at the 5th's first hour.
- **`oneCalendarMonthLaterUtc(instant)`** — same calendar day one month later at 00:00 UTC, clamped to the month's last day (EDPB "within one month" rule).
- **`dayInZone(instant, timeZone)`** — `YYYY-MM-DD` on the wall clock of the given IANA zone; avoids the off-by-a-day error of slicing `toISOString()`.
- **`yearInZone(instant, timeZone)`** — four-digit year from the zone's calendar (delegates to `dayInZone`).
- **`zonedStartOfDay(year, month, day, timeZone)`** — local-midnight instant for a zone, with a double-offset correction so DST spring-forward gaps are handled correctly.
- **`startOfDayInZone(day, timeZone)`** — convenience wrapper that parses a `YYYY-MM-DD` string into `zonedStartOfDay` (the inverse of `dayInZone`).
- **`wallClockAsUtc(instant, timeZone)`** *(private)* — reads a zone's wall-clock digits back as a UTC number; the building block for the offset calculation in `zonedStartOfDay`.

## Relationships

This file is a **leaf dependency** (it imports nothing). All listed neighbors consume its exports:

- **Duration constants** (`DAY_MS`, `HOUR_SECONDS`, etc.) are the shared vocabulary for TTLs and windows in `src/infrastructure/http/middlewares/cache.ts`, `src/infrastructure/adapters/queue.ts`, `src/infrastructure/runtime/database.ts` (Mongo TTL), `src/kernel/outbox.ts`, `src/infrastructure/adapters/orphaned-images.ts`, `src/app/jobs.ts`, and the scenario doubles (`fake.ts`, `levers.ts`).
- **Zone-calendar helpers** (`dayInZone`, `startOfDayInZone`, `zonedStartOfDay`) are the canonical way to convert between a user's calendar day and a stored instant; consumers include `src/infrastructure/i18n/config.ts` and any schema or service that groups by day or year in a non-UTC zone.
- **`src/app/config.ts`**, **`src/infrastructure/http/config.ts`**, and **`src/infrastructure/runtime/config.ts`** reference the constants when expressing default timeouts and retention values.
- **`scripts/docs/generate-cookie-table.ts`** uses the constants to render expiry durations in generated documentation.

## Notes

- **No imports, no side effects.** The file is safe to pull into any tier, including `domain/`, without introducing a dependency edge upward.
- **DST edge-cases are handled explicitly.** `zonedStartOfDay` performs two offset reads (guessed + corrected) and falls back to the earliest candidate that still reads as the requested day, covering zones that skip midnight. Callers should not "improve" this with a single `getTimezoneOffset()` call.
- **`dayInZone` and `yearInZone` pin `calendar: 'gregory'` and `numberingSystem: 'latn'`** via `Intl.DateTimeFormat`. Removing either option would break sortability or correctness in non-Latin-1 locales.
- **`oneCalendarMonthLaterUtc` uses the "day 0 of month+2" trick** (`Date.UTC(year, month + 2, 0)`) to get the last day of the target month. Don't replace with a lookup table.
- **Constants are `const`, not `enum` or class.** They are intentionally plain numbers so they tree-shake and so `domain/` code can do `7 * DAY_MS` without an import ceremony.
