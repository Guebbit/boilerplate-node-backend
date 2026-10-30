---
source: src/modules/orders/tests/unit/withdrawal.test.ts
sha256: c3ab12227a10bfbcedfe789bb853a5e911d2f43602f3ee892708979605a738bb
generated_at: 2026-10-29T05:01:30.235222+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/withdrawal.test.ts

## Purpose

Unit tests for the pure withdrawal-window domain rules (Consumer Rights Directive Art. 9, 11a, 16). The file pins down the exact date arithmetic, status gates, and exclusion logic that determine whether a buyer can exercise a right of withdrawal, how long the window lasts, and what reason is reported when it is denied.

## Key elements

- **`withdrawalStartFor` tests** — physical goods: window starts at delivery; digital: starts at payment; unpaid digital falls back to delivery.
- **`withdrawUntilFrom` tests** — 14-day window ends at `23:59:59.999Z` of the 14th calendar day after the event; result is time-of-day-independent; crosses month boundaries correctly.
- **`withdrawalClosesAt` tests** — adds one silent grace day (full UTC day) after the announced last day; verified across month and year boundaries.
- **`conformityUntilFrom` tests** — 2-year conformity period, ending on the 7th day after the anniversary; leap-year edge (29 Feb → 8 Mar).
- **`deliveryClockFor` tests** — withdrawal clock runs from its own start; conformity clock runs from arrival, independently.
- **`canWithdraw` tests** — `true` for pending/paid/processing/shipped/delivered before window opens; `false` for cancelled; boundary cases at the last millisecond of the grace day.
- **`isBeforeDispatch` tests** — status-based (pending/paid/processing = true; shipped/delivered/cancelled = false) with an override: partial shipment (`fulfillment.shipped = true`) flips a processing order to `false`.
- **`canCorrectAddress` tests** — open when nothing shipped or units remain after a partial shipment; closed when all units left, shipped, delivered, cancelled, or no shipping address.
- **Art. 16 exclusion tests** — `isExcludedFromWithdrawal` per line; `canWithdraw` is `false` only when *all* lines are excluded, `true` if at least one line is eligible.
- **`withdrawalRefusalOf` tests** — returns `undefined` when withdrawal is offered; `all_excluded`, `window_closed`, or `nothing_left` otherwise; first-reason-wins ordering; final consistency check against `canWithdraw`.
- **`repairedConformityUntil` tests** — extends the conformity deadline by exactly 12 months, preserving day-of-month and time.

## Relationships

- **`src/modules/orders/domain/index.ts`** — the barrel file from which every tested function is imported (`canCorrectAddress`, `canWithdraw`, `conformityUntilFrom`, `deliveryClockFor`, `isBeforeDispatch`, `isExcludedFromWithdrawal`, `repairedConformityUntil`, `withdrawalClosesAt`, `withdrawalRefusalOf`, `withdrawalStartFor`, `withdrawUntilFrom`). This file is the sole SUT.
- **`src/modules/orders/domain/withdrawal.ts`** — the implementation module that the barrel re-exports; these tests exercise its public API directly.
- **`src/types/index.ts`** — provides the `OrderStatus` enum and `WithdrawBlockedReason` enum used to construct order fixtures and assert refusal codes.

## Notes

- All tests use a frozen `NOW` (`2026-03-10T12:00:00Z`) for determinism; no test calls `Date.now()`.
- The "silent grace day" (one full UTC day after the announced last day) is a deliberate product rule, not a bug; `canWithdraw` and `withdrawalRefusalOf` must agree on it.
- `isBeforeDispatch` checks the *fulfillment* object, not just the status: a processing order with `shipped: true` is treated as past dispatch, preventing a refund of goods the buyer already holds.
- `withdrawalRefusalOf` returns `undefined` (not `null`) when withdrawal *is* offered; the final consistency loop asserts `canWithdraw` is `true` iff the reason is `undefined` and status is not `cancelled`.
- Tests are organized by function under `describe` blocks, with `it.each` for status-parameterized cases — keep that pattern when adding new statuses.
