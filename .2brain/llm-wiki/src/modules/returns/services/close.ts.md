---
source: src/modules/returns/services/close.ts
sha256: 33bd96be19e5b616f33dcbcee98c79b2a8da392e175ec5f4a3371b3006f06e1d
generated_at: 2026-11-14T21:37:50.725062+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/close.ts

## Purpose

Performs the `received → closed` status transition on a return once its refund has settled, or when staff closes one manually without a refund. Two automated paths (same-request refund settlement and the async `PAYMENT_REFUNDED` listener) can race; the atomic status claim ensures only one wins and the other is a no-op.

## Key elements

- **`claimClosed`** (internal) — shared core: atomically claims the status move via `returnRepository.claimStatus` and, on success, appends a `return_closed` timeline row on the parent order. Returns `null` if the return was not in the expected source state.
- **`closeReturn(id, actor?)`** (exported) — the automated path. Wraps `claimClosed` in `announceInTransaction` so the `return.closed` outbox event is written exactly when this call wins the race. Then calls `syncReturnStatus`. Marked `@internal`; the two caller-owners are `receiveReturn` and the `PAYMENT_REFUNDED` listener.
- **`closeReturnByHand(id, note, context)`** (exported) — the staff path. Runs `claimClosed` inside `withTransaction`, records an audit row (`ADMIN_RETURN_CLOSED`), and returns a `200` or `404`/`409` response. Deliberately does **not** publish `return.closed`.
- **`notClosable(id)`** (internal) — builds the `404` (not found) or `409` (`RETURN_NOT_CLOSABLE`) reject response for hand-close failures, with i18n messages.

## Relationships

- **`src/modules/returns/repository.ts`** — `returnRepository.claimStatus` (atomic conditional update) and `findById` (for the 404/409 distinction).
- **`src/modules/returns/domain/lifecycle.ts`** — supplies the `from`/`to` state pair for the close transition via `returnLifecycle`.
- **`src/modules/orders/index.ts`** — `orderService.appendTimeline` writes the `return_closed` row on the order.
- **`src/kernel/outbox.ts`** — `announceInTransaction` pairs the outbox event with the same DB transaction as the status move.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the Mongoose session for the hand-close path.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs the staff action.
- **`src/domain-primitives/money.ts`** — `padDecimal` formats `refundAmount` for the timeline payload.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP responses.
- **`src/infrastructure/i18n/index.ts`** — `t()` localizes the 404/409 error messages.
- **`src/modules/returns/module.ts`** — the `PAYMENT_REFUNDED` listener in this file calls `closeReturn` when the payment sweep completes a previously refused refund.
- **`src/modules/returns/audit.ts`** — provides the `returnsAuditActions.ADMIN_RETURN_CLOSED` action constant.
- **`src/modules/returns/model.ts`** — defines the `ReturnDocument` type used throughout.

## Notes

- `closeReturn` never checks whether the refund actually settled; it only checks state. The "money went back" fact is owned by its callers, which is why the function is `@internal`.
- `closeReturnByHand` intentionally skips the outbox announcement: the `return.closed` email tells the customer their refund is on its way, which is false when the refund was canceled or paid out-of-band.
- The `actor` parameter (present or absent) is threaded into the order timeline row so the UI can show *who* closed it; the payment-sweep path passes `undefined`.
- Both exported functions return `null` (not throw) when the return was not in `received` state — callers are responsible for interpreting that as a no-op.
