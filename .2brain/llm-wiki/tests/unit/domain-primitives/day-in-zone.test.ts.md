---
source: tests/unit/domain-primitives/day-in-zone.test.ts
sha256: 104cb45b6357713f47668b73484cf8746ca1949dff791344a6c5acacb48f9b98
generated_at: 2026-11-08T10:03:31.676808+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/day-in-zone.test.ts

## Purpose

Unit tests for `dayInZone`, verifying that a given instant resolves to the correct calendar day (as a `YYYY-MM-DD` string) in an IANA timezone, specifically at the UTC/zone boundary where the two disagree.

## Key elements

- **`describe('dayInZone')` suite** — three focused cases:
  - *Zone ahead of UTC:* `2026-01-04T23:30Z` → `'2026-01-05'` in `Europe/Rome`, while UTC is still the 4th.
  - *Zone behind UTC:* `2026-01-05T04:30Z` → `'2026-01-04'` in `America/New_York`, while UTC has already moved to the 5th.
  - *UTC identity + padding:* `2026-03-07T12:00Z` in `UTC` → `'2026-03-07'` (single-digit month/day are zero-padded).

## Relationships

- **`src/domain-primitives/time.ts`** — the sole import target; exports the `dayInZone(instant: Date, timeZone: string): string` function under test. This test file is the only unit test exercising that export.

## Notes

- The first test asserts the UTC day via `toISOString().slice(0, 10)` *before* the zone assertion, making the discrepancy explicit rather than relying on a single `toBe` in a vacuum.
- All test dates fall outside DST transition windows, so the tests isolate the simple offset shift and do not exercise DST edge cases.
- The function's return type is a zero-padded `YYYY-MM-DD` string (confirmed by the padding test case).
