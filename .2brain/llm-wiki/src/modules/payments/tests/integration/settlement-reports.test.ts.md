---
source: src/modules/payments/tests/integration/settlement-reports.test.ts
sha256: b0ef0d375b0900af7da5ff502bfc2ba2faf6df5089fdb9b8e67cfb30bfc12b76
generated_at: 2026-10-15T11:37:03.198224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-reports.test.ts

## Purpose

Integration tests that verify settlement reports — the `payment.failed` domain event, the corresponding audit row, and the analytics event — are emitted exactly **once per real state transition**, even when multiple code paths (confirm + webhook for the same decline, repeated `syncPayment` polls) observe that transition. Runs against a real MongoDB instance.

## Key elements

- **`openIntent()`** — helper that creates a user, a product (on-hand), an order, and an unconfirmed payment intent; returns the IDs needed by every test.
- **`confirmWith(paymentId, user, method)`** — thin wrapper around `confirmPayment` using the given card method string (e.g. `pm_card_declined`, `pm_card_visa`).
- **`failedRows()`** — settles outbox nudges then counts `PAYMENT_FAILED` documents in the outbox collection.
- **`describe('a declined payment')`** — three cases:
  - Webhook after confirm for the same attempt → exactly 1 `PAYMENT_FAILED` in the outbox.
  - Two different cards declined in turn → exactly 2 (two attempts, two events).
  - Multiple `syncPayment` polls after a single decline → audit and analytics each fire once.
- **`describe('a payment that already succeeded')`** — repeated `syncPayment` after a successful confirm → audit and analytics each fire once.
- **`describe('a confirm that loses the race')`** — simulates a webhook flipping the payment to `succeeded` while the provider's confirm promise is still in flight; asserts the confirm response reflects the new status, not the stale pre-read.
- **Jest mocks for audit & analytics ports** — `emitAuditEvent` and `emitAnalyticsEvent` are replaced (not spied); `recordAudit` is rerouted so a spy on `emitAuditEvent` still catches every call. Spies are attached via `observePort`.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — provides `fakePaymentProvider`, the in-test card processor. The race test spies on its `confirm` to inject a mid-flight status flip.
- **`src/infrastructure/observability/audit.ts`** — mocked module; `emitAuditEvent` and `recordAudit` are replaced so the test can assert exactly-once audit emission.
- **`src/infrastructure/observability/analytics/index.ts`** — mocked module; `emitAnalyticsEvent` is replaced for the same exactly-once assertion on analytics.
- **`src/kernel/events.ts`** — `resetDomainEvents()` called in `afterEach` to clear the in-memory domain-event bus between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` (Mongo model) and `settleOutboxNudges` (triggers pending outbox relays) are used to count and flush settlement events.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — `orderService.create` builds the order that the payment intent references.
- **`src/modules/payments/services/index.ts`** — re-exports `createIntent`, `confirmPayment`, `syncPayment`, `applyWebhookSettlement`, the four payment-service entry points exercised here.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` (read current state) and `updateStatusIfIn` (optimistic status flip used in the race test).
- **`src/modules/payments/events.ts`** — `PAYMENT_FAILED` event name used in the outbox count query.
- **`src/modules/payments/audit.ts`** — `paymentsAuditActions` enum (e.g. `PAYMENT_FAILED`, `PAYMENT_CONFIRMED`) used to filter audit spy calls.
- **`src/modules/payments/analytics.ts`** — `paymentsAnalyticsEvents` enum (e.g. `PAYMENT_DECLINED`, `PAYMENT_SUCCEEDED`) used to filter analytics spy calls.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered in `beforeEach` via `registerCheckoutModules` to wire DI for the test.

## Notes

- The audit mock is a **replacement**, not a spy, because `recordAudit` in the real module closes over its own `emitAuditEvent`. The mock re-implements `recordAudit` to route through the replaced `emitAuditEvent`, keeping the spy contract intact (see the inline comment in the file).
- `settleOutboxNudges()` must be awaited **before** counting outbox documents; without it, events that were queued but not yet relayed are invisible to the count.
- The race test uses `mockImplementationOnce` on `fakePaymentProvider.confirm` to interleave a `paymentRepository.updateStatusIfIn` call inside the provider's promise resolution, simulating a webhook that wins the race. The assertion is on the **returned** status, not on the database.
- Real Mongo is used for all payment/order data; no in-memory repository fakes are involved in the data layer.
