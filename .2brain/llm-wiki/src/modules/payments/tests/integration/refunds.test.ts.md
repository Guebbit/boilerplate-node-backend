---
source: src/modules/payments/tests/integration/refunds.test.ts
sha256: 063426de82c75c311de74bf82b9d258837d25edb7c329e8569db136304cb477b
generated_at: 2026-10-15T11:35:27.322244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refunds.test.ts

## Purpose

Integration tests for the refund lifecycle: partial and full refunds, over-refund rejection, concurrent (racing) refunds, provider-failure handling, and the sweep (`retryOpenRefunds`) path. Runs against a real MongoDB instance (`setupTestDb`) because the guarantees under test—conditional writes, idempotency-key uniqueness, and atomic `amountRefunded` accounting—depend on the database's own concurrency semantics.

## Key elements

- **`paidOrder()`** – Fixture helper: creates a user, a 50-unit product × 2, an order, a payment intent, and confirms the card payment (total 100 EUR). Returns `{ user, order, orderId }`.
- **`paymentOf(orderId)`** – Fetches the payment document via `paymentRepository.findByOrderId`; throws if absent (a test bug, not a handled case).
- **`refund(orderId, body)`** – Thin wrapper over `refundByOrder` that supplies admin caller context and an optional `{ amount, currency }` body.
- **`describe('a partial refund')`** – Verifies: refund recorded with correct amount/currency/status; payment stays `succeeded` until fully refunded; `full` flag on `PAYMENT_REFUNDED` event; per-refund idempotency keys are distinct; minor-unit arithmetic (0.10 + 0.20 = 0.30) never drifts.
- **`describe('a refund that asks for too much')`** – 422 for over-remaining, wrong currency, or sub-minor-unit amounts; 409 when no amount given and nothing left; racing refunds (two concurrent 60 on a 100 payment) result in exactly one success; sweep-settles-an-open-refund race returns success to the original caller.
- **`describe('a refund the provider refuses')`** – Provider rejection marks the refund `failed` with `failureReason: 'unknown'`; the amount is still counted in `amountRefunded` so the sweep can retry; `presentPayment` output omits internal fields (`lastError`, `failureReason`, `idempotencyKey`).

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider` is spied on (to assert call arguments and idempotency keys) and mocked (to simulate provider rejections and to inject a sweep call mid-refund).
- **`src/kernel/events.ts`** – `onDomainEvent` subscribes to `PAYMENT_REFUNDED` for event assertions; `resetDomainEvents` clears listeners in `afterEach`.
- **`src/kernel/outbox.ts`** – `outboxEventModel` / `settleOutboxNudges` imported for outbox-level assertions (visible in truncated portion).
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `readOrder` build the order fixture that the payment is attached to.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUNDED` constant used as the domain-event discriminator.
- **`src/modules/payments/module.ts`** – `paymentsModule` registered in `beforeEach` so the full module wiring (routes, services, providers) is active.
- **`src/modules/payments/presenter.ts`** – `presentPayment` used to assert that internal refund fields never appear on the public wire representation.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` is the sole way tests read persisted payment/refund state.
- **`src/modules/payments/services/index.ts`** – `createIntent`, `confirmPayment`, `refundByOrder`, `retryOpenRefunds` are the production functions under test.
- **`src/modules/payments/providers/index.ts`** – `PaymentProviderError` imported for type-level assertions on provider failures.

## Notes

- **Real Mongo, not in-memory.** The file's own docblock states the conditional-write guarantees *are* the thing under test; replacing Mongo with an in-memory store would invalidate the racing-refund and sweep tests.
- **`paymentOf` throws, it does not null-coalesce.** A missing payment means the fixture or service is broken, not a valid branch to assert on.
- **Sweep test sets `NODE_PAYMENT_EFFECT_RETRY_MINUTES` to `'0'`** via `withEnvironment` so the background sweep is eligible to run synchronously within the test.
- **Amounts are in major currency units** (30, 70, 0.10)—not minor units—matching the API contract; the test explicitly guards that the system handles sub-unit precision without drift.
- **The provider-refusal test asserts the wire contract** through `presentPayment`, not through the raw document, ensuring the API never leaks `idempotencyKey`, `lastError`, or `failureReason` to the client.
