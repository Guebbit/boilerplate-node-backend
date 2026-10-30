---
source: src/modules/orders/tests/unit/shop-time.test.ts
sha256: eff0f1897136698c906f0ddde4a09643ee85cb62b62a46e36c07db1aab52b8c5
generated_at: 2026-10-29T05:00:44.635283+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/shop-time.test.ts

## Purpose

Unit tests for the `yearInZone` helper, verifying that a single UTC instant is attributed to the correct calendar year when viewed through a shop's IANA timezone—specifically around the year boundary where UTC and the local zone disagree.

## Key elements

- **`describe('yearInZone')`** — top-level block; one suite, three specs.
- **Rome boundary test** — asserts that `2026-12-31T23:30:00Z` is still 2026 in UTC but already 2027 in `Europe/Rome` (positive offset crosses into the new year).
- **New York boundary test** — asserts that `2027-01-01T04:30:00Z` is already 2027 in UTC but still 2026 in `America/New_York` (negative offset lags behind).
- **UTC identity test** — asserts `yearInZone` agrees with `getUTCFullYear()` when the zone is `UTC` itself, confirming no accidental offset is applied.

## Relationships

- **Imports** `yearInZone` from `src/modules/orders/domain/shop-time.ts` — the sole production dependency under test. No other modules are referenced.

## Notes

- Tests use IANA zone identifiers (`Europe/Rome`, `America/New_York`) rather than fixed UTC offsets, so correctness depends on the runtime's IANA tz database. A zone with DST in late December/January (e.g. `Australia/Adelaide`) would shift the effective offset; these particular zones have a constant offset around the tested instants.
- The two boundary cases are intentionally symmetric: one where the local year is *ahead* of UTC, one where it is *behind*, so a naïve implementation that only checks one direction is caught.
- The `expect(instant.getUTCFullYear()).toBe(...)` lines in each boundary test are not redundant—they pin the UTC side of the comparison so a future change to the fixture date is immediately visible.
