---
source: src/modules/payments/tests/integration/refund-cancel.test.ts
source_sha256: 42432f4c5b24d266728cac5f96c98977029e54cb7a4e36c6214439404fb0e462
context_sha256: 549208c7e10f3bbc1d3d41170e93f6c96b8c447feb29d56bf8ae3c8e8060fd61
generated_at: 2026-11-22T06:58:49.878109+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-cancel.test.ts

## Purpose
Integration test (real Mongo, via the services' public API) for staff voiding a refund that must never be paid. Only refunds whose money provably did not move may be voided: a hand-paid `pending` refund and a clear card refusal. Settled refunds, unclear failures and in-flight attempts are rejected. A voided refund releases its share, sends no mail, issues no credit note and is never sent.

## Key elements
- `setupTestDb()` and a `beforeEach` that registers `paymentsModule` via `registerCheckoutModules` and installs an audit sink collecting entries into `audited`. `afterEach` calls `resetDomainEvents` and `jest.restoreAllMocks`.
- Helpers:
  - `freshOrder`: a 100.00 order (two units at 50.00).
  - `paymentOf`: loads the stored payment by order id.
  - `cashRefund`: an offline cash payment with a 30.00 `pending` hand-paid refund.
  - `refusedRefund(reason)`: a card payment whose 30.00 refund the fake provider refuses with the given `RefundFailureReason`.
  - `stampOf`: the order's serialized payment status.
  - `cancel`: calls `paymentService.cancelRefund` as admin.
- Test groups:
  - **Hand-paid refund that waits**:
    - Closes the record as `failed` with reason `canceled`, sets `amountRefunded` back to `0.00`, and writes one `PAYMENT_REFUND_CANCELED` outbox event, one `admin.payment.refund_canceled` audit row and one `refund_canceled` timeline row. The timeline row does not contain the operator's note.
    - Emits no `PAYMENT_REFUNDED` event.
    - `actions.cancelRefund` lists the refund while open and is empty after cancel. `displayStatus` stays `succeeded`.
    - The released share can be refunded again (100.00).
    - A second cancel gives 409 `PAYMENT_REFUND_NOT_OPEN` and writes no audit.
    - The refund cannot be settled by hand afterwards.
    - An unknown refund id gives 404.
    - After cancelling and then settling a full refund, `displayStatus` is `refunded`.
  - **Card refund refused as `declined` or `insufficient_funds`** (`describe.each`): cancel succeeds. `retryOpenRefunds` does not call the provider's `refund`, and `listAttention` is empty. Runs with `NODE_PAYMENT_REFUND_RETRY_MINUTES=0`.
  - **Card refund left unclear as `provider_unavailable` or `unknown`** (`describe.each`): 409 `PAYMENT_REFUND_IN_FLIGHT`, state unchanged (`amountRefunded` stays `30.00`), and `cancelRefund` is not offered.
  - **Already paid out**: 409 `PAYMENT_REFUND_NOT_OPEN`, and `amountRefunded` stays `30.00`.
  - **Racing sweep**: expects 409 `PAYMENT_REFUND_IN_FLIGHT` when the record was claimed in between. The rest of this group is not visible here.

## Relationships
- `@modules/payments/services` (`paymentService`): `cancelRefund`, `settleRefundByHand`, `getForOrder`, `retryOpenRefunds`, `listAttention`, `recordOfflinePayment`.
- `@modules/payments/repository`: `paymentRepository` is used to read stored payment state.
- `@modules/payments/events`: provides the `PAYMENT_REFUNDED` and `PAYMENT_REFUND_CANCELED` event names, checked against `outboxEventModel` in `@kernel/outbox`.
- `@kernel/outbox`: `settleOutboxNudges` flushes outbox events before assertions.
- `@kernel/events`: `resetDomainEvents` is called in `afterEach`.
- `@modules/payments/module`: registered through `registerCheckoutModules`.
- `@scenarios/support/doubles/payments/fake`: `fakePaymentProvider` (spied on) and `setFakeRefundFailure` (forces a refusal reason). `addFakeExternalRefund` is imported there too.
- `@infrastructure/observability/audit`: `registerAuditSink` captures audit entries.
- `@modules/payments/tests/factories` (`payByCard`, `refundOrderPayment`) and `@modules/payments/tests/deliver` (`deliver`): payment test helpers.
- `@modules/orders` (`orderService`) and `@modules/orders/tests/factories` (`createOrder`, `toOrderItem`, `timelineOf`, `markOrderPaidAt`): order setup and timeline reads.
- `@modules/users/tests/factories` and `@modules/products/tests/factories`: create the user and product for each order.

## Notes
- The test caller is always an admin (`asAdmin()` plus `callerContextAs('admin')`).
- Failures are asserted through `asReject(...)` for `status` and `errors[0].code`.
- `stampOf`, `deliver`, `markOrderPaidAt` and `addFakeExternalRefund` are imported or defined in the visible portion but not used there. They may be used in the part of the file that is not shown.
