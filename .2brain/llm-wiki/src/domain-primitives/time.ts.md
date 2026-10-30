---
source: src/domain-primitives/time.ts
sha256: 97d871df58680a2be271a114f59987a3d7b1b033f78eac732d90c7679fab2d4a
generated_at: 2026-10-29T01:52:23.060575+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/time.ts

## Purpose

Single source of truth for time-unit constants and timezone-aware day boundary calculations. It sits below every architectural tier (in `domain-primitives/`) so that `domain/` files can express retention windows, cooldowns, and shop-day groupings in whole days without importing an infrastructure module. It also provides the EDPB-compliant "one calendar month later" rule and DST-safe local-midnight computation that deadline logic depends on.

## Key elements

- **`HOUR_MS`** / **`DAY_MS`** — Millisecond constants (3 600 000 / 86 400 000). The idiomatic way to write durations: `7 * DAY_MS`.
- **`endOfUtcDay(instant)`** — Returns `23:59:59.999` UTC of the day containing `instant`. Used so a printed date deadline ("until the 5th") is not cut off at the 5th's first hour.
- **`oneCalendarMonthLaterUtc(instant)`** — Returns midnight UTC one calendar month later, clamped to the last day of the target month (e.g. Aug 31 → Sep 30). Implements EDPB Guidelines 01/2022 ¶160 / Reg. 1182/71 month counting.
- **`dayInZone(instant, timeZone)`** — Returns the calendar day as a sortable `YYYY-MM-DD` string on the wall clock of the given IANA zone. Uses `Intl.DateTimeFormat` with pinned `gregory`/`latn` to avoid locale drift.
- **`zonedStartOfDay(year, month, day, timeZone)`** — Returns the `Date` instant of local midnight in the given zone. Reads the zone offset twice (at the UTC guess and at the corrected instant) so DST transitions at or near midnight resolve correctly. Nonexistent midnights (spring-forward at 00:00) land on the first instant after the gap.
- **`wallClockAsUtc(instant, timeZone)`** — *private* helper: reinterprets the zone's wall-clock digits as UTC to extract the offset at a given instant.

## Relationships

Every graph neighbor imports one or more of the exports above:

- **Account tier** (`config.ts`, `session/config.ts`, `session/device-cookie.ts`, `token-types.ts`, `services/export-job.ts`, `services/reap-inactive.ts`) — use `DAY_MS` / `HOUR_MS` to spell session lifetimes, cookie expirations, token TTLs, export-job retention, and inactivity-reaping windows.
- **Delivery tier** (`domain/fulfillment.ts`, `domain/lost.ts`, `domain/preorder.ts`, `repository.ts`, `services/digest.ts`, `services/retention.ts`) — use `endOfUtcDay` for printed-date deadlines (withdrawal windows, answer deadlines), `dayInZone` to group events by the shop's calendar day, and `DAY_MS` for retention windows and digest cadence.
- **Invoicing tier** (`domain/retention.ts`, `jobs.ts`) — use `oneCalendarMonthLaterUtc` for EDPB-compliant retention cutoffs and `DAY_MS` for job scheduling intervals.
- **Infrastructure** (`adapters/queue.ts`) — uses `HOUR_MS` / `DAY_MS` for queue TTL / job-expiry constants.

## Notes

- **No runtime imports.** The module is pure — no `import` statements — so it is safe to reference from any tier including `domain/`, where importing infrastructure modules would violate layering.
- **`dayInZone` vs `toISOString().slice(0,10)`.** The latter slices in UTC and will assign the wrong calendar day for any non-UTC shop zone (e.g. Rome at 00:30 is still the previous UTC day). Always use `dayInZone` when the day must reflect the shop's wall clock.
- **`zonedStartOfDay` double-offset read.** The function calls `wallClockAsUtc` twice (at the naive guess and the corrected instant). This is intentional and necessary for zones whose DST switchover falls exactly on midnight.
- **`oneCalendarMonthLaterUtc` uses `Date.UTC(year, month+2, 0)`.** Day 0 of month+2 is JS's idiom for "last day of month+1"; don't refactor to `new Date` without preserving the UTC basis.
- **Constants are integers.** `DAY_MS` is exactly 86 400 000 ms (24 h). DST is irrelevant to the constant itself; timezone awareness lives in the zone-aware functions.
