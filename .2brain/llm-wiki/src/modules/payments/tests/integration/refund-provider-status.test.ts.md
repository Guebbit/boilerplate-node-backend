---
source: src/modules/payments/tests/integration/refund-provider-status.test.ts
sha256: b06c7902670e4c348b7321350e5341678faff53e08f2621663964624a8ed49cc
generated_at: 2026-11-14T21:16:08.218447+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-provider-status.test.ts

## Purpose

Integration test verifying the lifecycle of a refund that the provider **accepts but has not yet settled**: the API returns 201 with the record in `pending` status and emits no domain event; the periodic sweep re-reads (never re-sends) the refund and settles it once the provider reports success; and a webhook naming the refund also settles it, with redelivery being a no-op. Runs against real Mongo with the fake payment provider's `pending` lever.

## Key elements

- **`pendingRefund()`** (local helper) — Creates a user, product (50.00 × 2), order, pays by card (100.00), flips the fake provider to hold refunds `pending`, then issues a 30.00 refund. Returns the order, payment, refund IDs, and the provider's refund ref.
- **`refundedEvents()`** (local helper) — Counts `payment.refunded` documents in the outbox collection.
- **`describe › answers 201 with the open record, and announces nothing`** — Asserts the HTTP 201 shape, `status: 'pending'`, `providerRefundRef` populated, `settledAt` undefined, and zero outbox events after settling nudges.
- **`describe › is re-read by the sweep, never sent again, and settles once the provider says so`** — Spies on `fakePaymentProvider.refund` / `.retrieveRefund`; verifies the sweep calls `retrieveRefund` (not `refund`), returns 0 while still pending, then 1 after `setFakeRefundOutcome` flips to `succeeded`; asserts the outbox gets exactly one event.
- **`describe › is settled by a webhook naming the refund, and a redelivery changes nothing`** — Delivers the same webhook event twice via `deliver()`, asserts the refund settles and only one outbox event is produced.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — Provides `fakePaymentProvider`, `refundRefOfRecord`, `setFakeRefundPending`, `setFakeRefundOutcome`. The entire test's control over provider state flows through this fake.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` and `refundOrderPayment` drive the payment and refund flows under test.
- **`src/modules/payments/tests/deliver.ts`** — `deliver` injects provider webhook events into the system.
- **`src/modules/payments/services/index.ts`** — Source of `paymentService`; the test calls `paymentService.retryOpenRefunds()` as the sweep entry point in test 2.
- **`src/modules/payments/repository.ts`** — Source of `paymentRepository`; the test reads payment and refund state via `findByOrderId` after each action.
- **`src/modules/payments/events.ts`** — `PAYMENT_REFUNDED` is the event name counted in the outbox assertions.
- **`src/modules/payments/module.ts`** — Registered via `registerCheckoutModules` in `beforeEach` so the service is resolvable.
- **`src/kernel/outbox.ts`** — `outboxEventModel` (counting) and `settleOutboxNudges` (flushing pending outbox writes before asserting).
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` prevents cross-test leakage.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** — Create the user, product, and order that the payment is anchored to.
- **`tests/support/callers.ts`** — `asAdmin` / `callerContextAs` supply the auth context for the refund API call.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the test DI container.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` sets `NODE_PAYMENT_REFUND_RETRY_MINUTES=0` so the sweep runs immediately in test 2.

## Notes

- Real MongoDB is required (`setupTestDb()`); this is not a pure unit test.
- `settleOutboxNudges()` must be awaited **before** asserting on outbox counts, otherwise events written asynchronously by the service will be invisible.
- The sweep test relies on `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` to make `retryOpenRefunds()` treat the refund as immediately eligible; without this override the sweep would skip it.
- The test asserts that the sweep calls `retrieveRefund` (a read) and explicitly **not** `refund` (a re-send) — this is the core contract being guarded: idempotent re-check, not re-initiation.
- `pendingRefund` throws if the provider produced no refund record (`refundRefOfRecord` returns falsy), which will surface as a test failure rather than a silent skip.
