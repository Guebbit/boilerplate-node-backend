---
source: tests/integration/concurrency/payment-races.test.ts
sha256: d6cf1f7c3b72be3965ac488cb1e3a2868deb353198193094709c97848702f335
generated_at: 2026-09-27T15:55:50.382042+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/payment-races.test.ts

## Purpose

Integration test that exercises five payment-settlement race conditions (P1–P5) under real concurrent HTTP load against a single in-memory Mongo instance. It verifies the "settle once" guarantee across `payments`, `orders`, and `inventory` by counting ledger movement rows and domain-event emissions rather than inferring correctness from status codes.

## Key elements

- **`GOOD_METHOD`** (`'pm_card_visa'`) — the `paymentMethodRef` the fake provider settles as `succeeded`.
- **`loggedInCustomer()`** — creates a fresh verified customer (unique email/username via an incrementing counter) and returns their Bearer token.
- **`orderAwaitingPayment(productId, quantity)`** — drives the real checkout flow (cart → shipping → checkout → payment intent) over HTTP so a stock reservation exists for the settlement to commit.
- **`providerRefOf(paymentId)`** — reads the internal `providerRef` off the payment row (not published via API).
- **`deliver(event)`** — signs a webhook body with `signWebhookPayload` and POSTs it to `/payments/webhook`.
- **`commitsFor(orderId)`** — counts `commit`-reason stock-movement rows referencing the order (one per line per settlement).
- **`countSucceededEvents()`** — subscribes an observer to `PAYMENT_SUCCEEDED` and returns a per-order counter.
- **`settleEvents()`** — yields one `setImmediate` tick so fire-and-forget event emissions can land before assertions run.
- **P1** (`describe` block) — N concurrent confirms of one intent → exactly one 200, one commit, one event, stock decremented once.
- **P2** — N parallel redeliveries of the same webhook event → all acknowledged 200, but applied once.
- **P3** — Half the racers confirm via browser, half via distinct webhook events → still one settlement (proves conditional writes, not event-ID dedup, guard it).
- **P4** — More buyers than units racing checkout → exactly `onHand` succeed (201), the rest get `CART_INSUFFICIENT_STOCK` (409), no oversell.
- **P5** (truncated in source) — Cancel racing settlement; noted in the file header as never hitting its window at `TEST_RACE_SIZE=20`; deterministic coverage lives in `src/modules/payments/tests/integration/service.test.ts`.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` supertest helper used for every HTTP call.
- **`tests/support/race.ts`** — provides `RACE_SIZE`, `raceN` (concurrent-firing wrapper), `countStatus`, and `expectNoServerErrors`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` boots the in-memory Mongo used by the whole suite.
- **`src/modules/payments/providers/index.ts`** — exports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` used to forge signed webhook deliveries.
- **`src/modules/payments/events.ts`** — exports `PAYMENT_SUCCEEDED` for the event-count observer.
- **`src/modules/payments/model.ts`** — `paymentModel` queried to read `providerRef` and assert final payment status.
- **`src/modules/inventory/model.ts`** — `stockMovementModel` queried to count `commit` rows (the "did it settle?" ground truth).
- **`src/modules/orders/model.ts`** — `orderModel` queried to assert final order status and count successful checkouts.
- **`src/kernel/events.ts`** — `onDomainEvent` used to attach the non-invasive `PAYMENT_SUCCEEDED` observer.
- **`src/types/index.ts`** — `StockMovementReason.commit` used in the ledger count query.
- **`src/modules/products/tests/factories.ts`** — `createProduct` (with `onHand`) and `countersOf` (reads `onHand`/`reserved`/`available`).
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` for customer setup.

## Notes

- **Verification strategy:** Correctness is asserted on *counts* (ledger rows, event emissions), not on HTTP status codes. A duplicate settle could leave `onHand` correct by coincidence if nothing else moved it, but the `commit` movement and `PAYMENT_SUCCEEDED` counts would not.
- **P5 is effectively a no-op in CI:** The file header states its race window (between `markPaid` and the payment write) was never hit across three runs with the fix reverted at `TEST_RACE_SIZE=20`. The deterministic regression test lives in `src/modules/payments/tests/integration/service.test.ts`.
- **PDF mock:** `@infrastructure/adapters/pdf` is mocked at module level because the placed-order email renders an invoice; without the mock every checkout would log a failed render. The same stand-in is used by the orders contract suite.
- **`raceN` returns `PromiseSettledResult` array:** P4 filters on `result.status === 'fulfilled'` before reading `result.value.status`, confirming `raceN` wraps in `Promise.allSettled` (or equivalent) rather than plain `Promise.all`.
- **Customer isolation:** Each customer gets a unique email/username (`racer-N@example.com`) to avoid the factory's default address colliding on the second creation within a test.
