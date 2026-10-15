---
source: src/modules/orders/domain/shop-time.ts
sha256: 55d8134ee8828df3a2469e911c223a05df37a3a279826855fde9cc7b58309a09
generated_at: 2026-10-15T11:02:25.968285+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/shop-time.ts

## Purpose

Pure calendar-math helpers that resolve a `Date` to wall-clock values (year, day boundaries) in an arbitrary IANA time zone. They exist so that yearly number series and day-boundary logic follow the *shop's* calendar rather than the server's UTC, and so that all `Intl.DateTimeFormat` timezone logic lives in one place.

## Key elements

- **`yearInZone(instant, timeZone)`** *(exported)* — Returns the four-digit Gregorian year visible on the wall clock in `timeZone`. Uses `Intl.DateTimeFormat('en', { timeZone, year: 'numeric', calendar: 'gregory' })` to avoid host-locale interference.
- **`wallClockAsUtc(instant, timeZone)`** *(module-private)* — Converts an instant into a `Date.UTC` number by reading its wall-clock digits in `timeZone` and re-interpreting them as UTC. The difference between this value and the true UTC epoch seconds yields the zone offset (DST included).
- **`zonedStartOfDay(year, month, day, timeZone)`** *(exported)* — Returns the `Date` instant of local midnight for the given calendar day. Reads the offset twice (at a UTC guess, then at the corrected instant) so DST transitions at or near midnight resolve correctly. A midnight that does not exist (spring-forward at 00:00) lands on the first instant after the gap.

## Relationships

- **`src/modules/orders/domain/index.ts`** — Barrel file; re-exports `yearInZone` and `zonedStartOfDay` for consumers within the orders domain.
- **`src/modules/orders/services/order-numbering.ts`** — Consumes `yearInZone` (and likely `zonedStartOfDay`) to derive the calendar year and day boundaries for order number sequences.
- **`src/modules/invoicing/services/numbering.ts`** — Parallel numbering service in the invoicing module; depends on the same year/day primitives.
- **`src/modules/stats/services/range.ts`** — Builds date ranges; uses `zonedStartOfDay` / `yearInZone` to anchor range boundaries in the shop's zone.
- **`src/modules/orders/tests/unit/shop-time.test.ts`** — Unit tests for the three functions above; relies on the zone-as-argument design (no timezone env setup).
- **`src/modules/orders/tests/integration/order-numbering.test.ts`**, **`src/modules/invoicing/tests/integration/issue-invoice.test.ts`**, **`src/modules/invoicing/tests/integration/issue-credit-note.test.ts`** — Integration tests that exercise numbering through the services that depend on this module.

## Notes

- All three functions are **pure**: the time zone is always passed in, so there is no hidden dependency on `process.env.TZ` or the host locale.
- `Intl.DateTimeFormat` is called with locale `'en'`, `calendar: 'gregory'`, and (for `wallClockAsUtc`) `numberingSystem: 'latn'` to guarantee bare Latin digits regardless of the host environment.
- `hourCycle: 'h23'` is used so midnight formats as `00`, not `24`.
- `zonedStartOfDay` performs the two-pass offset correction specifically to handle zones whose DST transition occurs exactly at midnight; a single-pass subtraction would miss the corrected offset.
- The file intentionally isolates every `Intl` call related to year/day resolution; other modules should import from here rather than calling `Intl.DateTimeFormat` directly for these concerns.
