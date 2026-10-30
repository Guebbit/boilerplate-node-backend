---
source: src/modules/payments/tests/integration/external-refunds.test.ts
sha256: 7e612c717b40adf98ca3e2c2db583d01894ae4576a75b5d9c6c4d68e4d734074
generated_at: 2026-10-29T05:16:29.128337+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/external-refunds.test.ts

## Purpose

Integration tests for refunds initiated outside the application (in the provider's dashboard) and discovered via a refund webhook event. Covers import-once semantics, idempotent re-delivery, partial and over-refunds, matching of our-own refunds, and the "overtaken" scenario where an external refund leaves no room for a pending internal one. Runs against real Mongo with the fake provider's dashboard.

## Key elements

- **`paidOrder()`** – Creates a user, product, and order; reserves inventory; pays 100.00 by card; settles outbox; returns `orderId` and `providerRef`.
- **`paymentOf(orderId)`** – Fetches the payment record for an order; throws if missing.
- **`refundsOf(orderId)` / `refundedOf(orderId)` / `stampOf(orderId)`** – Convenience readers over the payment's refund array, cumulative refunded amount, and the order's `paymentStatus`.
- **`deliver(providerRef, refundRef)`** – Calls `paymentService.applyWebhookDelivery` to simulate the provider pushing a refund event.
- **`refundedEvents()`** – Counts `PAYMENT_REFUNDED` rows in the outbox.
- **`overtaken()`** – Builds the scenario where our 50.00 refund fails (transient) and a 80.00 external refund is then delivered.
- **`describe('a refund made in the dashboard')`** – Verifies import-once, idempotent re-delivery, two partial refunds, skipping of pending/failed/wrong-currency events, and over-refund (amount > paid) acceptance.
- **`describe('a refund that is ours')`** – Verifies that a webhook carrying our record's provider ref settles the existing record in place (never creates a second one), including the timeout-then-settle path.
- **`describe('an open refund … left no room for')`** – Verifies the held-unsent refund: `retryOpenRefunds` does not re-send, `listAttention` surfaces `refund_exceeds_remaining`, the admin view exposes a `cancelRefund` action, and cancellation restores the correct refunded total.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Source of `fakePaymentProvider`, `addFakeExternalRefund`, `refundRefOfRecord`, `setFakeRefundFailure`, `setFakeRefundTimeout`, `setFakeRefundOutcome`. The "dashboard lever" that tests manipulate.
- **`src/modules/payments/services/index.ts`** – `paymentService` methods under test: `applyWebhookDelivery`, `refundOrderPayment`, `retryOpenRefunds`, `listAttention`, `getForOrder`, `cancelRefund`.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` used by the helper readers.
- **`src/modules/payments/module.ts`** – `paymentsModule` registered via `registerCheckoutModules` in `beforeEach`.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUNDED` constant used to count outbox rows.
- **`src/kernel/outbox.ts`** – `outboxEventModel` (count query) and `settleOutboxNudges` (flush side-effects between assertions).
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach`.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` mocked; asserted exactly once for the `payments.refund-issued` template.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`.
- **`src/modules/products/tests/factories.ts`** – `createProduct`.
- **`src/modules/inventory/index.ts`** – `inventoryService.reserveForOrder` to lock stock before payment.
- **`src/modules/orders/index.ts`** – `orderService.getById` to read the order's `paymentStatus` stamp.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundOrderPayment` for the internal-refund setup.

## Notes

- Tests run against **real Mongo** (`setupTestDb()`), not an in-memory store; outbox nudges must be explicitly settled via `settleOutboxNudges()` before asserting side-effects.
- The mailer adapter is **mocked** (not faked) to count and filter email sends; `mockEnqueueEmail.mockClear()` runs in `beforeEach`.
- Idempotency is tested by calling `deliver()` twice with the same `refundRef` and asserting only one refund record exists.
- The "timed out but ran" test uses `withEnvironmentOverrides` to set `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `'0'` so the internal refund records as `failed` immediately, making the webhook settle it in place.
- `jest.restoreAllMocks()` in `afterEach` covers the `jest.spyOn(fakePaymentProvider, 'refund')` set up inside the overtaken test.
- The over-refund case (130 > 100 paid) is intentionally accepted: the test documents that the money already moved at the provider, so the record is created regardless.
