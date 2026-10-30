---
source: src/modules/orders/domain/withdrawal.ts
sha256: 1c451453dc89fd1016f19e58474345416b17f5da7e1fcf9c4a6eddd2b3732f21
generated_at: 2026-10-29T04:41:34.473840+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/withdrawal.ts

## Purpose

Pure domain logic for the right of withdrawal (Consumer Rights Directive Art. 9, 11a) and the statutory guarantee of conformity (Directive 2019/771 / 2019/770). Given only an order's status, lines, and timestamps, it computes when the withdrawal window opens and closes, whether the button may show, when the guarantee expires, and whether a withdrawal is a cancel or a return. No I/O, no side effects.

## Key elements

- **`isBeforeDispatch(order)`** — Whether a withdrawal is a cancel (nothing shipped) vs. a return. Reads `fulfillment.shipped`, not the order status, so a partially-shipped order that is still `processing` is treated as dispatched.
- **`canCorrectAddress(order)`** — Whether staff may still redirect an unshipped remainder to a new address.
- **`withdrawUntilFrom(start, days)`** — The *announced* last calendar day (end-of-UTC-day) of the withdrawal window.
- **`withdrawalClosesAt(withdrawUntil)`** — The *real* close: one silent UTC day after the announced date, so a one-day counting discrepancy never blocks a buyer.
- **`conformityUntilFrom(deliveredAt)`** — The legal 2-year guarantee deadline, including a 7-day margin for UTC-offset and weekend-rollover.
- **`repairedConformityUntil(current)`** — Extends the guarantee by 12 months after a repair (Directive 2024/1799).
- **`withdrawalStartFor(order, at)`** — Clock start: `paidAt` for digital-only orders (Art. 9(2)(c)), arrival for goods (Art. 9(2)(b)).
- **`deliveryClockFor(order, at, days)`** — Freezes both deadlines (`DeliveryClock`) at delivery time.
- **`isExcludedFromWithdrawal(line)`** — Art. 16(c)–(d) exclusion (made-to-order, personalised, perishable), read from the product flag frozen at checkout.
- **`withdrawalRefusalOf(order, now)`** — Single source of the refusal reason (`all_excluded` | `window_closed` | `nothing_left`) shared by the UI button and the `POST /returns` endpoint.
- **`canWithdraw(order, now)`** — Convenience: status is withdrawable **and** no refusal applies.

## Relationships

- **`@domain-primitives/time`** — Supplies `DAY_MS` and `endOfUtcDay` used by every date arithmetic.
- **`./status-traits`** — Reads `ORDER_STATUS_TRAITS` for `beforeDispatch` and `withdrawable` flags per status.
- **`./rules`** — Calls `isDigitalOnlyOrder` and uses the `ShippableLineCandidate` type to decide the clock-start rule.
- **`./fulfillment`** — Uses the `FulfillmentSummary` shape (`shipped`, `remaining`) in candidate interfaces.
- **`./index.ts`** — Re-exports this module's public surface for the rest of the orders module.
- **`services/actions.ts`, `services/status.ts`, `services/guarantee.ts`, `services/address.ts`** — Consume the pure functions above to build API responses and side-effects.
- **`emails.ts`** — Reads `withdrawUntil` / `conformityUntil` to render dates in customer mail.
- **`repository.ts`** — Persists the frozen `DeliveryClock` values on the order row.
- **`tests/integration/timeline.test.ts`, `tests/integration/override-sync.test.ts`, `tests/integration/service.test.ts`** — Exercise these functions through the order lifecycle.

## Notes

- **Announced vs. real deadline.** `withdrawUntil` is the date shown to the buyer; `withdrawalClosesAt` (one UTC day later) is the enforcement instant. Code that checks "is it still open?" must use `withdrawalClosesAt`, not `withdrawUntil`.
- **Calendar days, not 24 h.** Periods follow Regulation 1182/71 Art. 3: the event-day is excluded, the period ends at 23:59:59 UTC of the last day. Weekend/holiday rollover (Art. 3(4)) is intentionally *not* computed — the configured minimum always exceeds it.
- **Guarantee margin is asymmetric.** `conformityUntilFrom` adds 7 days past the 2-year anniversary; `repairedConformityUntil` adds exactly 12 months. Do not confuse them.
- **Digital vs. goods clock.** `withdrawalStartFor` picks `paidAt` or arrival based on `isDigitalOnlyOrder`. Calling `withdrawUntilFrom` with the wrong start silently shifts the deadline.
- **`isBeforeDispatch` ignores status.** A partially-shipped order is still `processing` by status but is *not* before dispatch — the check is `fulfillment.shipped !== true`.
