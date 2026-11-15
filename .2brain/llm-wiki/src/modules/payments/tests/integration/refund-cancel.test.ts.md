---
source: src/modules/payments/tests/integration/refund-cancel.test.ts
sha256: 42432f4c5b24d266728cac5f96c98977029e54cb7a4e36c6214439404fb0e462
generated_at: 2026-11-14T21:15:38.273433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-cancel.test.ts

## Purpose
Integration tests for the **cancel (void) refund** operation. They verify that staff can void only refunds whose money provably did not move (hand-paid `pending`, card refusal with a clear reason) while settled refunds, unclear failures, and in-flight attempts are rejected. Tests run against real MongoDB via the payment service's public API.

## Key elements
- **`freshOrder()`** – creates a 100.00 order (2 × 50.00) with a user and product; returns `orderId`.
- **`cashRefund()`** – records an offline cash payment then opens a 30.00 `pending` refund; returns IDs for the cancel call.
- **`refusedRefund(reason)`** – pays by card, then triggers a provider refund that fails with the given `RefundFailureReason`.
- **`cancel(paymentId, refundId, note?)`** – thin wrapper around `paymentService.cancelRefund` (the SUT entry point).
- **`describe('cancelling a hand-paid refund that waits')`** – the success path: status → `failed/canceled`, `amountRefunded` resets, exactly one `PAYMENT_REFUND_CANCELED` outbox event, one audit row, one timeline entry, no `PAYMENT_REFUNDED` event, actions list updates, released share re-refundable, idempotency (409), 404 for unknown refund, display-status transitions.
- **`describe.each(['declined','insufficient_funds'])`** – voids a clearly-refused card refund; verifies the retry sweep (`retryOpenRefunds`) never re-sends it and the attention list is empty.
- **`describe.each(['provider_unavailable','unknown'])`** – unclear failures: cancel is refused with `PAYMENT_REFUND_IN_FLIGHT`; record and `amountRefunded` unchanged.
- **`describe('cancelling a refund that already paid out')`** – settled refund → 409 `PAYMENT_REFUND_NOT_OPEN`.
- **`describe('cancelling against a racing sweep')`** – race between operator cancel and the background sweep claiming the refund (truncated in source).

## Relationships
- **`src/modules/payments/services/index.ts`** – `paymentService` is the system under test (`cancelRefund`, `getForOrder`, `settleRefundByHand`, `retryOpenRefunds`, `listAttention`).
- **`src/modules/payments/repository.ts`** – used to read persisted payment state after each operation for assertions.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUNDED` / `PAYMENT_REFUND_CANCELED` used as outbox query keys.
- **`src/modules/payments/module.ts`** – registered in `beforeEach` via `registerCheckoutModules`.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` triggers async dispatch; `outboxEventModel` counts emitted events.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in `afterEach` to prevent cross-test leakage.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` collects `AuditEntry` rows for assertions.
- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider`, `setFakeRefundFailure` simulate card-provider outcomes.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundOrderPayment` set up payment/refund preconditions.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `timelineOf` for order setup and timeline assertions.
- **`src/modules/orders/index.ts`** – provides the order service used to read API-serialised payment status.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`** – create the user and product fixtures.

## Notes
- Tests hit **real MongoDB** (`setupTestDb`); only the external card provider is faked.
- The audit sink is re-registered and cleared in `beforeEach`; individual tests can re-reset `audited = []` mid-test to isolate a second call.
- `withEnvironmentOverrides` sets `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` so the sweep runs synchronously in the refused-card scenarios.
- `deliver` and `stampOf` are imported/defined but their usage falls in the truncated tail of the file.
- The file exercises the service's **public API** exclusively—no direct repository mutations—so it guards against regressions at the orchestration layer.
