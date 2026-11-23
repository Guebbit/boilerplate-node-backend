---
source: src/modules/orders/tests/unit/purchase-hold.test.ts
source_sha256: 4a9122483a7c39c39407554dba66783e0d8d4361df10c7d07d42518a19c1df72
context_sha256: c0759d15e72d392e567fd22416c235a3487768c147ee2d9a420ed0a6c563e0d5
generated_at: 2026-11-22T06:37:27.895856+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/purchase-hold.test.ts

## Purpose
Unit tests for `purchaseHoldUntil`, the pure rule that decides when a buyer's own cancellations amount to a purchase hold. The clock, the cancel limit and the window are all passed as arguments, so the tests run against a fixed `NOW` (`2026-10-19T12:00:00.000Z`) with no clock mocking.

## Key elements
- `NOW`: the fixed instant the hold is judged at.
- `daysAgo(days)`: helper that builds a `Date` that many days (using `DAY_MS`) before `NOW`.
- `describe('purchaseHoldUntil')`: tests the core rule, called as `purchaseHoldUntil(cancelTimes, limit, windowDays, now)`:
  - Returns `undefined` below the limit, with no cancels, and when a cancel is older than the window.
  - A cancel exactly one window old counts as aged out.
  - At exactly the limit, the hold ends at the oldest counted cancel plus the window.
  - Above the limit, the hold ends when the count falls back below the limit, i.e. at the second-oldest cancel plus the window in the 4-cancels/limit-3 case.
  - The result is independent of input order (checked against the reversed array, using `toReversed()`).
- `describe('the 7-day cap on an automatic hold')`:
  - A 90-day window still yields `now + 7 days`.
  - An end already sooner than the cap is kept (6.5-day-old oldest cancel gives an end 12 hours out).
  - An end exactly 7 days away is kept (14-day window, oldest cancel 7 days ago).

## Relationships
- Imports `purchaseHoldUntil` from `../../domain` (`src/modules/orders/domain/index.ts`), which exposes the implementation in `purchase-hold.ts`.
- Imports `DAY_MS` from `@domain-primitives/time` (`src/domain-primitives/time.ts`) to build dates and expected values.

## Notes
- The 7-day cap is tested only through `purchaseHoldUntil`'s result. The tests pass no cap argument, so the cap is fixed inside the function.
- `toReversed()` requires a runtime that supports it (ES2023).
