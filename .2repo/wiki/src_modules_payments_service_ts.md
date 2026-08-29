# src/modules/payments/service.ts

## Purpose

Owns the money-movement rules for an order's payment lifecycle: creating a payment intent, confirming (charging) a payment, and handling the charge-to-refund rollback when the order is no longer payable. Delegates actual charging/refunding to a resolved payment provider and commits held inventory only after the order has conditionally transitioned to `paid`.

## Key elements

- **`CONFIRMABLE_PAYMENT_STATUSES`** — readonly array `['requires_confirmation', 'declined']`; the set of payment states the confirm endpoint accepts. Written as an array (not a `Set`) so the same value can serve both an `includes()` membership test and a MongoDB `$in` filter in conditional writes.
- **`REFUNDABLE_PAYMENT_STATUS`** — `'succeeded'`; the only state from which money can be refunded.
- **`resolvePayerId(orderUserId)`** — looks up the user in `userRepository` to confirm the id still resolves; falls back to the raw `orderUserId` (with a `logger.warn`) if the account has been deleted, so an unattributed payment is still possible.
- **`callerScope`** — built via `createOwnerScope(paymentRepository.ownerScope)`; restricts payment reads to the caller's own records (admins get `undefined` scope = all).
- **`createIntent(orderId, authContext)`** — verifies the order is payable via `canTransition(order.status, OrderStatus.paid, 'system')`, freezes the amount with `orderTotal(order)`, and upserts the payment intent. Idempotent for re-requests; returns 409 if the order has already been paid.
- **`confirmPayment(paymentId, card, authContext, context)`** — the core charge flow:
  1. Loads the payment scoped to the caller; checks status against `CONFIRMABLE_PAYMENT_STATUSES`.
  2. Calls `provider.charge(...)`.
  3. On **decline**: conditionally writes `status → 'declined'` (re-asserting the same status filter), returns 409 `PAYMENT_DECLINED`.
  4. On **success**: conditionally moves the order `statusesLeadingTo(paid) → paid`. If the order is gone, immediately calls `provider.refund(...)` and returns 409.
  5. Writes the payment row to `'succeeded'`, calls `inventoryService.commitForOrder(...)` to release held stock, and emits the `ORDER_STATUS_CHANGED` domain event.
- **Analytics / audit side-channels** — after confirm, emits analytics (`paymentsAnalyticsEvents`) and audit (`paymentsAuditActions`) events for decline and success outcomes.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/index.ts` | Reads order via `orderService.getById`; conditionally transitions order status via `orderRepository.updateStatusIfIn`; re-exports `ORDER_STATUS_CHANGED` event constant. |
| `src/modules/orders/domain/lifecycle.ts` | `canTransition` gates whether an order is still payable; `statusesLeadingTo(paid)` supplies the `$in` filter for the conditional write. |
| `src/modules/orders/domain/totals.ts` | `orderTotal(order)` freezes the charge amount at intent-creation time. |
| `src/modules/orders/model.ts` | `OrderDocument` type used for the order read. |
| `src/modules/inventory/service.ts` | `inventoryService.commitForOrder(orderId)` releases held units after the order is confirmed paid. |
| `src/kernel/authorization.ts` | `createOwnerScope` builds the caller-scope function for payment reads. |
| `src/kernel/events.ts` | `emitDomainEvent(ORDER_STATUS_CHANGED, …)` published after a successful confirm. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` shape every API response. |
| `src/infrastructure/http/request.ts` | `CallerContext` type passed into `confirmPayment` for audit/analytics attribution. |
| `src/infrastructure/i18n/index.ts` | `t('payments.…')` localises all user-facing error and success messages. |
| `src/infrastructure/adapters/logger.ts` | `logger.warn` for unresolvable payer ids. |
| `src/infrastructure/observability/analytics/index.ts` | `emitAnalyticsEvent` / `buildAnalyticsBase` record payment outcomes. |
| `src/infrastructure/observability/audit.ts` | `emitAuditEvent` / `buildAuditEvent` record payment actions for the audit trail. |

## Notes

- **Charge-before-order-move is deliberate.** The PSP takes money before the DB knows about it. The conditional `pending → paid` write is the single at-most-once gate; if it fails, the charge is refunded immediately. Inventory commit follows the same gate, so a lost race leaves the customer with a paid order and the shop logs the missed commit.
- **`CONFIRMABLE_PAYMENT_STATUSES` is intentionally an array.** It is read twice in different shapes (`includes` vs. MongoDB `$in`). A `Set` would force a spread back to array and would duplicate the list. Any future status change must be added in one place.
- **`declined` is retryable.** It is the only backwards transition in the payment lifecycle, which is why it appears in the confirmable set and must be preserved whenever the lifecycle changes.
- **Payer resolution never blocks payment.** A deleted account's outstanding order remains payable; the gap is logged, not rejected.
- **`createIntent` is idempotent.** The `upsertIntent` call means a double-click returns the same intent rather than creating a second one.
