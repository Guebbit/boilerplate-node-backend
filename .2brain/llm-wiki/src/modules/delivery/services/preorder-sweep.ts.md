---
source: src/modules/delivery/services/preorder-sweep.ts
source_sha256: b6aa95b433d8e33b5f31285c763c7e6a96356aa910f2712e9d21d36e962ec15c
context_sha256: 6c9085d5f540260277bfc212bf230128ee30933b610a9ce468b7c86289665731
generated_at: 2026-11-22T04:57:04.660241+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/preorder-sweep.ts

## Purpose
The daily sweep over waiting preorders. For each fulfillment order whose current expected date is a day away or already passed, with goods still not in stock and no notice yet for that date, it tells the buyer once that the date will be missed and no new date exists. The email asks nothing and cancels nothing. The buyer keeps waiting, can cancel before shipping, and staff see the late order on the board and decide whom to call.

## Key elements
- `PreorderSweepResult`: result shape, `{ notified: number }`, the count of buyers told.
- `noticeOne(fulfillmentOrderId, now)` (internal): runs inside `runAct`. It re-reads the order in the session and proceeds only if the order is `on_hold`, its hold reason is `awaiting_stock`, and `needsDueNotice(order, now)` is true. It then calls `recordNotice(order, { reason: 'due' }, now, session)`. It returns the `SentNotice` to mail after the commit, or `undefined` if the act was refused or the checks failed.
- `runPreorderSweep(now = new Date())` (exported): loads the candidates with `fulfillmentOrderRepository.findDatePassed(now)` and calls `noticeOne` sequentially for each order. It returns `{ notified }`, counting the orders that produced a notice.

## Relationships
- `../repository`: `fulfillmentOrderRepository` supplies the candidates (`findDatePassed`) and re-reads each one inside the transaction (`findInSession`).
- `../domain` (`needsDueNotice`): decides whether an order needs a due notice.
- `./act` (`runAct`): provides the per-order transaction and session. A refused result is treated as "nothing sent".
- `./notice` (`recordNotice`, `SentNotice`): records the notice and returns what to mail after commit.
- `@types` (`src/types/index.ts`): supplies the `FulfillmentOrderStatus` and `FulfillmentHoldReason` enums.
- `jobs.ts` and `reship.test.ts` are graph neighbors, but this file shows no direct interaction with them. The sweep is exported from here and takes `now` as a parameter.

## Notes
- Idempotent: a date already noticed (`dueNoticeFor`) is not noticed again, so repeated runs are harmless.
- Only orders `on_hold` for stock are swept. Goods already allocated but unshipped count as a short delay and appear in the admin's Late view instead.
- Orders are processed one at a time. Each has its own transaction, and the buyer's mail goes out on each commit's event.
- The state is re-checked inside the transaction, so a notice another run sent or an allocation that happened since the query is not acted on.
