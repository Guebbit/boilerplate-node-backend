---
source: src/modules/payments/tests/integration/disputes.test.ts
sha256: 1aa015241ca6a0eeb7072b70d8cbbb57791586086e030c1b86db19358db6b2b3
generated_at: 2026-11-14T21:13:40.329823+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/disputes.test.ts

## Purpose

Integration test that exercises the full dispute lifecycle (chargeback and inquiry) against real Mongo, driving the fake payment provider's dispute lever through the public `paymentService` API. It verifies that disputes are persisted, announced once, surfaced on the order timeline and staff attention list, and that they gate or reduce the refundable amount without ever being treated as a refund (no `payment.refunded`, no credit note, no order-status change).

## Key elements

- **`paidOrder()`** — Creates a unique buyer, a 50.00 product × 2, a card payment of 100.00 EUR, settles outbox nudges, and returns `{ orderId, providerRef }`.
- **`report(over?)`** — Returns a default `ProviderDisputeState` (chargeback, `needs_response`, 100.00 EUR, `fundsWithdrawn: true`) merged with optional overrides.
- **`deliverReport(providerRef, over?)`** — Wires the fake provider's dispute lever and hands the report to the service via `deliver()`, mirroring the webhook path.
- **`staffView(orderId)`** — Calls `paymentService.getForOrder` with an admin caller to read the staff-facing payment object.
- **`events(name)`** — Counts outbox rows for a given event name (asserts announce-once semantics).
- **`refund(orderId, amount?)`** — Attempts a refund through `refundOrderPayment` with admin context.
- **`when(min)` / `at(min)`** — Time helpers anchored to the fixed `START` (2026-10-01T10:00Z); `when` returns a `Date`, `at` an ISO string.
- **Three `describe` blocks** — "a dispute is reported", "the refund door while a dispute stands", "a refund the chargeback blocks".

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — Supplies `fakePaymentProvider` (registered in the provider registry) and `setFakeDispute`, which the tests use to inject dispute reports without a real webhook.
- **`src/modules/payments/services/index.ts`** — `paymentService` is the public door through which every dispute delivery, staff read, and refund attempt flows.
- **`src/modules/payments/repository.ts`** — Used for direct DB assertions (confirming no refund rows exist, reading `providerRef` after setup).
- **`src/modules/payments/providers/registry.ts`** — `registerPaymentProvider` swaps in a renamed fake provider to test the "wrong provider" rejection path.
- **`src/modules/payments/providers/index.ts`** — Imports the `ProviderDisputeState` type used by the `report()` helper.
- **`src/modules/payments/events.ts`** — Event-name constants (`PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`, `PAYMENT_REFUNDED`) used to count outbox rows.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered in `beforeEach` so the service's dependencies are wired.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` clears the domain-event queue between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` (count assertions) and `settleOutboxNudges` (flush async outbox before reading).
- **`src/modules/orders/index.ts`** — `orderService` is used to assert the order is untouched by a dispute.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `timelineOf` for order setup and timeline-row queries.

## Notes

- **Real Mongo, not mocked.** `setupTestDb()` spins up a real database; there is no repository-level mocking.
- **Fixed reference clock.** All `observedAt` values are derived from the constant `START` (2026-10-01T10:00Z). The ordering tests depend on this deterministic timeline rather than `Date.now()`.
- **`buyers` counter** ensures each test gets a unique email so Mongo unique indexes don't collide across `it` blocks.
- **`displayStatus` is independent of disputes.** Even with an open chargeback the payment's `displayStatus` remains `'succeeded'` (mirrors Shopify's separation of `displayFinancialStatus` from dispute state).
- **Visibility gate.** `getForOrder` with a customer caller must return `disputes: undefined`; the test asserts this explicitly.
- **Truncated file.** The last test in "a refund the chargeback blocks" is cut off mid-assertion (`expect(send).not.toHaveBee…`); the full suite may contain additional cases not visible here.
