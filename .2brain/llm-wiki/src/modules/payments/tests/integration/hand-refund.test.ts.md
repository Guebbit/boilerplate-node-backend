---
source: src/modules/payments/tests/integration/hand-refund.test.ts
sha256: 80a96f91fdf88458d686cebcf54b0ec7156f92cd0b086de46ba1f36c8c6de973
generated_at: 2026-11-08T07:32:39.836471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/hand-refund.test.ts

## Purpose

Integration test suite for the "hand refund" workflow on offline (cash) payments. It verifies, against a real Mongo instance, that operator-initiated refunds open a `pending` record, that `settleRefundByHand` is the sole path to confirm the money went back, and that the cancel listener, audit trail, outbox announcements, permission visibility, and legal-due-date logic all behave correctly.

## Key elements

- **`cashOrder()`** – Local helper: creates a user, a 50.00 product, an order for 2 units, and records a 100.00 cash payment via `paymentService.recordOfflinePayment`.
- **`paymentOf(orderId)`** – Fetches the persisted payment document by order ID from `paymentRepository`.
- **`owedRows()`** – Filters the captured `AuditEntry[]` for `payment.refund_owed_by_hand` actions.
- **`settle(paymentId, refundId)`** – Shorthand for `paymentService.settleRefundByHand` as an admin caller.
- **`describe('the operator refunding a cash payment')`** – Asserts a partial refund opens one pending record, writes one owed audit row with operator metadata, and announces `PAYMENT_REFUND_OWED_BY_HAND` in the outbox (no `PAYMENT_REFUNDED` yet).
- **`describe('the cancel listener on a cash payment')`** – Verifies duplicate cancel events are idempotent (one refund, one owed row), and that a prior partial operator refund plus a cancellation produce the correct complementary amounts.
- **`describe('settleRefundByHand')`** – Covers: successful settlement (status, `settledByHand` flag, `PAYMENT_REFUNDED` outbox event, `admin.payment.refund_settled_by_hand` audit row); 409 `PAYMENT_REFUND_NOT_OPEN` on double-settle; 409 `PAYMENT_REFUND_IN_FLIGHT` for a failed card refund; 404 for an unknown refund ID; and that the `settleByHand` action is visible to both admin and moderator callers.
- **`describe('refundLegalDueAt')`** – Asserts the method returns `undefined` with no legal deadline, returns `createdAt + 14 days` when a `returnId` is present, and `undefined` for a missing refund ID.

## Relationships

- **`src/modules/payments/services/index.ts`** – Primary SUT; all assertions go through `paymentService` (`recordOfflinePayment`, `settleRefundByHand`, `getForOrder`, `refundLegalDueAt`).
- **`src/modules/payments/services/refunds.ts`** – Backing implementation reached transitively through the services barrel; the test exercises its public surface.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` reads persisted state after each service call.
- **`src/modules/payments/events.ts`** – Event names (`PAYMENT_REFUND_OWED_BY_HAND`, `PAYMENT_REFUNDED`) used in outbox assertions.
- **`src/modules/payments/module.ts`** – Registered in `beforeEach` via `registerCheckoutModules` to wire the module under test.
- **`src/modules/payments/tests/factories.ts`** – Provides `refundOrderPayment` (operator partial refund) and `refundForOrder` (cancel-listener trigger), plus `payByCard` for the in-flight test.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` captures every `AuditEntry` into the local `audited` array for assertions.
- **`src/kernel/outbox.ts`** – `outboxEventModel` queried to assert announced events; `settleOutboxNudges()` flushes the outbox before counting.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach` to prevent cross-test leakage.
- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider.refund` spied and made to reject, simulating an unclear card-refund result.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` binds the payments module into the test request pipeline.
- **`tests/support/callers.ts`** – `asAdmin`, `asModerator`, `callerContextAs` supply the auth/caller context for each service call.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** – Fixture builders for the user, product, and order that anchor every scenario.

## Notes

- This is a **real-Mongo** integration test (`setupTestDb`), not an in-memory or mocked-DB test. It exercises the full service → repository → outbox path.
- `settleOutboxNudges()` must be awaited **before** asserting `PAYMENT_REFUNDED` counts; without it the outbox may not have flushed the nudge.
- The cancel-listener idempotency test calls `refundForOrder` twice and expects **one** refund row — the system deduplicates by order + reason, not by call count.
- The in-flight card test uses `jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(...)` to force a provider failure; the refund record ends up `failed`, and hand-settling it is rejected with 409.
- The `refundLegalDueAt` return-linked test mutates the payment document directly (`refund.returnId = 'return-1'; await payment.save()`) to simulate a linked return without going through a separate domain flow.
- The file intentionally does **not** test `refundLegalDueAt` with a custom `legalDays` override — only the default (no deadline → `undefined`, return-linked → 14 days) is covered here.
