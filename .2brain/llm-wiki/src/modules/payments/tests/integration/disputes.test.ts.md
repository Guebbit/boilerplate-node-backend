---
source: src/modules/payments/tests/integration/disputes.test.ts
sha256: 2b6b4b09de44e8d9ab45274b5c791da7ed4bc7d1058197d88d480ceebeb468cc
generated_at: 2026-11-08T07:31:57.862371+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/disputes.test.ts

## Purpose

Integration tests for the buyer-bank dispute (chargeback/inquiry) flow: how a provider's dispute report is stored on the payment, announced via the outbox, surfaced on the order's staff timeline, and how it constrains (or doesn't) subsequent refunds. Uses a real MongoDB instance, the fake payment provider's dispute lever, and exercises everything through `paymentService`'s public API.

## Key elements

- **`paidOrder()`** – Creates a unique buyer, product, order, and card payment (100.00 EUR), then settles outbox nudges; returns `{ orderId, providerRef }` for further steps.
- **`report(over?)`** – Builds a default `ProviderDisputeState` (chargeback, `needs_response`, 100.00 EUR, 7-day evidence window) with optional per-test overrides.
- **`deliver(providerRef, over?)`** – Wraps `setFakeDispute` + `paymentService.applyWebhookDelivery` to simulate one webhook delivery of a dispute report.
- **`staffView(orderId)`** – Calls `paymentService.getForOrder` as an admin and returns the data payload.
- **`events(name)`** – Counts outbox rows for a given event name (used to assert announcement counts).
- **`refund(orderId, amount?)`** – Wraps `refundOrderPayment` with admin caller context.
- **`when(minutes)` / `at(minutes)`** – Derive a `Date` or ISO string relative to the fixed `START` instant, keeping timestamps deterministic.
- **`describe('a dispute is reported')`** – Storage, single announcement, timeline entry, no-refund guarantee, staff-only visibility, idempotency for stale/repeat reports, update-on-newer, closed→won→reopened transitions, and rejection of unknown intent / wrong provider / wrong currency.
- **`describe('the refund door while a dispute stands')`** – 409 `PAYMENT_DISPUTED` for an open chargeback, refunds still allowed during an inquiry, and a lost chargeback reducing the refundable remainder (422 on excess).
- **`describe('a refund the chargeback blocks')`** – A refund attempt that hits the dispute guard fails as `failed/disputed` without calling the provider, and is not retryable via `retryOpenRefunds`.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Source of `fakePaymentProvider` and `setFakeDispute`; the sole mechanism for injecting dispute reports into the service.
- **`src/modules/payments/services/index.ts`** – The system under test: `paymentService.applyWebhookDelivery`, `getForOrder`, `retryOpenRefunds`.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` used to inspect stored state and to extract `providerRef` / `userId`.
- **`src/modules/payments/events.ts`** – Event-name constants (`PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`, `PAYMENT_REFUNDED`) used in outbox-count assertions.
- **`src/modules/payments/module.ts`** – Registered via `registerCheckoutModules` in `beforeEach` so the service is wired.
- **`src/modules/payments/providers/index.ts`** – Supplies the `ProviderDisputeState` type shared with the fake.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundForOrder`, `refundOrderPayment` used to set up payments and trigger refund paths.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `timelineOf` for order creation and timeline assertions.
- **`src/modules/orders/index.ts`** – `orderService.getById` to verify the order is unchanged after a dispute.
- **`src/kernel/outbox.ts`** – `outboxEventModel.countDocuments` and `settleOutboxNudges` for event-assertion and async processing.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach`.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** – `createUser`, `createProduct` for fixture setup.

## Notes

- Tests rely on a **fixed `START` timestamp** (`2026-10-01T10:00:00Z`) plus a `minutes` offset helper, so `observedAt` ordering is deterministic and independent of wall-clock time.
- `settleOutboxNudges()` must be awaited before counting outbox rows; without it the async event write may not have landed yet.
- `resetDomainEvents()` in `afterEach` prevents event emitters from leaking between tests.
- The `buyers` counter ensures each `createUser` gets a unique email within the suite (avoids unique-index collisions in real Mongo).
- The "refund blocked by chargeback" test uses `withEnvironmentOverrides` to set `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` so the retry loop runs synchronously in the test.
- `jest.spyOn(fakePaymentProvider, 'refund').mockClear()` is used to assert the provider is *not* called when a dispute short-circuits the refund—don't remove the spy if you refactor that path.
