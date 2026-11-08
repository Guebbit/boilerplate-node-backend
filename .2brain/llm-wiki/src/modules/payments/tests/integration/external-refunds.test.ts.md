---
source: src/modules/payments/tests/integration/external-refunds.test.ts
sha256: 7a56f3dab38ca3f8da73b68f340b277bfae27ddb63f6ca2180691d2d47e93fe3
generated_at: 2026-11-08T07:32:16.124968+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/external-refunds.test.ts

## Purpose

Integration tests for the "external refund" path: refunds that originate in the payment provider's own dashboard and are discovered via a webhook event. Verifies one-time import with correct records, matching (not re-importing) of the app's own refunds, rejection of pending/failed/foreign-currency events, overshoot handling, and the hold-and-cancel workflow when an external refund leaves no remaining amount for an in-flight refund of the app.

## Key elements

- **`paidOrder()`** – Seeds a user, product (50.00 × 2 = 100.00), order, inventory reservation, and a card payment; returns `orderId` and `providerRef`.
- **`deliver(providerRef, refundRef)`** – Triggers `paymentService.applyWebhookDelivery` with the `"fake"` provider, simulating the provider's refund-event webhook.
- **`refundedEvents()`** – Counts `PAYMENT_REFUNDED` rows in the outbox collection to assert exactly one domain event was published.
- **`overtaken()`** – Composite setup: pays 100.00, forces a 50.00 in-app refund to fail transiently, then adds an 80.00 external refund via the fake dashboard and delivers it.
- **`describe('a refund made in the dashboard')`** – Five cases: idempotent single import (duplicate delivery ignored), two partial refunds, pending-then-succeeded transition, skipping failed/foreign-currency events, and recording a refund larger than the original payment.
- **`describe('a refund that is ours')`** – Two cases: matching by provider-echoed record id (no second row created); settling a timed-out in-app refund from the provider event without duplicating it.
- **`describe('an open refund of ours an outside refund left no room for')`** – Verifies the held refund is never re-sent, appears in `listAttention` with `refund_exceeds_remaining`, is cancellable by staff, and clears attention after cancellation.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Source of `addFakeExternalRefund`, `fakePaymentProvider`, `refundRefOfRecord`, `setFakeRefundFailure`, `setFakeRefundTimeout`, and `setFakeRefundOutcome`; acts as the stand-in for the provider's dashboard.
- **`src/modules/payments/services/index.ts`** – `paymentService.applyWebhookDelivery`, `retryOpenRefunds`, `listAttention`, `cancelRefund`, `getForOrder` are the units under test.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` used by all query helpers.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUNDED` constant used to filter outbox assertions.
- **`src/modules/payments/module.ts`** – Registered via `registerCheckoutModules([paymentsModule])` in `beforeEach`.
- **`src/modules/payments/tests/factories.ts`** – `payByCard` and `refundOrderPayment` create the in-app payment/refund prerequisites.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build the order fixture.
- **`src/modules/products/tests/factories.ts`** – `createProduct` supplies the line-item product.
- **`src/modules/inventory/index.ts`** – `inventoryService.reserveForOrder` completes the order lifecycle before payment.
- **`src/modules/orders/index.ts`** – `orderService.getById` reads the stamped `paymentStatus`.
- **`src/kernel/outbox.ts`** – `outboxEventModel.countDocuments` and `settleOutboxNudges` drive event-persistence assertions.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach` prevents cross-test leakage.
- **`src/infrastructure/adapters/mailer.ts`** – Mocked (`jest.mock`) to assert the `payments.refund-issued` buyer email is enqueued exactly once.

## Notes

- **Real Mongo**: `setupTestDb()` connects to a test database; no in-memory store. The "fake" is only the provider adapter (the dashboard lever), not the data layer.
- **Idempotency key convention**: imported external refunds carry `idempotencyKey: 'import:<providerRefundRef>'`, which is what makes duplicate webhook deliveries no-ops.
- **Retry timing override**: the "held" and "timed-out" tests set `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` via `withEnvironmentOverrides` so the retry loop fires immediately in-test.
- **`eventually()` helper**: outbox nudge settling is asynchronous; assertions on outbox counts and mailer calls are wrapped in `eventually` to poll until the background flush completes.
- **Currency guard**: a successful external refund in a currency other than the payment's currency (e.g. USD on a EUR payment) is silently skipped—no record, no event.
