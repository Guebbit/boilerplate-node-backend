---
source: src/domain-primitives/time.ts
sha256: e4196e5f9c3eb6d0fe28dbd8597dd3b5be4df8a452194a40d6eac8abaaf52cbc
generated_at: 2026-11-14T17:51:39.601324+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/time.ts

## Purpose

Centralises time-unit constants (minutes, hours, days in ms and seconds) and timezone-aware calendar helpers (zone day, zone year, zoned midnight, end-of-UTC-day, one-calendar-month-later). It sits below every architectural tier so that `domain/` rules—retention windows, deadline calculations, day-grouping—can express themselves as `7 * DAY_MS` or `dayInZone(instant, zone)` without pulling in a date library or an infrastructure dependency.

## Key elements

- **`MINUTE_MS`, `HOUR_MS`, `DAY_MS`** — duration constants in milliseconds; used in in-memory TTLs, cooldowns, and retention windows.
- **`HOUR_SECONDS`, `DAY_SECONDS`** — the same durations in seconds; used where the sink counts seconds (Mongo `expireAfterSeconds`, HTTP `Cache-Control: max-age`).
- **`endOfUtcDay(instant)`** — returns the last millisecond of the UTC calendar day containing `instant`; used so a printed "until the 5th" deadline isn't cut off at the 5th's first hour.
- **`oneCalendarMonthLaterUtc(instant)`** — returns midnight UTC of the same day one calendar month later, clamped to that month's last day (implements EDPB / Reg. 1182/71 month counting).
- **`dayInZone(instant, timeZone)`** — returns the `YYYY-MM-DD` date on the wall clock of the given IANA zone; uses `Intl.DateTimeFormat` with pinned locale, calendar, and numbering system for deterministic, sortable output.
- **`yearInZone(instant, timeZone)`** — extracts the four-digit calendar year from `dayInZone`; a thin wrapper for yearly series.
- **`zonedStartOfDay(year, month, day, timeZone)`** — returns the instant of local midnight for the given date in the given zone. Reads the zone offset twice (guess + correction) to survive DST transitions; resolves a nonexistent midnight by picking the earliest candidate that still reads as the requested day.
- **`startOfDayInZone(day, timeZone)`** — parses a `YYYY-MM-DD` string and delegates to `zonedStartOfDay`; the inverse of `dayInZone`.
- **`wallClockAsUtc`** (private) — internal helper that formats an instant in a zone and re-reads the digits as if they were UTC; the offset is the difference.

## Relationships

- **`src/app/config.ts`, `src/app/jobs.ts`, `src/modules/account/config.ts`** — import the ms/s constants to spell retention windows, job intervals, and account-lifecycle deadlines (`7 * DAY_MS`, `2 * HOUR_MS`, etc.).
- **`src/infrastructure/adapters/queue.ts`, `src/infrastructure/adapters/orphaned-images.ts`, `src/infrastructure/runtime/database.ts`** — import `HOUR_SECONDS` / `DAY_SECONDS` for Mongo TTL indexes (`expireAfterSeconds`) and queue-message lifetimes.
- **`src/infrastructure/http/middlewares/cache.ts`** — imports the second-constants for `Cache-Control: max-age` values.
- **`src/infrastructure/http/middlewares/idempotency.ts`, `src/infrastructure/http/middlewares/idempotency-model.ts`** — import the constants for idempotency-key expiry windows.
- **`src/kernel/outbox.ts`** — imports a duration constant for outbox-message retention.
- **`scenarios/support/doubles/payments/fake.ts`, `scenarios/support/doubles/payments/levers.ts`** — import the constants to build test dates and simulate time passage in payment scenarios.
- **`src/infrastructure/i18n/config.ts`** — may import `dayInZone` / `yearInZone` to resolve which calendar day or year a user's locale assigns to an instant.

## Notes

- **No external date library.** All helpers are built on `Date`, `Date.UTC`, and `Intl.DateTimeFormat`. If you need a feature that would normally come from dayjs/luxon, check whether a zone-calendar helper already covers it before adding a dependency.
- **`dayInZone` / `zonedStartOfDay` pin `en` locale, `gregory` calendar, and `latn` digits.** The output is stable regardless of host-locale or ICU version; do not relax these options.
- **`zonedStartOfDay` has a DST edge case.** If a zone springs forward *at* midnight (the requested midnight does not exist), the function returns the first instant after the gap. Callers that assume midnight always exists should be aware of this.
- **`oneCalendarMonthLaterUtc` is deliberately UTC-based.** The docstring cites EDPB Guidelines 01/2022 v2 ¶160 and Reg. 1182/71; it is a legal-compliance helper, not a generic "add a month" utility.
- **`wallClockAsUtc` is not exported.** It is a private helper used only by `zonedStartOfDay`; do not reach into the module's namespace expecting it.
