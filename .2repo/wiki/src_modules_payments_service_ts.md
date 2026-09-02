# src/modules/payments/service.ts

## Purpose

Implements the payment domain service: creating payment intents, confirming (charging) them, and reading them back for the order page. It enforces three invariants — only a `pending` order's owner can start paying; the order's transition to `paid` is the gate, not the charge (a slipped order triggers an immediate refund); and a post-payment refund is at-most-once via a conditional `succeeded → refunded` move.

## Key elements

- **`CONFIRMABLE_PAYMENT_STATUSES`** (`readonly PaymentStatus[]`) — statuses the confirm endpoint accepts (`requires_confirmation`, `declined`). Deliberately an array (not a `Set`) so it serves both as a `.includes` membership test and as the `$in` filter in `updateStatusIfIn` conditional writes.
- **`REFUNDABLE_PAYMENT_STATUS`** — the single status (`succeeded`) from which money can be returned.
- **`resolvePayerId`** — resolves the payer's user id against `users`; falls back to the order's stored id (with a warning log) if the user no longer resolves; returns `undefined` for detached orders.
- **`callerScope`** — owner-scoped authorization wrapper over `paymentRepository.ownerScope`, used to limit reads to the caller's payments (admins pass through).
- **`createIntent`** — creates or refreshes a payment intent for an order. Freezes the amount via `orderTotal`, checks the order is still payable with `canTransition(order.status, OrderStatus.paid, 'system')`, and upserts the intent. Idempotent for double-clicks; 409 if money already moved.
- **`confirmPayment`** — the charge flow: validates confirmable status → calls the provider `charge` → on success, conditionally moves the order to `paid` (refunds immediately if the order is gone) → updates the payment row → commits inventory → emits `ORDER_STATUS_CHANGED`. On decline, conditionally records `declined` and returns 409. Emits audit + analytics events for success and decline outcomes only.
- **`getForOrder`** — fetches the payment document behind an order for the order-page payment panel, scoped to the caller.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/index.ts` | Imports `orderService` (read-by-id), `orderRepository` (conditional status move), `ORDER_STATUS_CHANGED` event constant. |
| `src/modules/orders/domain/lifecycle.ts` | Uses `canTransition` to verify an order is still payable; `statusesLeadingTo` to build the `from` set for the conditional move to `paid`. |
| `src/modules/orders/domain/totals.ts` | Uses `orderTotal(order)` to freeze the charge amount at intent-creation time. |
| `src/modules/inventory/service.ts` | Calls `inventoryService.commitForOrder` after the order reaches `paid` to release stock held at checkout. |
| `src/kernel/authorization.ts` | Uses `createOwnerScope` to scope payment reads to the caller. |
| `src/kernel/events.ts` | Calls `emitDomainEvent(ORDER_STATUS_CHANGED, …)` after a successful confirm. |
| `src/infrastructure/http/response.ts` | Uses `generateSuccess` / `generateReject` for all return values. |
| `src/infrastructure/http/request.ts` | Imports the `CallerContext` type used in audit/analytics base payloads. |
| `src/infrastructure/i18n/index.ts` | Uses `t()` for all user-facing error and success messages. |
| `src/infrastructure/adapters/logger.ts` | Logs a warning when a payer id cannot be resolved against `users`. |
| `src/infrastructure/observability/analytics/index.ts` | Emits `emitAnalyticsEvent` with `buildAnalyticsBase` for succeeded / declined confirmations. |
| `src/infrastructure/observability/audit.ts` | Emits `emitAuditEvent` with `buildAuditEvent` for confirmed and failed payment actions. |

## Notes

- **Array, not Set:** `CONFIRMABLE_PAYMENT_STATUSES` is a plain array because the same value is spread into a MongoDB `$in` operator in `updateStatusIfIn`; a `Set` would require re-spreading each time.
- **Race safety:** Every status mutation (`updateStatusIfIn`) re-asserts the precondition in the query filter, so a stale read cannot cause a double-charge, a decline-overwrite of a success, or a double inventory commit.
- **Inventory commit result is ignored:** If `commitForOrder` returns `false` (expiry sweep won), this module does not compensate — the customer still has a paid order and `inventory` is expected to log.
- **Payer resolution is non-fatal:** A missing user does not block payment; the order's own `userId` is persisted and a warning is logged. A fully detached order (`userId === undefined`) persists no payer id at all.
- **Audit/analytics fire on exactly two outcomes:** success and `PAYMENT_DECLINED`. Other rejections (not found, not confirmable, order gone) are treated as request-shape or race conditions and are not attributed to a card.
