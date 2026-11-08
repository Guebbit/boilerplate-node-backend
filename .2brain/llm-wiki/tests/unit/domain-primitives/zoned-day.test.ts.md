---
source: tests/unit/domain-primitives/zoned-day.test.ts
sha256: 1b0a14f964aa31c4283f68157633bac1659b296182ce1babceb7a160503f1864
generated_at: 2026-11-08T10:04:47.661693+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/zoned-day.test.ts

## Purpose

Unit tests for the "zoned day boundary" primitives (`zonedStartOfDay`, `startOfDayInZone`, `dayInZone`). They pin down the exact UTC instant that corresponds to local midnight in an arbitrary IANA zone, including DST edge cases and the pathological case where midnight does not exist (Santiago's September spring-forward).

## Key elements

- **`zonedStartOfDay`** — tested with numeric (year, month, day) + IANA zone arguments. Verified to return the correct UTC instant for winter/summer offsets, half-hour zones, UTC itself, both sides of DST transitions, and the non-existent-midnight gap.
- **`startOfDayInZone`** — the string-date (`'YYYY-MM-DD'`) variant of the same operation. Tested for equivalence with the numeric form across Rome's DST edges and for round-tripping through `dayInZone`.
- **`dayInZone`** — used as the round-trip oracle: `dayInZone(startOfDayInZone(day, zone), zone) === day` must hold on every day around a transition.

## Relationships

- **`src/domain-primitives/time.ts`** — sole import source. Provides `zonedStartOfDay`, `startOfDayInZone`, and `dayInZone` under the `@domain-primitives/time` alias. This test file is the primary consumer verifying those three exports.

## Notes

- The Santiago test encodes a subtle contract: when local midnight falls inside a DST gap, the function returns the *first instant after* the gap (01:00 local) rather than throwing or clamping to the previous day. The round-trip (`dayInZone`) still yields the requested date.
- DST boundary tests use concrete 2026 calendar dates for Rome (Mar 29 / Oct 25) and Santiago (Sep 6) rather than parameterised "find the next transition" logic — the dates are intentionally fixed.
- `startOfDayInZone` accepts an ISO date string (`'2026-01-05'`), not a `Date` object.
