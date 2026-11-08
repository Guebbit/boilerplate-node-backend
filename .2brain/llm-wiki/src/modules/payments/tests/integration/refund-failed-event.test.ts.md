---
source: src/modules/payments/tests/integration/refund-failed-event.test.ts
sha256: e8dd3057d4021e96d96921b657f42287e7bd97df84e5bcc5e1a29c663e18e5b7
generated_at: 2026-11-08T07:35:04.196471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-failed-event.test.ts

## Purpose

Integration test verifying the deduplication and finality contract of the `payment.refund_failed` outbox event: a definite refusal emits a single `final: true` row; a transient refusal emits `final: false`; a retry failing with the same reason is silent; and a retry that fails with a *different* reason re-news the event. Runs against real Mongo with the fake payment provider's refusal lever.

## Key elements

- **`paidOrder()`** – Local helper (not exported). Creates a user, product, order, and a paid card payment; returns `{ orderId, failWith }` where `failWith(reason)` calls `setFakeRefundFailure` on the payment's `providerRef`.
- **`failedEvents()`** – Local helper. Reads all outbox rows named `PAYMENT_REFUND_FAILED`, sorted by `createdAt`, and maps them to their `payload` objects.
- **`describe('payment.refund_failed')`** – Two tests:
  - *final / definite refusal* – triggers a `declined` refusal, asserts one row with `final: true` and the closed reason.
  - *transient → repeat → final* – uses `withEnvironmentOverrides` to set `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'`, drives `paymentService.retryOpenRefunds()` twice (first with `provider_unavailable`, then `lost_or_stolen_card`), asserts the silence on the same-reason retry and the new event on the changed reason.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – supplies `setFakeRefundFailure`, the lever that tells the fake provider to reject the next refund with a given reason.
- **`src/kernel/events.ts`** – `resetDomainEvents` called in `afterEach` to clear the in-memory domain-event bus.
- **`src/kernel/outbox.ts`** – `outboxEventModel` (read side of the outbox) and `settleOutboxNudges` (flush pending outbox writes before asserting).
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUND_FAILED` constant used as the outbox `name` filter.
- **`src/modules/payments/module.ts`** – registered via `registerCheckoutModules` in `beforeEach` so the module's listeners/handlers are active.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` retrieves the `providerRef` needed to arm the fake failure.
- **`src/modules/payments/services/index.ts`** – `paymentService.retryOpenRefunds` drives the sweep that re-attempts open refunds.
- **`src/modules/payments/tests/factories.ts`** – `payByCard` (creates the paid state) and `refundOrderPayment` (issues the admin refund action).
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build the order under test.
- **`src/modules/products/tests/factories.ts`** – `createProduct` provides the line-item product.
- **`src/modules/users/tests/factories.ts`** – `createUser` provides the buyer.
- **`src/types/index.ts`** – `RefundFailureReason` type for the failure-reason parameter.
- **`tests/support/callers.ts`** – `asAdmin`, `callerContextAs` build the admin actor context for the refund action.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` wires the payments module into the test runtime.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` temporarily sets `NODE_PAYMENT_REFUND_RETRY_MINUTES` to make the retry sweep immediate.

## Notes

- The file uses **real MongoDB** (`setupTestDb`); the only fake is the payment provider's refusal behavior.
- The transient-refund test depends on `NODE_PAYMENT_REFUND_RETRY_MINUTES` being `'0'` so that `retryOpenRefunds` picks up the open refund without a real time delay; without this override the sweep would be a no-op in the test.
- Deduplication rule under test: the event is re-emitted only when the failure *reason* changes, not when the same reason recurs. This is the "silent on repeat" assertion.
- `settleOutboxNudges` must be awaited after every action that may enqueue outbox rows before querying `outboxEventModel`; forgetting it is a common source of flaky assertions here.
