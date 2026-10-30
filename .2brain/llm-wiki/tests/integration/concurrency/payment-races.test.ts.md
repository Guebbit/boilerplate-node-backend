---
source: tests/integration/concurrency/payment-races.test.ts
sha256: 0d191767ba5410381819d760035879ba891f4321879193db9249a8ba22023ce1
generated_at: 2026-10-29T06:53:41.224956+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/payment-races.test.ts

## Purpose

Integration test that fires genuinely concurrent HTTP requests at a single in-memory Mongo instance to prove the "settles once" invariant across every settlement path (browser confirm, provider webhook, both racing) and that inventory is never oversold under contention. Each scenario is verified by counting `PAYMENT_SUCCEEDED` domain-event emissions and stock counters rather than trusting status codes.

## Key elements

- **P1 – double-confirmed intent:** `RACE_SIZE` parallel `POST /payments/:id/confirm` calls; expects exactly one 200, the rest 409, one event, one stock commit.
- **P2 – redelivered webhook:** `RACE_SIZE` parallel `POST /payments/webhook/fake` with the same event id; expects all 204, one event, one stock commit.
- **P3 – webhook races browser confirm:** Half the racers send confirm, half send distinct webhook events; asserts the conditional write (not event-id dedup) is what prevents double settlement.
- **P4 – oversell guard:** More concurrent checkouts than units on hand; expects exactly `units` × 201, the rest 409 with `CART_INSUFFICIENT_STOCK`, and `available: 0`.
- **P5 – cancel during settlement:** Customer cancels in the window between `markPaid` and the payment write; asserts order and payment state always agree. *(Truncated in source.)*
- **`loggedInCustomer()`** – creates a fresh verified user, assigns an address, logs in, returns the bearer token.
- **`orderAwaitingPayment(productId, qty)`** – walks the real cart → checkout → payment-intent flow so a stock reservation exists for the settlement to commit.
- **`deliver(event)`** – posts a signed webhook body to `/payments/webhook/fake`.
- **`countSucceededEvents()`** – registers a passive `onDomainEvent(PAYMENT_SUCCEEDED)` listener; returns a per-order counter.
- **`settleEvents()`** – runs `settleOutboxNudges()` then `relayOutbox()` so all in-transaction events are delivered before assertions.
- **`GOOD_METHOD`** – the card method the fake provider (`setFakeOutcome`) resolves to `succeeded`.

## Relationships

- **`tests/support/race.ts`** – provides `raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors`; the concurrency harness for every scenario.
- **`tests/support/checkout-as.ts`** – `checkoutAs(bearer)` drives the real checkout endpoint (used in P4's mass-buyer loop).
- **`tests/support/http.ts`** – `api()` supertest wrapper for all HTTP calls.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` boots the in-memory Mongo before any test runs.
- **`scenarios/support/doubles/payments/fake.ts`** – `setFakeOutcome(providerRef, …)` controls what the fake provider returns for a given intent.
- **`src/modules/payments/providers/index.ts`** – `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` used to forge valid webhook deliveries.
- **`src/modules/payments/events.ts`** – `PAYMENT_SUCCEEDED` is the event being counted.
- **`src/modules/payments/model.ts`** – `paymentModel` queried directly for `providerRef` and final status.
- **`src/modules/orders/model.ts`** – `orderModel` queried for order status and count.
- **`src/kernel/events.ts`** – `onDomainEvent` registers the passive event counter.
- **`src/kernel/outbox.ts`** – `relayOutbox`, `settleOutboxNudges` flush the outbox so events are delivered before assertions.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` assigns a shipping address to the test user.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD` for test fixtures.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `countersOf` for stock setup and assertions.
- **`src/modules/orders/model.ts`** – also imported to assert final order status.

## Notes

- **PDF mock:** `renderHtmlToPdf` is mocked to a no-op buffer because the real placed-order email would log a failed render for every checkout. Without this, console noise (or a hard failure) would obscure assertions.
- **Event counting, not status codes:** A second settlement attempt that hits a conditional-write guard returns 409 but does *not* emit `PAYMENT_SUCCEEDED`. The test counts emissions to prove "once" regardless of how many HTTP 200s or 204s came back.
- **Outbox flush before asserting:** The settlement writes the event inside its transaction; the relay delivers it. `settleEvents()` must complete before `succeededFor(orderId)` is read, or the count will be 0.
- **P5 flakiness:** The file's header notes the cancel-during-settlement window was never hit in 3 runs at `TEST_RACE_SIZE=20` even with the fix reverted; the deterministic pin lives in `src/modules/payments/tests/integration/service.test.ts`.
- **`customerCounter`** ensures each buyer gets a unique email/username to avoid address-factory collisions on the second user in the same test.
