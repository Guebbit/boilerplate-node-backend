---
source: src/modules/returns/services/create.ts
source_sha256: a1d1218e12d5e7fbeb51a1552e4c108fcb4a25be3f613d893bae822a52bdc299
context_sha256: ec4398f42e7a4340ee83cc0f7182d065f4f95fe58de92a141c3377aa10ffe403
generated_at: 2026-11-22T07:29:07.798552+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/create.ts

## Purpose
Opens a return, which is also the implementation of the withdrawal button. The call always answers with a `Return`, and where the goods are decides what that record is. Before dispatch, a withdrawal is `orders`' own cancel plus a `Return` written closed at birth (no lines, refund owed, Art. 11a acknowledgement mailed via `./withdraw`). Once something has shipped, the return is written open with the lines and quantities coming back. What has not shipped is canceled per fulfillment order through `./cancel-remainder`. The buyer opens it. Staff with `update:Return` can open it on the buyer's behalf, born approved with waived policy rules recorded, or record a withdrawal the buyer stated outside the shop.

## Key elements
- `CreateReturnInput`, `CreateReturnOutcome` — types re-exported from `./outcome`.
- `alreadyReturned` — reads the order's existing returns inside the transaction and keeps those that hold returned goods (`holdsReturnedGoods`). Cancellations are not counted, because their units never shipped.
- `appendOpened` — appends `return_requested` to the order timeline, plus `return_approved` when the new return is already approved. It carries only the reason code and names the staff actor when there is one.
- `Opening` — internal interface extending `Statement` with `staffId` and `policyExceptions`.
- `writeReturn` — creates the return document and freezes the lines with the product title and unit price. It also records `returnPostage` (from `returnPostagePayer()`), `openedBy` (`staff` or `buyer`) and `policyExceptions`, and sets `decidedAt` when the status is `approved`. It then enqueues `return.requested`, and `return.decided` for staff openings that are not withdrawals, and appends the timeline rows. Waking the outbox relay is left to the caller.
- `excludedProductIds` — ids of order lines that Art. 16 excludes from withdrawal.
- `isWaiver` — true when staff open a non-withdrawal return. A withdrawal keeps its legal window and Art. 16 exclusion.
- `openUnderLock` — runs in one `withTransaction`. It locks the order row (`returnRepository.lockOrder`), loads earlier returns, and checks the requested lines against `returnableQuantities(shipped, earlier)`. It returns `badLines` on failure. For waivers it computes `policyExceptionsOf` from `frozenDeadlinesOf(order)`, then calls `writeReturn`.
- `announceOpened` — after commit, calls `recordOpened` for audit and `syncReturnStatus` to bring the order's return status in step.
- `openFor` — documented as opening a return once the caller and statement are settled. It judges the reason's deadline on the day the buyer asked, cuts excluded goods, then writes. Its body is not shown in the visible content.

## Relationships
- `src/modules/orders/index.ts` supplies the `OrderDocument` type, the `orderService` used to append timeline rows, and the helpers `isBeforeDispatch`, `isExcludedFromWithdrawal` and `withdrawalRefusalOf`. Orders' cancel is what performs the refund and stock release for pre-dispatch withdrawals.
- `src/modules/delivery/index.ts` (`deliveryService`) is imported, presumably to establish what has shipped. Its usage is not visible in the shown portion.
- `src/infrastructure/runtime/database.ts` provides `withTransaction`.
- `src/kernel/outbox.ts` provides `nudgeOutbox`, which wakes the relay after commit. It is imported, but its call site is not shown.
- `src/infrastructure/http/response.ts` provides `generateReject`, and `src/infrastructure/i18n/index.ts` provides `t`. Both are imported, but their call sites are not in the visible portion.
- `src/modules/returns/domain/index.ts` supplies the pure rules: `checkRequestedLines`, `checkStatement`, `initialStatusFor`, `returnableQuantities`, `wireLines`, `policyExceptionsOf`, `isGuaranteeReason`, `isReasonOpen` and `holdsReturnedGoods`.
- `../repository` (`returnRepository`) provides `create`, `findByOrderId` and `lockOrder`.
- Sibling services:
  - `./deadlines` — `frozenDeadlinesOf`.
  - `./ownership` — `openableOrder`.
  - `./projection` — `syncReturnStatus`.
  - `./cancel-remainder` — `createCancellation`.
  - `./withdraw` — `withdrawBeforeDispatch`.
  - `./outcome` — the outcome constructors, the enqueue helpers and the `Opener` type.
- `@modules/shop` provides `returnPostagePayer`.

## Notes
- The order lock is what prevents two parallel openings from both reading "nothing returned yet" under snapshot isolation and each committing a full return.
- Excluded goods are removed from `shipped` unless staff are waiving that rule, but a withdrawal is never waived.
- The lines, the policy exceptions and `requestedAt` are frozen on the record when it is opened.
- Nothing is announced inside the transaction. The commit must happen first, then `announceOpened` and the outbox nudge.
