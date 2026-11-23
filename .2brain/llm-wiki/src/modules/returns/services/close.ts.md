---
source: src/modules/returns/services/close.ts
source_sha256: 0f164f4727ef5a9f6032dc90ed8d0b1d9b1aca6955b84a28db5e8e2a775b0f23
context_sha256: 3aa9c9bce416a4eba0188a6181e1c61cd829497a13b006708fec7aadb58fca74
generated_at: 2026-11-22T07:28:46.788294+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/close.ts

## Purpose
Finishes a return once its money has gone back by moving it `received → closed`. It is reached from `receiveReturn` after a refund that settled in the same request, and later from `module.ts`'s `PAYMENT_REFUNDED` listener when the payment sweep completes a refund the provider first refused. The move is conditional, so whichever path arrives second finds nothing to do. It also provides a staff-only "close by hand" path for returns whose money will not follow the usual way.

## Key elements
- **`claimClosed`** (internal): the step both close paths share. In the caller's transaction it calls `returnRepository.claimStatus` with the lifecycle's `close` from/to statuses and sets `closedAt`. If the claim succeeds, it appends a `return_closed` row to the order's timeline through the orders service. The row holds `returnId`, `refundAmount` (formatted with `padDecimal`), `currency` and, when present, `remedy`. A lost race writes no row and returns `null`.
- **`closeReturn(id, actor?)`**: marked `@internal`, not published. It runs `claimClosed` inside `announceInTransaction` with `returnClosedEvent`, so the closed event exists exactly when this call closed the return. It then runs `syncReturnStatus` for the order. It returns the closed `ReturnDocument`, or `null` if the return was not `received` (already closed or never received). It checks state only and does not verify that the refund settled.
- **`closeReturnByHand(id, note, context)`**: staff close for a canceled refund or one paid outside the application.
  - It announces `RETURN_CLOSED_BY_HAND` (payload `returnId`, `orderId`; aggregate id is the order id) instead of the customer-facing closed event.
  - It records an `ADMIN_RETURN_CLOSED` audit entry with `orderId` and the optional `note`.
  - It syncs the order status and returns `generateSuccess(closed, 200)`.
  - If nothing was closed, it returns the `notClosable` rejection.
- **`notClosable`** (internal): looks the return up. It rejects with 409 and `ERROR_CODES.RETURN_NOT_CLOSABLE` if the return exists, or 404 (`returns.not-found`) if it does not.

## Relationships
- `../repository` (`returnRepository`): `claimStatus` does the conditional status move, and `findById` backs the 404/409 decision.
- `../domain` (`returnLifecycle`): supplies the `fromOf('close')` and `toOf('close')` statuses.
- `@modules/orders` (`orderService`): its timeline-append method writes the order timeline row inside the same transaction.
- `@kernel/outbox` (`announceInTransaction`): writes the event atomically with the status move.
- `../events` (`RETURN_CLOSED_BY_HAND`) and `../audit` (`returnsAuditActions`) supply the event name and audit action.
- `@infrastructure/observability/audit` (`recordAudit`): audits the hand close.
- `@infrastructure/http/response` and `@infrastructure/i18n` (`t`): build the response and reject messages.
- `@domain-primitives/money` (`padDecimal`): formats the refund amount on the timeline.
- `../model` (`ReturnDocument`): the return document type.
- Callers: `receiveReturn` and `module.ts`'s `PAYMENT_REFUNDED` listener, per the file's header comments.

## Notes
- The hand close deliberately does not send the customer-facing closed event, because its mail tells the customer their money went back, which did not happen.
- `return.closed_by_hand` is internal, so the to-do that asked for this check clears itself.
- The `note` goes only into the audit row. The timeline row carries ids and numbers only.
- `closeReturnByHand` is called with `closed` never null in its event builder, because only a close that landed is announced.
- `recordAudit` is called without being awaited or chained, and is not part of the transaction.
