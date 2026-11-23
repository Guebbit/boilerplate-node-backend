---
source: src/domain-primitives/time.ts
source_sha256: 17bc14bbf90cd5d9d560845383694839674e2a0148d1090da4b414ac00e9334b
context_sha256: a1e2553718c364e5f0cd98e34f43eac4162c78703626fb13b7149e6e971482a8
generated_at: 2026-11-22T02:33:10.441422+00:00
model: claude-code:claude-sonnet-5-5
---

# src/domain-primitives/time.ts

## Purpose
Single home for time-unit constants and zone-aware calendar helpers. It sits below every tier (so `domain/` code can use it without importing a module) and lets retention windows, cooldowns, TTLs and deadlines be written as `7 * DAY_MS` or `days * DAY_SECONDS`. It has no imports and relies only on `Date` and `Intl.DateTimeFormat`.

## Key elements
- `MINUTE_MS`, `HOUR_MS`, `DAY_MS` – unit lengths in milliseconds.
- `HOUR_SECONDS`, `DAY_SECONDS` – unit lengths in seconds, for Mongo `expireAfterSeconds` and HTTP cache TTLs.
- `endOfUtcDay(instant)` – `23:59:59.999` UTC of the day the instant falls in. A deadline printed as a date should not end before that date does.
- `oneCalendarMonthLaterUtc(instant)` – midnight UTC of the same day next month, clamped to the month's last day (5 Mar → 5 Apr, 31 Aug → 30 Sep). It follows the EDPB "within one month" counting (Guidelines 01/2022 v2 ¶160, Reg. 1182/71).
- `dayInZone(instant, timeZone)` – the `YYYY-MM-DD` calendar day on the zone's wall clock. The result sorts as text. It uses `Intl.DateTimeFormat` with the `en` locale, `gregory` calendar and `latn` digits.
- `yearInZone(instant, timeZone)` – the zone's calendar year, derived from `dayInZone`.
- `zonedStartOfDay(year, month, day, timeZone)` – local midnight of a day in the zone as an instant. Month is 1–12.
- `startOfDayInZone(day, timeZone)` – parses a `YYYY-MM-DD` string and calls `zonedStartOfDay`. It is the inverse of `dayInZone`.
- `wallClockAsUtc` (private) – reads the zone's wall-clock fields as if they were UTC. The difference from the real instant is the zone's offset, DST included.

## Relationships
Listed neighbors are in the dependency graph and sit on both sides of it. The file itself imports nothing, so the relationships point inward. The stated purposes of the constants are:
- Retention, cooldown and lifetime windows, Mongo TTLs and HTTP cache TTLs. Config, jobs, queue, cache, idempotency, outbox, job-store and database files such as `src/app/config.ts`, `src/infrastructure/http/middlewares/cache.ts`, `src/infrastructure/http/middlewares/idempotency.ts`, `src/kernel/outbox.ts` and `src/infrastructure/persistence/job-store.ts` are likely consumers of the unit constants. The file content does not confirm which symbols each one uses.
- The zone helpers are intended for rules that group by day, number by year, or end a deadline at the end of a printed day.

## Notes
- `zonedStartOfDay` reads the offset twice (at the UTC guess and at the corrected instant) so that a midnight on the far side of a DST change lands correctly. If midnight doesn't exist because a zone springs forward at midnight, it returns the first instant after the gap.
- `dayInZone` avoids `toISOString().slice(0, 10)` on purpose. 00:30 on the 5th in Rome is still the 4th in UTC.
- `startOfDayInZone` does no validation of its input. It assumes the request schema already checked `format: date`.
- `timeZone` must be a canonical IANA zone name, for example `Europe/Rome`.
- `wallClockAsUtc` uses `hourCycle: 'h23'` so midnight is `00`, not `24`.
- `zonedStartOfDay` uses `toSorted`, which needs a runtime that supports ES2023 array methods.
