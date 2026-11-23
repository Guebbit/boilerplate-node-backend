---
source: src/modules/orders/tests/unit/withdrawal.test.ts
source_sha256: cfd92436a48043c493be4b5308362a65d9771ff752a618b17fadc45ef8a3057d
context_sha256: d4f7d9d50f2197857ab225a2b7577d01f247ee2cd0cb612c469338a32ca2921c
generated_at: 2026-11-22T06:39:24.569984+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/withdrawal.test.ts

## Purpose
Unit tests for the pure withdrawal-window rules of an order (Consumer Rights Directive Art. 9, 11a and 16). The tests cover when the withdrawal and conformity clocks start and end, whether withdrawal is offered, why it is refused, and refund and address-correction eligibility. They use fixed dates, so no clock or I/O is involved.

## Key elements
- `DAY_MS` and `NOW` (`2026-03-10T12:00:00Z`): the shared day length and the fixed instant the window is judged at.
- `withdrawalStartFor`: a physical order starts at the arrival. A digital-only order starts at `paidAt`, falling back to the arrival if unpaid.
- `withdrawUntilFrom`: the event day does not count. The window ends at `23:59:59.999Z` on the 14th day after it, regardless of the event's time of day. It is checked across month boundaries.
- `withdrawalClosesAt`: the announced last day plus one silent grace day, ending at the end of the UTC day after it. Checked across month and year boundaries.
- `conformityUntilFrom`: two years on plus seven days, at end of day. A 29 February delivery runs to 8 March.
- `deliveryClockFor`: the withdrawal clock comes from the order's own start, the guarantee clock from the arrival, and the day count is a parameter (30 in the test).
- `canWithdraw`: offered for every status except `canceled` while the window is open. It stays offered through the grace day and is off one millisecond after the grace day closes. Orders made only of excluded goods are refused.
- `isBeforeDispatch`: `pending`, `paid` and `processing` count as before dispatch. `shipped`, `delivered` and `canceled` do not. A `fulfillment.shipped: true` flag overrides a `processing` status.
- `canCorrectAddress`: open when nothing has shipped, or when units remain after a first parcel. Closed when no units remain, or when the order is shipped, delivered or canceled. Also closed for an order with no `shippingAddress`.
- `isExcludedFromWithdrawal`: true only when `product.noWithdrawal` is true. A missing or null product counts as not excluded.
- `withdrawalRefusalOf`: returns `undefined` when the button is offered, and also for canceled orders. Otherwise it returns a `WithdrawBlockedReason`: `all_excluded`, `window_closed` or `nothing_left` (when `returnStatus` is `'returned'`). When several reasons apply, the first one is named, and `all_excluded` outranks `window_closed`. A mixed order is not refused. A consistency test checks that `canWithdraw` agrees with it.
- `repairedConformityUntil`: moves the guarantee out by 12 months, keeping the day and hour.
- `withdrawalRefundDueBy`: tested against a `Europe/Rome` zone. The due time is the last millisecond of the shop day 14 days after the day the shop was told, and the told day itself does not count. The visible tests end partway through this block.

## Relationships
- Imports every function under test from `../../domain`, the barrel in `src/modules/orders/domain/index.ts`. The implementations are in `src/modules/orders/domain/withdrawal.ts`, so this file tests that module through the barrel.
- Imports the `OrderStatus` and `WithdrawBlockedReason` enums from `@types`, which resolves to `src/types/index.ts`.

## Notes
- Every date is UTC, and the expected values are exact ISO strings with `.999Z` endings, so the tests are sensitive to off-by-one-millisecond changes.
- The "silent grace day" means the effective close is later than the announced `withdrawUntil`, so `withdrawalClosesAt` and `canWithdraw` use that later instant.
- Fixtures are minimal partial objects (for example `{ status }` or `{ product: { noWithdrawal } }`). The functions are expected to accept partial orders.
