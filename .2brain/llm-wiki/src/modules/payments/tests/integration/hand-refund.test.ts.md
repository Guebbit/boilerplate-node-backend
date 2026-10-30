---
source: src/modules/payments/tests/integration/hand-refund.test.ts
sha256: 65e45b435c3ad5b33d9aa290bd6d5cb1297958bd4641e6cf8b0e848e39a3b46e
generated_at: 2026-10-29T05:16:51.395445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/hand-refund.test.ts

## Purpose

Integration tests for the operator-facing cash-refund workflow against a real MongoDB instance. They verify that every path that opens a refund record leaves it `pending`, that `settleRefundByHand` is the sole gate that marks money as returned, and that the correct domain events, audit rows, and permission flags are produced at each step.

## Key elements

- **`cashOrder()`** — builds a user, a 50-unit product, a 2-unit order, and records a 100.00 cash payment via `paymentService.recordOfflinePayment`.
- **`paymentOf(orderId)`** — fetches the stored payment document through `paymentRepository.findByOrderId`.
- **`owedRows()`** — filters the in-test audit sink for `payment.refund_owed_by_hand` entries.
- **`settle(paymentId, refundId)`** — calls `paymentService.settleRefundByHand` as an admin.
- **`describe("the operator refunding a cash payment")`** — asserts a pending refund record, zero `PAYMENT_REFUNDED` outbox events, one `PAYMENT_REFUND_OWED_BY_HAND` audit row and outbox event.
- **`describe("the cancel listener on a cash payment")`** — verifies idempotent re-delivery (one record, one owed row) and correct splitting when a partial goodwill refund already exists.
- **`describe("settleRefundByHand")`** — covers: settling a specific record (event, audit, flags, untouched siblings); double-settle → `PAYMENT_REFUND_NOT_OPEN` (409); in-flight card refund → `PAYMENT_REFUND_IN_FLIGHT` (409); unknown refund id → 404; visibility of the `settleByHand` action for admin and moderator.
- **`describe("refundDueAt")`** — checks the computed deadline: `createdAt + paymentAttentionMinutes()` for goodwill refunds, `createdAt + 14 days` when a `returnId` is set, `undefined` for a missing refund.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider.refund` is spied on to simulate a provider timeout, forcing the in-flight rejection path.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` captures audit entries into a per-test array; `AuditEntry` types the collected rows.
- **`src/kernel/events.ts`** — `resetDomainEvents()` is called in `afterEach` to clear the in-process event bus between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried to assert which domain events were enqueued; `settleOutboxNudges()` flushes the outbox before assertions.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build the order fixture.
- **`src/modules/payments/events.ts`** — `PAYMENT_REFUND_OWED_BY_HAND` and `PAYMENT_REFUNDED` constants identify the outbox rows under test.
- **`src/modules/payments/module.ts`** — `paymentsModule` is registered via `registerCheckoutModules` so listeners (e.g. cancel → refund) are active.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` is the read path used throughout.
- **`src/modules/payments/services/index.ts`** — `paymentService` (record, refund, settle, `getForOrder`, `refundDueAt`) and `paymentAttentionMinutes` are the public API under test.
- **`src/modules/payments/tests/factories.ts`** — `refundOrderPayment`, `payByCard`, `refundForOrder` drive the happy and card-refund paths.
- **`src/modules/products/tests/factories.ts`** / **`src/modules/users/tests/factories.ts`** — `createProduct`, `createUser` build domain fixtures.
- **`tests/support/callers.ts`** — `asAdmin`, `asModerator`, `callerContextAs` supply the caller / permission context for each service call.

## Notes

- Real MongoDB via `setupTestDb()`; only the payment provider is faked (and only to inject a failure).
- `settleOutboxNudges()` must be awaited before asserting on `outboxEventModel` counts—outbox writes are transactional and not yet flushed otherwise.
- The audit sink is re-registered in every `beforeEach`; the collected array is test-local, so assertions never see cross-test leakage.
- The test deliberately asserts the **absence** of `PAYMENT_REFUNDED` at refund-open time—only the settle step may emit it. This is the core invariant of the "hand" flow.
