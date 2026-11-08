---
source: src/modules/returns/services/create.ts
sha256: 05bd5c3409f451181f5522d8ba0ce3bfaabcfb94ae25d160197d49f129890549
generated_at: 2026-11-08T08:03:06.803875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/create.ts

## Purpose

Opens a return for an order, or a withdrawal when the order has not yet been dispatched. It is the single entry point for both buyer-initiated and staff-initiated openings. The file decides which path to take (withdrawal vs. return + cancellation of unshipped lines), validates requested quantities against what actually shipped and is not already being returned, writes the return document inside a locked transaction, and enqueues the outbox messages that trigger downstream side-effects (mails, status sync).

## Key elements

- **`openUnderLock`** — Core transactional step. Acquires the order lock row, reads prior returns, validates lines via `checkRequestedLines`, freezes policy exceptions, then calls `writeReturn`. Prevents two concurrent openings from both passing the "nothing returned yet" check under snapshot isolation.
- **`writeReturn`** — Persists the `ReturnDocument` through `returnRepository.create`, then enqueues `return.requested` (and `return.decided` when staff opened a non-withdrawal), and appends order timeline rows via `appendOpened`.
- **`appendOpened`** — Writes `return_requested` (and `return_approved` if status is already approved) to the order timeline. Only the reason code is stored there; the buyer's free-text note stays on the return.
- **`alreadyReturned`** — Reads existing returns for the order and flattens their lines, excluding cancellations (which hold no goods coming back).
- **`excludedProductIds`** — Collects product IDs the order holds that are excluded from withdrawal under Art. 16.
- **`isWaiver`** — True when a staff member opens a return (not a withdrawal) for the buyer, meaning shop-policy deadlines are being waived.
- **`announceOpened`** — Post-commit step: calls `recordOpened` (audit) and `syncReturnStatus` to bring the order's return status in step.
- **`openFor`** — Orchestrates deadline judgment, exclusion of Art. 16 goods, and delegates to `openUnderLock`.
- **`Opening` interface** — Extends `Statement` with `staffId` and `policyExceptions`; threaded into `writeReturn`.
- **Re-exports** — `CreateReturnInput`, `CreateReturnOutcome` from `./outcome`.

## Relationships

- **`@modules/orders`** (`index.ts`, `services/index.ts`, `model.ts`, `domain/withdrawal.ts`) — Imports `orderService` (timeline appends), `isBeforeDispatch` (routing decision), `isExcludedFromWithdrawal` (Art. 16 check), `withdrawalRefusalOf`, and the `OrderDocument` type. The withdrawal path delegates fully to the orders module's cancel.
- **`@modules/delivery`** (`index.ts`, `services/index.ts`) — Imports `deliveryService` to determine what has shipped per product.
- **`@infrastructure/runtime/database.ts`** — `withTransaction` wraps the read-then-write critical section.
- **`@kernel/outbox.ts`** — `nudgeOutbox` is called by the caller after commit to wake the relay; not invoked inside the transaction.
- **`@infrastructure/http/response.ts`** — `generateReject` shapes error responses for failed openings.
- **`@infrastructure/i18n`** — `t` provides translated strings in outcomes.
- **`../domain`** (`index.ts`, `lifecycle.ts`, `quantities.ts`) — All pure validation and status logic: `checkRequestedLines`, `returnableQuantities`, `initialStatusFor`, `policyExceptionsOf`, `wireLines`, `holdsReturnedGoods`, `isReasonOpen`, `isGuaranteeReason`.
- **`./withdraw`** — `withdrawBeforeDispatch` handles the pre-dispatch path (full refund + closed return + Art. 11a mail).
- **`./cancel-remainder`** — `createCancellation` cancels unshipped fulfillment orders line-by-line when a post-dispatch return is opened.
- **`./outcome`** — All outcome constructors (`badLines`, `opened`, `recordOpened`, `enqueueRequested`, `enqueueApproved`, etc.) and input types.
- **`./projection`** — `syncReturnStatus` keeps the order's aggregated return status consistent post-commit.
- **`./deadlines`** — `frozenDeadlinesOf` captures the order's deadline state at opening time for the waiver record.
- **`@modules/shop`** — `returnPostagePayer` determines who pays return shipping, written onto the return at creation.

## Notes

- The withdrawal button and the return-opening call are the **same function**; dispatch status (`isBeforeDispatch`) is the only fork. A withdrawal produces a return with zero lines and `status: 'approved'` from birth — the record exists solely as dated proof.
- **Concurrency guard**: `returnRepository.lockOrder` is called before any read inside the transaction. Without it, two simultaneous openings would both see zero prior returns under snapshot isolation and both commit full-quantity returns.
- **Policy exceptions are frozen at opening time** (`frozenDeadlinesOf` + `policyExceptionsOf`). The waiver reflects what was true when staff clicked, not the state at any later moment.
- **Outbox nudge is deferred to the caller** — `writeReturn` enqueues messages inside the transaction, but `nudgeOutbox` must fire only after the transaction commits.
- **Cancellations are invisible to `alreadyReturned`** — a cancelled fulfillment order shipped nothing, so its quantities never enter the "already coming back" total.
- The `d` import from `@infrastructure/i18n/context.ts` provides the request-scoped locale for any translated strings in error outcomes.
