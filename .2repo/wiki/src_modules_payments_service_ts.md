# src/modules/payments/service.ts

## Purpose

Orchestrates the money flow for an order behind a provider port. Implements three invariants: only a `pending` order's owner may start paying; the order's `pending → paid` conditional move (not the charge) is the gate, so a charge whose order has slipped away is refunded on the spot; a refund is the `ORDER_CANCELLED` listener, made at-most-once by the conditional `succeeded → refunded` move. Exposes the three HTTP-facing operations: create intent, confirm payment, and read-for-order.

## Key elements

- **`CONFIRMABLE_PAYMENT_STATUSES`** — readonly array `['requires_confirmation', 'declined']`. Deliberately an array (not a `Set`) because the same value is used both as a JS membership test and as the MongoDB `$in` array in conditional writes.
- **`REFUNDABLE_PAYMENT_STATUS`** — the constant `'succeeded'`; the only status from which money can be returned.
- **`resolvePayerId`** (private) — looks the payer up in `users`; if the record is gone, logs a warning and falls back to the order's stored user id. Never blocks the payment.
- **`callerScope`** (private) — owner-scope authorization built via `createOwnerScope` over `paymentRepository.ownerScope`; mirrors `orderService.callerScope` but over this module's collection.
- **`createIntent`** (export) — creates or refreshes the payment intent for an order. Amount is frozen through `orderTotal` so the intent matches the order's serializer. Re-asking (double-click) returns the existing intent; an order that can no longer reach `paid` returns **409** `PAYMENT_ORDER_NOT_PAYABLE`.
- **`confirmPayment`** (export) — the core charge flow, strictly ordered:
  1. Provider `charge`.
  2. Conditional order move (`statusesLeadingTo(paid)` → `paid`) via `orderRepository.updateStatusIfIn`.
  3. If the move fails (order gone / racing tab), immediately `provider.refund` and return 409.
  4. Update the payment row to `succeeded` with `cardLast4`.
  5. `inventoryService.commitForOrder` (result intentionally unchecked — a `false` means an expiry sweep won; inventory handles it).
  6. Emit `ORDER_STATUS_CHANGED` domain event.

  A provider **decline** updates the row to `declined` (re-asserting the confirmable-status filter) and returns **409** `PAYMENT_DECLINED`.
- **`getForOrder`** (export) — fetches the payment row scoped to the caller, then reads the order to derive the `pay` action (payability is a function of *both* payment status and order status, kept server-side).

## Relationships

| Neighbor | Interaction |
|---|---|
| `@modules/orders` (index) | Reads order via `orderService.getById`; writes order status via `orderRepository.updateStatusIfIn`; derives amount with `orderTotal`; asks payability via `canTransition` / `statusesLeadingTo`; emits `ORDER_STATUS_CHANGED`. |
| `@modules/orders/domain/totals.ts` | `orderTotal` is the single source of the charge amount, shared with the order serializer and confirmation email. |
| `@modules/orders/domain/lifecycle.ts` | `canTransition` and `statusesLeadingTo` define which order statuses are payable / transitionable; this module never hard-codes the set. |
| `@modules/inventory` (service) | `inventoryService.commitForOrder` releases held stock after a successful `pending → paid` move. |
| `@kernel/events.ts` | `emitDomainEvent` fires `ORDER_STATUS_CHANGED` on successful confirm. |
| `@kernel/authorization.ts` | `createOwnerScope` builds the caller-scoped query filter for the payment repository. |
| `@infrastructure/http/response.ts` | All returns are `generateSuccess` / `generateReject` envelopes. |
| `@infrastructure/http/request.ts` | `CallerContext` type is threaded through `confirmPayment` for audit / analytics attribution. |
| `@infrastructure/i18n/index.ts` | `t()` localises every user-facing error message. |
| `@infrastructure/observability/audit.ts` | `emitAuditEvent` / `buildAuditEvent` record `PAYMENT_CONFIRMED` and `PAYMENT_FAILED`. |
| `@infrastructure/observability/analytics/index.ts` | `emitAnalyticsEvent` / `buildAnalyticsBase` emit `PAYMENT_SUCCEEDED` or `PAYMENT_DECLINED`. |
| `@infrastructure/adapters/logger.ts` | `logger.warn` for unresolvable payer IDs. |

## Notes

- **Array, not Set.** `CONFIRMABLE_PAYMENT_STATUSES` is kept as a `readonly` array so the same reference works in both a JS `includes` check and a MongoDB `$in` clause without re-spreading.
- **The gate is the order, not the charge.** The conditional `pending → paid` write is what makes the confirm flow at-most-once and what triggers the instant-refund fallback. A successful provider charge with a lost order is *not* a committed payment.
- **Decline is the one backward step** in the payment lifecycle (`succeeded` is terminal except for the refund path; `declined` can be re-confirmed with a new card).
- **Inventory commit is fire-and-forget.** The boolean return of `commitForOrder` is deliberately ignored; a `false` means an expiry sweep raced ahead, which is an inventory concern, not a payment one.
- **Audit / analytics fire only on success and `PAYMENT_DECLINED`.** Other 409s (not found, not confirmable, order gone) are request-shape or race problems and are not attributed to a card event.
- **Payer resolution is best-effort.** A deleted user does not block payment; the order's user id is persisted unverified with a warning log.
