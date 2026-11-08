---
source: src/modules/payments/tests/integration/refund-cancel.test.ts
sha256: ab9562c73d66c93e3b470262eb6f121774e3305627282e1cc32bb761adfd2987
generated_at: 2026-11-08T07:34:14.294552+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-cancel.test.ts

## Purpose

Integration test for `paymentService.cancelRefund`, verifying the full business rule: a refund may be voided only if money provably did not move (hand-paid `pending`, or a card refusal with a clear reason). It asserts the happy path (status flip, share release, audit, timeline, outbox event) and every rejection path (already settled, unclear/in-flight, double-cancel, unknown id), including a race against the retry sweep. Runs against real Mongo through the service's public API.

## Key elements

- **`freshOrder()`** – Creates a user, a product at 50.00, and a 2-unit order (total 100.00); returns ids.
- **`paymentOf(orderId)`** – Fetches the stored payment document via `paymentRepository.findByOrderId`.
- **`cashRefund()`** – Records a cash payment, then issues a hand-paid refund of 30.00 (status `pending`); returns ids.
- **`refusedRefund(reason)`** – Pays by card, settles outbox, injects a provider refusal via `setFakeRefundFailure`, issues a 30.00 refund; returns ids.
- **`cancel(paymentId, refundId, note?)`** – Thin wrapper around `paymentService.cancelRefund` with admin caller context.
- **`describe('cancelling a hand-paid refund that waits')`** – Happy path: status→`failed`/`canceled`, `amountRefunded`→0, exactly one `PAYMENT_REFUND_CANCELED` outbox row, audit entry, timeline row (note text excluded from timeline), no `PAYMENT_REFUNDED` event, actions list updates, released share re-refundable, second cancel → 409 `PAYMENT_REFUND_NOT_OPEN`, hand-settle after cancel → 409, unknown refund → 404, full refund after cancel shows `displayStatus: 'refunded'`.
- **`describe.each(['declined','insufficient_funds'])`** – Clear card refusal is voidable; verifies the retry sweep (`retryOpenRefunds`) never re-sends it and `listAttention` is empty.
- **`describe.each(['provider_unavailable','unknown'])`** – Unclear refusal is **not** voidable → 409 `PAYMENT_REFUND_IN_FLIGHT`; record unchanged.
- **`describe('cancelling a refund that already paid out')`** – Settled refund → 409 `PAYMENT_REFUND_NOT_OPEN`.
- **`describe('cancelling against a racing sweep')`** – Mocks `paymentRepository.cancelRefund` to interleave `claimRefund` mid-write, asserting the 409 `PAYMENT_REFUND_IN_FLIGHT` guard.

## Relationships

- **`src/modules/payments/services/index.ts`** – System under test: `paymentService.cancelRefund`, `.settleRefundByHand`, `.getForOrder`, `.retryOpenRefunds`, `.listAttention`.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` for reads; `cancelRefund` and `claimRefund` spied in the race test.
- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider` (spy target) and `setFakeRefundFailure` (injects refusal reason).
- **`src/kernel/outbox.ts`** – `outboxEventModel.countDocuments` to verify exactly one zero events; `settleOutboxNudges` to flush async processing before assertions.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach`.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUNDED`, `PAYMENT_REFUND_CANCELED` event-name constants for outbox assertions.
- **`src/modules/payments/module.ts`** – Registered via `registerCheckoutModules` in `beforeEach` to wire the module into the test app.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` captures entries into the module-level `audited` array; `AuditEntry` type for assertions.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` bootstraps the module under test.
- **`tests/support/callers.ts`** – `asAdmin`, `callerContextAs('admin')` for caller/auth context.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundOrderPayment` to drive the refund lifecycle before cancel.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `timelineOf` (timeline assertion).
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** – `createUser`, `createProduct` for order setup.
- **`src/types/index.ts`** – `RefundFailureReason` union used in `describe.each` and `refusedRefund` parameter.

## Notes

- Uses **real Mongo** (`setupTestDb`); no in-memory DB. The service's public API is the only write path except where the race test intentionally mocks the repository.
- `settleOutboxNudges()` **must** be awaited before counting outbox rows; the outbox consumer is async.
- `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` forces the retry sweep to be eligible in the same tick; only the card-refusal and race tests need this.
- The timeline assertion explicitly checks that the free-text `note` ("refunded in the dashboard too") is **not** persisted in the timeline row—only in the audit `metadata`.
- The race test mocks `paymentRepository.cancelRefund` with `mockImplementationOnce` to simulate `claimRefund` firing between the service's read and write, exercising the optimistic-lock guard.
- `audited` is a module-level `let` reset in `beforeEach`; the double-cancel test clears it mid-test to assert no second audit row.
