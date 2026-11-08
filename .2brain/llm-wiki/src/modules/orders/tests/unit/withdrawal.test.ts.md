---
source: src/modules/orders/tests/unit/withdrawal.test.ts
sha256: 8491d4addf6ace2f37d801d3692d9cc22e12ce255091d883c8a07e811e9239d4
generated_at: 2026-11-08T07:15:42.179993+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/withdrawal.test.ts

## Purpose

Unit tests for the pure, side-effect-free withdrawal and conformity-window logic in the orders domain. Each test exercises a single exported function in isolation, pinning the exact date-boundary semantics (UTC day-end, month/year rollovers, the one-day "silent grace" period) that the Consumer Rights Directive Art. 9 / 11a / 16 rules imply for a single order.

## Key elements

- **`withdrawalStartFor`** — verifies the window opens at delivery for physical goods, at payment for digital goods, and falls back to delivery when `paidAt` is absent.
- **`withdrawUntilFrom`** — pins that the 14-day count excludes the event day, always ends at `23:59:59.999Z` UTC, and is independent of the event's time-of-day; includes a month-boundary case.
- **`withdrawalClosesAt`** — the "silent grace day": the UTC day *after* the announced last day still counts; tested across a month and year boundary (2026-12 → 2027-01-01).
- **`conformityUntilFrom`** — two-year statutory guarantee; ends at day 7 after the same calendar date two years later (leap-year 29 Feb case included).
- **`deliveryClockFor`** — composes `withdrawUntilFrom` (from delivery) and `conformityUntilFrom` (from arrival) into a single clock object.
- **`canWithdraw`** — boolean gate: true for non-canceled orders within or on the grace day; false once the grace day has fully elapsed (off-by-one at the millisecond level).
- **`isBeforeDispatch`** — status-based *plus* fulfillment-based check; a partially-shipped `processing` order is treated as past the shop's hands.
- **`canCorrectAddress`** — open only when at least one unit remains unshipped *and* a `shippingAddress` is present.
- **`isExcludedFromWithdrawal`** — per-line `product.noWithdrawal` flag; a mixed order is still partially withdrawable.
- **`withdrawalRefusalOf`** — returns a `WithdrawBlockedReason` (`all_excluded`, `window_closed`, `nothing_left`) or `undefined`; first matching reason wins; a final test asserts it is the logical complement of `canWithdraw`.
- **`repairedConformityUntil`** — extends the guarantee by 12 months, preserving month/day/hour.

## Relationships

- **`src/modules/orders/domain/index.ts`** — barrel re-export the test imports from (`../../domain`); the test never reaches into `withdrawal.ts` directly.
- **`src/modules/orders/domain/withdrawal.ts`** — implementation module whose functions the test exercises; any signature or return-shape change here will surface as a test failure.
- **`src/types/index.ts`** — supplies the `OrderStatus` and `WithdrawBlockedReason` enums used throughout the assertions; renaming or adding members here affects the test's `it.each` tables.

## Notes

- All dates are **UTC**; the `.999Z` millisecond suffix is the canonical "end of day" sentinel used in every boundary assertion.
- The fixed `NOW` constant (`2026-03-10T12:00:00Z`) makes the suite deterministic; no `jest.useFakeTimers` or `Date.now()` mocking is used.
- The "grace day" is *not* a configuration flag — it is a hard-coded one-day extension inside `withdrawalClosesAt`. If the legal requirement changes, both the implementation and these boundary tests (the `NOW - DAY_MS - 1` cases) must move together.
- `withdrawalRefusalOf` returns `undefined` for **canceled** orders even when items are excluded, because the UI never renders the button on a canceled order; the test explicitly locks this in.
- The "agrees with `canWithdraw`" test at the bottom of the file is a cross-check: it asserts the two functions are logical complements for non-canceled orders. Adding a new blocked-reason enum member without updating `canWithdraw` will break it.
