---
source: src/modules/payments/tests/integration/refunds.test.ts
sha256: 7015413dbd3141a00bd62b53ebc01642d978cbb7b9ef33d38515a2f899aba3e3
generated_at: 2026-11-14T21:18:43.284950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refunds.test.ts

## Purpose

Integration tests for the refund flow on a payment record. Uses **real MongoDB** (via `setupTestDb`) and a fake payment provider to verify the conditional-write invariants: partial refunds keep the remainder refundable, racing refunds cannot overdraw, a provider refusal leaves the record open for the sweep to retry with the same idempotency key, and validation rejects bad amounts/currencies before any provider call.

## Key elements

- **`paidOrder()`** – fixture: creates a user, a 50.00-EUR product, a 2-unit order (100.00 total), pays by card, and settles outbox nudges so the settlement rows are visible.
- **`paymentOf(orderId)`** – looks up the payment; throws if absent (a missing payment is a test bug, not a branch).
- **`refund(orderId, body)`** – shorthand that calls `refundOrderPayment` with an admin caller context.
- **`describe('a partial refund', …)`** – verifies: recording a refund row, cumulative `amountRefunded`, default full-remaining refund when no amount is given, minor-unit arithmetic (0.10 + 0.20 = 0.30), per-refund idempotency keys, `PAYMENT_REFUNDED` domain event payloads (`amount`, `full`, `refundId`).
- **`describe('a refund that asks for too much', …)`** – verifies 422 for over-amount, wrong currency, sub-minor-unit amounts; 409 for "refund all" on an already-fully-refunded payment; the **racing-refund** guarantee (two concurrent 60.00 refunds → only one succeeds); and the **sweep-settle race** where the sweep finishes the record before the opener returns from the provider (caller still sees success).
- **`describe('a refund the provider refuses', …)`** – verifies the record stays open as `failed`, the provider's internal error message never leaks to the caller, and the sweep can later retry with the same idempotency key.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider` is spied on or mock-rejected to simulate provider success/failure without a real PSP.
- **`src/infrastructure/observability/audit.ts`** – the module is replaced at import time so audit side-effects do not hit a live sink during tests.
- **`src/kernel/events.ts`** – `onDomainEvent` / `resetDomainEvents` subscribe to and clean up `PAYMENT_REFUNDED` between tests.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` advances the relay so outbox rows are published before the next assertion (mirrors the delay a real cancel would see).
- **`src/modules/payments/module.ts`** – `paymentsModule` is registered in `beforeEach` via `registerCheckoutModules`.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUNDED` constant used for event assertions.
- **`src/modules/payments/model.ts`** – `paymentModel` imported (available for direct-document queries if needed).
- **`src/modules/payments/presenter.ts`** – `presentPayment` imported for response-shape assertions.
- **`src/modules/payments/audit.ts`** – `paymentsAuditActions` imported (likely for audit-action assertions).
- **`src/modules/payments/providers/index.ts`** – re-exports `PaymentProviderError` used in provider-failure tests.
- **`src/modules/payments/providers/errors.ts`** – error type definitions referenced by the provider-failure assertions.
- **`src/modules/orders/index.ts`** – `orderService` and `withdrawalRefundDueBy` (the latter for refund-for-return scenarios).
- **`src/modules/orders/services/index.ts`** – order service layer used indirectly through `orderService`.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `readOrder` build the order fixture.
- **`src/modules/orders/domain/withdrawal.ts`** – `withdrawalRefundDueBy` helper for return-driven refund deadlines.

## Notes

- **Real Mongo, not in-memory.** The tests are intentionally integration-level: the invariants under test (conditional `findOneAndUpdate` / atomic `$inc` guards) only hold against a real store.
- **`settleOutboxNudges()` is load-bearing.** Without it, outbox rows written by the settlement pipeline are not yet visible, and a subsequent cancel/refund assertion will see stale state.
- **Sweep race test** uses `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` to make the retry sweep fire immediately, then intercepts the provider call to let the sweep settle the record before the opener returns.
- **Provider error isolation.** A dedicated test asserts the wire response never carries the provider's internal error text—only a generic refusal is returned to the caller.
