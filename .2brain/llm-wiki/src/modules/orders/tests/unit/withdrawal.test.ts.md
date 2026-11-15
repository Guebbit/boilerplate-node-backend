---
source: src/modules/orders/tests/unit/withdrawal.test.ts
sha256: b8da0fc196b566d7fd1471fe4a3536f9d7a242a4a38b3c0dc82e528695094cd9
generated_at: 2026-11-14T20:58:24.123258+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/withdrawal.test.ts

## Purpose

Unit tests for the pure withdrawal-window rules that implement (as far as one order can express) Consumer Rights Directive Art. 9, 11a, and 16. The file exists to pin the exact calendar arithmetic, grace-period boundaries, and eligibility logic that the rest of the order module relies on, using only fixed-date inputs so every assertion is deterministic.

## Key elements

- **`withdrawalStartFor`** — verifies that the 14-day clock starts at delivery for physical goods and at `paidAt` for digital-only goods (falling back to delivery if `paidAt` is missing).
- **`withdrawUntilFrom`** — asserts that day 0 is excluded, the deadline lands on 23:59:59.999 UTC of the 14th day, and the result is independent of the event's time-of-day; includes a month-boundary case.
- **`withdrawalClosesAt`** — confirms the silent grace day: the window is still open through the full UTC day *after* the announced last day, and closes at 23:59:59.999 UTC of that grace day.
- **`conformityUntilFrom`** — 2-year statutory guarantee plus 7 days, tested across a leap-year delivery (29 Feb → 8 Mar).
- **`deliveryClockFor`** — checks that the withdrawal clock and the guarantee clock run independently (withdrawal from its own start, guarantee from arrival).
- **`canWithdraw`** — status-gating (never on `canceled`), open-window check including the last millisecond of the grace day, and closure one millisecond after.
- **`isBeforeDispatch`** — reads `fulfillment.shipped` as the source of truth over `status`; a `processing` order with partial shipment counts as dispatched.
- **`canCorrectAddress`** — open when units remain after a partial ship; closed once every unit has left, on shipped/delivered/canceled, or when no shipping address exists.
- **Art. 16 exclusions (`isExcludedFromWithdrawal`)** — line-level `noWithdrawal` flag; a mixed order still allows withdrawal of the eligible lines.
- **`withdrawalRefusalOf`** — returns the first applicable `WithdrawBlockedReason` (`all_excluded`, `window_closed`, `nothing_left`) or `undefined`; includes an explicit consistency loop proving it agrees with `canWithdraw` on every case.
- **`repairedConformityUntil`** — extends the guarantee by exactly 12 months preserving day and hour.
- **`withdrawalRefundDueBy`** — 14-day refund deadline computed in the *shop's* IANA timezone (e.g. `Europe/Rome`), not UTC.

## Relationships

- **`src/modules/orders/domain/withdrawal.ts`** — the implementation under test; every function asserted here is defined (or re-exported) there.
- **`src/modules/orders/domain/index.ts`** — the barrel import (`../../domain`) through which this file pulls the twelve functions, guaranteeing the public surface stays in sync.
- **`src/types/index.ts`** — source of the `OrderStatus` and `WithdrawBlockedReason` enums used throughout the assertions.

## Notes

- **Grace day is intentional and tested.** The window closes at 23:59:59.999 UTC of the day *after* the announced 14th day. Off-by-one regressions here are the main risk this file guards against.
- **`isBeforeDispatch` trusts `fulfillment.shipped` over `status`.** A `processing` order with `fulfillment: { shipped: true }` is treated as dispatched even though the status hasn't advanced. Tests encode this as a deliberate invariant.
- **`withdrawalRefundDueBy` is timezone-sensitive.** All other date helpers operate in UTC; this one converts through the shop's IANA zone before computing the deadline, so the final UTC instant differs (e.g. 22:59:59.999Z for UTC+1).
- **Fixed `NOW` constant.** The suite pins `2026-03-10T12:00:00Z` so millisecond-boundary assertions (grace-day open/closed) are reproducible.
- **Consistency contract.** The last `describe` block explicitly iterates shared cases and asserts `canWithdraw` is true iff `withdrawalRefusalOf` is `undefined` (and status ≠ `canceled`). Any future change to either function must keep them in lockstep.
