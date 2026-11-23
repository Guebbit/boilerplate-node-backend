---
source: src/modules/orders/domain/withdrawal.ts
source_sha256: afe746645b5bfd37c2fb24861d3858a02c1a5eb4d1cbd9e5cc001f9c50a13023
context_sha256: 09f90dd5f613116b5458b054927b9aa8a8c1371340800c17aa0ec3a374b354e8
generated_at: 2026-11-22T06:14:09.494106+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/withdrawal.ts

## Purpose
Pure domain logic for the consumer right of withdrawal (Consumer Rights Directive Art. 9 and 11a) as far as an order alone can answer it: when the withdrawal window closes, when related legal deadlines fall, and whether a withdrawal is currently allowed. It has no I/O. The window is absent until the clock starts. For goods the clock starts at delivery, and for digital content at the conclusion of the contract.

## Key elements
- `isBeforeDispatch(order)` – true if the status trait `beforeDispatch` holds and `fulfillment.shipped` is not true. A withdrawal then counts as a cancel rather than a return. It reads `shipped`, not `processing`, so a partly shipped order is not refunded whole.
- `canCorrectAddress(order)` – true if the order has a shipping address, its status is before dispatch, and it is either not fully shipped or has `remaining > 0` units.
- `withdrawUntilFrom(start, days)` – the announced last day: the end of the UTC day `days` after `start`.
- `withdrawalClosesAt(withdrawUntil)` – the real refusal point, one extra UTC day (`DAY_MS`) after the announced date.
- `WITHDRAWAL_SEND_BACK_DAYS` and `WITHDRAWAL_REFUND_DAYS` – both 14 (Directive Arts. 14(1) and 13(1)).
- `withdrawalRefundDueBy(informedAt, timeZone)` – the last millisecond of the shop-zone day that is 14 days after the day the shop was informed.
- `conformityUntilFrom(deliveredAt)` – the end of the guarantee of conformity: two years plus a 7-day margin, to the end of that UTC day.
- `repairedConformityUntil(current)` – adds 12 months to the current guarantee end.
- `withdrawalStartFor(order, at)` – the clock start: `paidAt ?? at` for digital-only orders, otherwise `at`.
- `deliveryClockFor(order, at, days)` – returns a `DeliveryClock` of `{ withdrawUntil, conformityUntil }`.
- `isExcludedFromWithdrawal(line)` – true when `line.product.noWithdrawal === true`.
- `withdrawalRefusalOf(order, now)` – returns the first `WithdrawBlockedReason`, or `undefined` if the withdrawal is open. The reasons are `all_excluded`, `window_closed` and `nothing_left`. The visible source is cut off partway through this function.
- Candidate interfaces – `DispatchCandidate`, `AddressCandidate`, `WithdrawalClockCandidate`, `WithdrawableLine`, `WithdrawalCandidate`. Each lists only the order fields its function reads.

## Relationships
- `@domain-primitives/time` (`src/domain-primitives/time.ts`) supplies `DAY_MS`, `dayInZone`, `endOfUtcDay` and `startOfDayInZone` for the date arithmetic.
- `./status-traits` supplies `ORDER_STATUS_TRAITS`, whose `beforeDispatch` flag drives `isBeforeDispatch` and `canCorrectAddress`.
- `./fulfillment` supplies the `FulfillmentSummary` type (`shipped`, `remaining`).
- `./rules` supplies `isDigitalOnlyOrder` and the `ShippableLineCandidate` type, used for the clock start.
- `@types` supplies `OrderStatus` and `WithdrawBlockedReason`.
- The doc comments say `withdrawalRefusalOf` backs both the withdraw button and the door (`POST /returns`), so the two cannot disagree. The other neighbors (repository, services, emails, tests) are not shown importing this file in the visible content.

## Notes
- Two deadlines exist on purpose. `withdrawUntil` is the announced date shown in mails, timeline rows and screens. `withdrawalClosesAt` adds one silent grace UTC day, so a buyer is never turned away over a one-day difference in counting.
- Days are UTC days, and Art. 3(4) weekend and holiday roll-over is deliberately not computed. The comments say the minimum configured withdrawal period outlasts it.
- The refund deadline uses the shop's IANA time zone. The legal numbers are constants in this file, so a change in the law means editing them.
- The guarantee margin (7 days) covers UTC offset and weekend roll-over, and made-to-order goods keep the guarantee even though they lose the right of withdrawal.
- An order with an empty `items` list gets `all_excluded`, because `[].every(…)` is true. An order with no `items` field skips that check.
