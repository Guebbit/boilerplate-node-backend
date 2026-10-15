---
source: tests/integration/concurrency/payment-races.test.ts
sha256: 790355e8bec5a6e221911816281d050dd0701a2a0f1464700cfc67debb28285c
generated_at: 2026-10-15T12:46:10.522416+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/payment-races.test.ts

## Purpose

Integration test that verifies the "settles once" guarantee of the payment subsystem under real HTTP contention against a single in-memory Mongo instance. Five scenarios (P1–P5) exercise double-confirm, webhook redelivery, webhook-vs-confirm interleaving, overselling, and cancel-during-settle, asserting correctness by counting `PAYMENT_SUCCEEDED` domain-event emissions and stock counters rather than trusting status codes.

## Key elements

- **`GOOD_METHOD`** – the payment-method ref the fake provider resolves to `succeeded`.
- **`loggedInCustomer()`** – creates a verified customer with a unique address, logs in via `/account/login`, returns the bearer token.
- **`orderAwaitingPayment(productId, quantity)`** – drives the full checkout flow (cart → shipping → checkout → payment intent) and returns `{ bearer, orderId, paymentId }`.
- **`providerRefOf(paymentId)`** – reads the `providerRef` column off the payment row (not exposed via API).
- **`deliver(event)`** – POSTs a HMAC-signed webhook to `/payments/webhook`.
- **`countSucceededEvents()`** – subscribes an observer to `PAYMENT_SUCCEEDED` via `onDomainEvent`; returns a per-order counter.
- **`settleEvents()`** – flushes the outbox (`settleOutboxNudges` then `relayOutbox`) so event listeners fire before assertions.
- **`describe` blocks P1–P5** – each fires `RACE_SIZE` concurrent requests via `raceN` and asserts exactly one settlement, correct stock counters, and correct order/payment status.

## Relationships

- **`tests/support/race.ts`** – supplies `raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors`; the concurrency harness for every scenario.
- **`tests/support/http.ts`** – `api()` (supertest instance) used for all HTTP calls.
- **`tests/support/checkout-as.ts`** – `checkoutAs()` helper for the checkout step in P4 and the shared `orderAwaitingPayment` flow.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory Mongo.
- **`scenarios/support/doubles/payments/fake.ts`** – `setFakeOutcome` controls what the fake provider returns for a given `providerRef`.
- **`src/modules/payments/providers/index.ts`** – `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` for constructing valid webhook deliveries.
- **`src/modules/payments/events.ts`** – `PAYMENT_SUCCEEDED` constant used by the event counter.
- **`src/modules/payments/model.ts`** – `paymentModel` queried for `providerRef` and final status.
- **`src/modules/orders/model.ts`** – `orderModel` queried for final status and order counts.
- **`src/kernel/events.ts`** – `onDomainEvent` subscription API used by `countSucceededEvents`.
- **`src/kernel/outbox.ts`** – `relayOutbox` / `settleOutboxNudges` to deliver outbox rows before assertions.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` gives each customer a unique address.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD` for test customers.
- **`src/modules/products/tests/factories.ts`** – `createProduct` (with `onHand`) and `countersOf` to read `onHand`/`reserved`/`available`.

## Notes

- **P5 is effectively untestable here.** The file's header states its race window (between `markPaid` and the payment write) was never hit in 3 runs at `TEST_RACE_SIZE=20` even with the fix reverted; the deterministic regression lives in `src/modules/payments/tests/integration/service.test.ts`.
- **PDF adapter is mocked** (`jest.mock('@infrastructure/adapters/pdf')`) because the placed-order email renders an invoice; without the stub every checkout would log a failed render.
- **Distinct customers per test.** The module-level `customerCounter` guarantees unique email/username so the default factory address does not collide across tests within the same file.
- **Assertions rely on event counts, not status codes.** A 409 from a losing confirm is expected and correct; the real invariant is that `PAYMENT_SUCCEEDED` fires exactly once per order.
- **`settleEvents()` must be awaited before counting.** The settlement transaction writes the outbox row; the relay (not the settlement) delivers it to listeners.
- **P2 expects all deliveries to return 200.** A provider treats non-2xx as "retry", so a duplicate webhook must still be acknowledged successfully.
