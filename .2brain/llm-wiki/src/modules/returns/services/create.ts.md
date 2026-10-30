---
source: src/modules/returns/services/create.ts
sha256: 5eb7b3e34f6c747e368e4cbfc85e074093876b08ccafc426fbc20b5514881dfb
generated_at: 2026-10-29T05:42:02.931893+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/create.ts

## Purpose

Opens a return for an order — the same call that powers the withdrawal button. The shape of the resulting `Return` record depends on whether goods have shipped: pre-dispatch it delegates to the order's own cancellation (full refund, stock release) and writes a closed, line-less `Return` as dated proof; post-dispatch it writes an open `Return` with the goods coming back and cancels unshipped items separately. Handles both buyer-initiated and staff-initiated openings, including policy waivers.

## Key elements

- **`alreadyReturned(orderId, session)`** — Reads existing returns for the order and flattens their lines into `ProductQuantity[]`, so a new return's quantities are checked against what is already in flight. Cancellations are excluded (nothing ships back).
- **`appendOpened(created, actor, session)`** — Appends `return_requested` (and `return_approved` when the return is born approved) to the order's timeline via `orderService`.
- **`Opening` (interface)** — Extends `Statement` with optional `staffId` and `policyExceptions`, carrying who opened it and what was waived.
- **`writeReturn(order, input, lines, opening, session)`** — Persists the `Return` document, enqueues `return.requested` (and `return.decided` for staff-opened non-withdrawal) outbox messages, then appends the timeline rows.
- **`excludedProductIds(order)`** — Collects product IDs where Art. 16 removes the right of withdrawal.
- **`isWaiver(opener, reason)`** — True when staff open a non-withdrawal return for the buyer, meaning they are waiving shop rules.
- **`openUnderLock(order, input, shipped, opener)`** — The core transaction: locks the order row, reads already-returned quantities, validates requested lines against returnable quantities, freezes policy exceptions, and calls `writeReturn`. All under `withTransaction` to prevent concurrent double-returns.
- **`announceOpened(order, created, context)`** — Post-commit: audits the opening and calls `syncReturnStatus` to bring the order's projected return status in step.
- **`openFor(order, input, opener, authContext, context, …)`** *(truncated in source)* — Higher-level orchestrator: judges the reason's deadline on the buyer's request date, removes Art. 16-excluded goods from the shipped set, then delegates to `openUnderLock`.
- **Re-exports** — `CreateReturnInput` and `CreateReturnOutcome` from `./outcome`.

## Relationships

- **`@infrastructure/runtime/database`** — Wraps the entire open operation in `withTransaction`; the order row is locked for the duration.
- **`@kernel/outbox`** — `nudgeOutbox` is the caller's responsibility after commit to wake the relay for enqueued `return.requested` / `return.decided` messages.
- **`@modules/orders`** — Imports `orderService` (timeline append, cancel path), `isBeforeDispatch` (chooses withdrawal vs. return), `isExcludedFromWithdrawal` (Art. 16 filter), and `withdrawalRefusalOf`. `OrderDocument` type shapes all order reads.
- **`@modules/delivery`** — `deliveryService` is imported, presumably to determine what has actually shipped per product.
- **`@modules/returns/domain`** — Domain logic lives here: `checkRequestedLines`, `returnableQuantities`, `wireLines`, `holdsReturnedGoods`, `initialStatusFor`, `policyExceptionsOf`, `checkStatement`, `isGuaranteeReason`, `isReasonOpen`.
- **`@infrastructure/http/response`** — `generateReject` builds error responses for the various `bad*` / `windowClosed` outcomes.
- **`@infrastructure/i18n`** — `t` for localised user-facing messages.
- **`./withdraw`, `./cancel-remainder`** — `withdrawBeforeDispatch` handles the pre-dispatch path; `createCancellation` handles unshipped items post-dispatch.
- **`./outcome`** — Defines the input/outcome types and the factory functions (`opened`, `badLines`, `windowClosed`, `enqueueRequested`, `enqueueApproved`, etc.) that shape the result.
- **`@modules/shop`** — `returnPostagePayer()` determines who pays return shipping.

## Notes

- **The withdrawal button is not a separate code path.** It funnels through the same `openFor` call; the pre-dispatch branch simply produces a closed, line-less `Return` alongside the order's own cancellation.
- **Concurrency guard.** The `lockOrder` row lock inside `openUnderLock` exists because snapshot isolation alone would let two parallel openings both see zero prior returns and both commit a full return.
- **Policy exceptions are frozen at open time.** When staff waive a deadline or Art. 16 exclusion, the exceptions are computed once and stored on the `Return` record; they are not re-evaluated later.
- **Outbox relay is woken by the caller**, not inside `writeReturn`. The transaction must commit before `nudgeOutbox` fires, so the caller owns that sequencing.
- **Staff-opened returns are born `approved`** (except withdrawals, which are the buyer's legal right). `decidedAt` is set at creation so there is nothing left for a later approval step.
- **`checkRequestedLines` guarantees the product exists on the order**, so the non-null assertion on `byProduct.get(productId)!` in `writeReturn` is safe by contract.
