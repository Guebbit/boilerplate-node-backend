---
source: src/modules/payments/tests/integration/hand-refund.test.ts
source_sha256: acb1d3744ffdcfc082f5b5b6cb73d53a2595ff7e7a558510ad8bd54aea8e2e86
context_sha256: b13592b97d0ea068ca1cf9241494d661ca51b8c35e908f2c77a1fb83bba5307f
generated_at: 2026-11-22T06:57:18.149060+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/hand-refund.test.ts

## Purpose
Integration tests (real Mongo, via the payments service's public API) for refunds on hand-paid (cash/offline) payments from the operator's side. They check that every path that opens a refund record leaves it `pending`, and that `paymentService.settleRefundByHand` is the only way to mark the money as returned.

## Key elements
- **Setup**: `setupTestDb()`. Before each test it registers the checkout modules with `paymentsModule` and installs an audit sink that collects entries into `audited`. After each test it calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- **Helpers**:
  - `cashOrder()` creates a user, a product at 50.00 and an order of 2 units, then records an offline cash payment as admin (100.00 total).
  - `paymentOf(orderId)` loads the stored payment through `paymentRepository` and throws if none exists.
  - `owedRows()` filters the audit entries for `payment.refund_owed_by_hand`.
  - `settle(paymentId, refundId)` calls `settleRefundByHand` as admin.
- **`the operator refunding a cash payment`**: `refundOrderPayment` with a 30.00 amount returns success. It leaves one `pending` refund with no `settledByHand`, and no `PAYMENT_REFUNDED` outbox event is written. It writes one `owed` audit row (target type `order`, metadata with `refundId`, `amount` and `reason: 'goodwill'`) and one `PAYMENT_REFUND_OWED_BY_HAND` outbox event with the expected payload.
- **`the cancel listener on a cash payment`**: `refundForOrder` opens one 100.00 `cancellation` record, one owed row and one outbox event, and a redelivery adds nothing. When a 30.00 operator refund is already pending, it opens the remaining 70.00 record and writes two owed rows.
- **`settleRefundByHand`**:
  - Settling one named record sets its status to `succeeded` and `settledByHand` to `true`, and leaves the other record `pending`.
  - It emits exactly one `PAYMENT_REFUNDED` event and writes an `admin.payment.refund_settled_by_hand` audit row. It does not write `admin.payment.refunded`, and it writes no new owed row.
  - A record that is already settled gives 409 `PAYMENT_REFUND_NOT_OPEN`.
  - A card refund left `failed` after a provider error gives 409 `PAYMENT_REFUND_IN_FLIGHT`, because the sweep owns it.
  - An unknown refund id gives 404.
  - `getForOrder` exposes `actions.settleRefundByHand` (the open refund ids) to admins and to moderators, so the flag follows the `create:Refund` key.
- **`refundLegalDue`**: returns `undefined` when no deadline is set or the refund does not exist. Otherwise it returns `{ dueBy, dueRule }` as stamped on the refund.

## Relationships
- **Service and data**: it calls `paymentService` (`src/modules/payments/services/index.ts`, which provides `recordOfflinePayment`, `settleRefundByHand`, `getForOrder` and `refundLegalDue`), reads state through `paymentRepository` (`src/modules/payments/repository.ts`), and loads `paymentsModule` (`src/modules/payments/module.ts`) through `registerCheckoutModules` (`tests/support/checkout-modules.ts`).
- **Events and outbox**: `PAYMENT_REFUND_OWED_BY_HAND` and `PAYMENT_REFUNDED` come from `src/modules/payments/events.ts`. The tests query `outboxEventModel` and call `settleOutboxNudges` from `src/kernel/outbox.ts`, and they call `resetDomainEvents` from `src/kernel/events.ts`.
- **Audit**: `registerAuditSink` and `AuditEntry` come from `src/infrastructure/observability/audit.ts`.
- **Factories and callers**:
  - `createUser`, `createProduct`, and `createOrder`/`toOrderItem` come from the users, products and orders factories (`src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts`, `src/modules/orders/tests/factories.ts`).
  - `refundOrderPayment`, `refundForOrder` and `payByCard` come from the payments `src/modules/payments/tests/factories.ts`.
  - `asAdmin`, `asModerator` and `callerContextAs` come from `tests/support/callers.ts`.
- **Provider double**: `fakePaymentProvider` (`scenarios/support/doubles/payments/fake.ts`) has `refund` mocked to reject once for the in-flight case.
- **Not imported directly**: `src/modules/payments/services/refunds.ts` is not imported here, so it is reached only through the service.

## Notes
- The first test checks that a pending record stays unsettled "however privileged the caller" (an admin here).
- The cancel listener has no caller, so its owed rows are attributed to the system.
- Outbox assertions run after `settleOutboxNudges()`.
- Two imports use the `@tests/...` alias with paths (`@tests/checkout-modules`, `@tests/callers`) that differ from the `tests/support/...` paths in the graph.
