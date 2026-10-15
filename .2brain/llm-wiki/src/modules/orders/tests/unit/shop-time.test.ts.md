---
source: src/modules/orders/tests/unit/shop-time.test.ts
sha256: 905c554916accdc8f2d2f80325a02c22630f3a0e5ed771387f4257449c32ab80
generated_at: 2026-10-15T11:21:01.008868+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/shop-time.test.ts

## Purpose

Unit tests for the `shop-time` domain module. They pin down the two timezone-sensitive primitives that the orders module relies on to determine "which year does this order belong to" and "what UTC instant is local midnight in the shop's zone," ensuring that year-boundary and DST-transition edge cases are handled correctly.

## Key elements

- **`describe('yearInZone', …)`** — verifies that `yearInZone(instant, tz)` returns the calendar year in the target zone even when UTC disagrees (e.g. `2026-12-31T23:30Z` → 2027 in Rome, 2026 in New York the next morning), and that it agrees with UTC when the zone *is* UTC.
- **`describe('zonedStartOfDay', …)`** — verifies that `zonedStartOfDay(year, month, day, tz)` returns the UTC `Date` for local 00:00 in the target zone. Covers:
  - Winter vs. summer offsets in Rome (1 h vs. 2 h behind UTC).
  - DST spring-forward (2026-03-29) and fall-back (2026-10-25) boundaries in Rome.
  - Zones behind UTC (New York), a half-hour offset (Kolkata, +5:30), and UTC itself.

## Relationships

- **`src/modules/orders/domain/shop-time.ts`** — the sole import target; this test file exercises `yearInZone` and `zonedStartOfDay` exported from that module. No other files are imported or produced.

## Notes

- The tests use concrete future dates in 2026/2027 rather than "today-relative" values, making them deterministic and safe against the passage of time.
- DST assertions are tied to specific IANA transition dates (Rome: Mar 29, Oct 25, 2026). If Europe changes its DST rules these tests will fail; that is intentional — they document the *expected* behaviour under the current IANA database.
- `zonedStartOfDay` is called with numeric `(year, month, day)` arguments, not a `Date`, so the contract is "give me the instant for local midnight on that calendar date in that zone."
