---
source: src/modules/orders/domain/purchase-hold.ts
source_sha256: a23fec60819190754c884b18d5d9c67eef4a7c7b4943740547f0e1244fc55d7d
context_sha256: 450d87571880fd6aa9eb3bf4a09ae8cc845701ce33f44620346b2b473bccd7bc
generated_at: 2026-11-22T06:12:32.205032+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/purchase-hold.ts

## Purpose
Pure domain logic that decides when a buyer's own cancellations amount to a purchase hold, and when that hold ends. The times, limit and window are all passed as arguments, so unit tests need no clock or database.

## Key elements
- `AUTOMATIC_PURCHASE_HOLD_MAX_DAYS` (`7`): the longest an automatic hold can last. It is a constant, not a setting, and is justified in the source by GDPR Art. 22 (keeping a machine-made decision temporary). Manual holds have no maximum, and the review flag outlives the pause until staff act.
- `purchaseHoldUntil(cancelTimes, limit, windowDays, now)`: returns the `Date` at which the hold ends, or `undefined` if no hold applies.
  - Keeps only cancellations strictly newer than `now - windowDays` and sorts them oldest first.
  - Returns `undefined` if fewer than `limit` remain.
  - Otherwise the end is `counted[count - limit] + window`, which is the moment the count would drop back under the limit.
  - The end is capped at `now + 7 days`. An earlier end is kept as is.

## Relationships
- Imports `DAY_MS` from `src/domain-primitives/time.ts` to convert days to milliseconds.
- `src/modules/orders/services/purchase-hold.ts` is a neighbor in the dependency graph. Its role is not shown in this file, but the doc comments imply the caller supplies the already-filtered cancellation times.
- `src/modules/orders/domain/index.ts` is a neighbor in the dependency graph. This file does not show how it is re-exported.
- `src/modules/orders/tests/unit/purchase-hold.test.ts` is the unit suite the pure design serves.

## Notes
- `cancelTimes` must already be narrowed to cancellations after the last hold or staff lift. This function only applies the window filter.
- Input order does not matter, because the function sorts internally. It uses `toSorted`, so the input array is not mutated.
- `limit` is assumed to be at least 1. The `counted[counted.length - limit]` index is safe only because of the preceding `counted.length < limit` check.
- Because the window defaults to 7 days, the cap only bites when the window is raised above 7.
