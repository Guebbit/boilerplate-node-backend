---
source: tests/unit/domain-primitives/year-in-zone.test.ts
sha256: 4b3c08b2a40cf4e7454132bb1712cc748dbbc0d2fedca5300f70f78e6edb0a23
generated_at: 2026-11-08T10:04:39.444378+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/year-in-zone.test.ts

## Purpose

Unit tests for the `yearInZone` helper, verifying that a given instant is mapped to the correct calendar year when interpreted in a specific IANA timezone. The tests focus on the boundary case: the same UTC instant can fall in different calendar years depending on the observer's zone.

## Key elements

- **`describe('yearInZone')`** — single test group importing `yearInZone` from `@domain-primitives/time`.
- **"puts 00:30 on 1 January in Rome into the new year…"** — asserts `yearInZone` returns 2027 for `2026-12-31T23:30Z` in `Europe/Rome`, while `getUTCFullYear()` is still 2026.
- **"keeps 23:30 on 31 December in New York in the old year…"** — asserts `yearInZone` returns 2026 for `2027-01-01T04:30Z` in `America/New_York`, while UTC is already 2027.
- **"agrees with UTC away from the boundary"** — sanity check: mid-year instant with zone `'UTC'` yields the same year as UTC.

## Relationships

- **`src/domain-primitives/time.ts`** — sole dependency; provides the `yearInZone(instant: Date, timeZone: string): number` function under test.

## Notes

- The tests are deliberately asymmetric (one boundary in each direction) to guard against off-by-one or sign errors in the zone-offset calculation.
- Uses IANA identifiers (`Europe/Rome`, `America/New_York`) rather than numeric UTC offsets, so correctness depends on the runtime's tz database (DST rules included).
- The "subject is the boundary" comment in the file header signals that this file exists specifically to pin down the year-boundary edge case, not general timezone conversion.
