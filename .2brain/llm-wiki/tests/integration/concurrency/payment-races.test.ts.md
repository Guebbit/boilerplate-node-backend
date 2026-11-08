---
source: tests/integration/concurrency/payment-races.test.ts
sha256: 13a68568d7dbae9958cb77886b844aff6d3a28a1d2822d93c6dba04864d9cb76
generated_at: 2026-11-08T09:36:45.627349+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/payment-races.test.ts

## Purpose

Validates the "settle once" invariant under real HTTP contention: concurrent confirmations, webhook redeliveries, mixed webhook+confirm races, overselling attempts, and cancel-during-settle windows all produce exactly one settlement, one stock commit, and one `PAYMENT_SUCCEEDED` event. Runs against a single in-memory Mongo with no browser.

## Key elements

- **`loggedInCustomer()`** – Creates a fresh verified customer (unique email/username), assigns an address, logs in via `/account/login`, and returns the `Bearer` token.
- **`orderAwaitingPayment(productId, quantity)`** – Drives the real checkout flow (cart → shipping → checkout → payment intent) over HTTP so the order has a genuine stock reservation for settlement to commit.
- **`providerRefOf(paymentId)`** – Reads `providerRef` directly from the payment row (not exposed via the API).
- **`deliver(event)`** – POSTs a JSON body to `/payments/webhook/fake` with a valid `WEBHOOK_SIGNATURE_HEADER`.
- **`countSucceededEvents()`** – Subscribes to `PAYMENT_SUCCEEDED` via `onDomainEvent` and returns a per-order counter. Added on top of module listeners; observes without altering behaviour.
- **`settleEvents()`** – Calls `settleOutboxNudges()` then `relayOutbox()` so the test's event observer has run before assertions.
- **`GOOD_METHOD`** (`'pm_card_visa'`) – The method the fake provider settles as `succeeded`.
- **Five describe blocks (P1–P5)**:
  - **P1** – `RACE_SIZE` parallel confirmations of one intent → exactly one 200, the rest 409, one event, stock committed once.
  - **P2** – `RACE_SIZE` parallel redeliveries of one webhook event → all 204, one event, stock committed once.
  - **P3** – Half confirms, half distinct webhook events racing → one event, stock committed once.
  - **P4** – More buyers than units, all checking out concurrently → exactly `units` get 201, rest get 409 with `CART_INSUFFICIENT_STOCK`, stock counters consistent.
  - **P5** – Customer cancels while payment settles (deterministic pin; see Notes).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/race.ts` | Provides `raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors` for concurrent HTTP fan-out and status counting. |
| `tests/support/checkout-as.ts` | `checkoutAs(bearer)` drives the real `POST /checkout` step inside `orderAwaitingPayment` and P4. |
| `tests/support/http.ts` | `api()` supertest instance used for every request in the file. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory Mongo before all tests. |
| `scenarios/support/doubles/payments/fake.ts` | `setFakeOutcome(providerRef, {status:'succeeded'})` tells the fake provider what to return for P2/P3. |
| `src/modules/payments/providers/index.ts` | `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` used in `deliver()`. |
| `src/modules/payments/events.ts` | `PAYMENT_SUCCEEDED` event name for the counting listener. |
| `src/modules/payments/model.ts` | `paymentModel.findById` to read `providerRef` and verify final payment status. |
| `src/modules/orders/model.ts` | `orderModel` to assert final order status and count orders per product. |
| `src/kernel/events.ts` | `onDomainEvent` to attach the passive event counter. |
| `src/kernel/outbox.ts` | `relayOutbox` and `settleOutboxNudges` in `settleEvents()` to flush pending event deliveries. |
| `src/modules/addresses/tests/factories.ts` | `giveAddress` to ensure the new customer has a shipping address. |
| `src/modules/users/tests/factories.ts` | `createUser`, `PLAIN_PASSWORD` for test account setup. |
| `src/modules/products/tests/factories.ts` | `createProduct` (with `onHand`) and `countersOf` for stock assertions. |

## Notes

- The file mocks `@infrastructure/adapters/pdf` so the placed-order invoice render doesn't log a failure for every checkout; the orders contract suite uses the same stub.
- **P5 is rarely hit under real contention.** The comment records 0 hits across 3 runs at `TEST_RACE_SIZE=20` with the fix reverted. Its underlying bug is pinned deterministically in `src/modules/payments/tests/integration/service.test.ts`; P5 here is a best-effort contention probe, not the primary regression guard.
- "Once" is verified by counting `PAYMENT_SUCCEEDED` emissions on the event bus, **not** by status codes. A second settlement attempt must leave no extra ledger row or event.
- `settleEvents()` must be awaited before any event-count assertion; the outbox relay is asynchronous and separate from the settlement transaction.
- Each test uses a distinct customer (incrementing `customerCounter`) to avoid address-factory collisions on repeated calls.
- P3 deliberately uses distinct webhook event IDs (`evt_${paymentId}_${index}`) so correctness cannot be attributed to idempotency-by-event-id; only the conditional settlement writes are under test.
