---
source: tests/integration/concurrency/payment-races.test.ts
sha256: 85ecc0a08d690372a1f92bd33b784013ab51a6831230e811bf0267b36f0f5063
generated_at: 2026-11-14T23:11:35.416416+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/payment-races.test.ts

## Purpose

Integration test suite that exercises payment-settlement and stock-reservation under real concurrent contention over HTTP, against a single in-memory Mongo. It verifies the `settlePayment` guarantee — "a delivery that arrives twice, or races the browser's own call, settles once" — by firing N parallel requests and asserting that exactly one `PAYMENT_SUCCEEDED` event fires, one stock commit lands, and losers receive a conflict rather than a second success.

## Key elements

- **`loggedInCustomer()`** – Creates a distinct verified customer, assigns an address, logs in, and returns the Bearer token. Uses a module-level counter so addresses don't collide.
- **`orderAwaitingPayment(productId, quantity)`** – Drives the full HTTP checkout (cart → shipping → checkout → payment intent) so a real reservation exists for settlement to commit. Returns `{ bearer, orderId, paymentId }`.
- **`providerRefOf(paymentId)`** – Reads `providerRef` directly from the `paymentModel` row (not exposed via any API).
- **`deliver(event)`** – POSTs a signed webhook payload to `/payments/webhook/fake` with the correct `WEBHOOK_SIGNATURE_HEADER`.
- **`countSucceededEvents()`** – Registers a passive `onDomainEvent(PAYMENT_SUCCEEDED, …)` listener and returns a per-orderId counter function.
- **`settleEvents()`** – Awaits `settleOutboxNudges()` then `relayOutbox()` so all settlement transactions and their outbox deliveries complete before assertions.
- **`GOOD_METHOD`** (`'pm_card_visa'`) – The method the fake provider maps to a `succeeded` outcome.
- **`RACE_SIZE` / `raceN`** (from `@tests/race`) – Configurable parallelism and the race runner used by every test.
- **P1** – N parallel confirms of one intent → exactly one 200, rest 409, one event, correct stock.
- **P2** – N parallel redeliveries of one webhook event → all 204, one event, correct stock.
- **P3** – Half confirms, half distinct webhook events racing → one event, correct stock.
- **P4** – More buyers than units, all checking out simultaneously → exactly `units` succeed (201), rest get 409 with `CART_INSUFFICIENT_STOCK`, stock never negative.
- **P5** (truncated) – Cancellation racing settlement; pinned deterministically elsewhere because the window is too narrow to hit reliably at `RACE_SIZE=20`.

## Relationships

- **`tests/support/http.ts`** → `api()` provides the supertest request client used by every HTTP call in this file.
- **`tests/support/checkout-as.ts`** → `checkoutAs()` performs the real checkout PUT so a stock reservation exists before settlement tests begin.
- **`scenarios/support/doubles/payments/fake.ts`** → `setFakeOutcome()` tells the fake provider which outcome to return for a given `providerRef` (used in P2, P3).
- **`src/modules/payments/providers/index.ts`** → re-exports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER`, used to construct valid webhook deliveries.
- **`src/modules/payments/events.ts`** → exports the `PAYMENT_SUCCEEDED` event constant that `countSucceededEvents` subscribes to.
- **`src/modules/payments/model.ts`** → `paymentModel` is queried for `providerRef` and asserted for final `status`.
- **`src/modules/payments/index.ts`** → re-exports `displayStatusOf` (imported here, presumably used in the truncated P5 assertions).
- **`src/modules/orders/model.ts`** → `orderModel` is used to assert final order status (`paid`) and count orders per product.
- **`src/kernel/events.ts`** → `onDomainEvent` is the subscription API the event counter hooks into.
- **`src/kernel/outbox.ts`** → `relayOutbox` / `settleOutboxNudges` flush pending outbox entries so event listeners fire before assertions.
- **`src/modules/products/tests/factories.ts`** → `createProduct` seeds stock; `countersOf` reads `onHand` / `reserved` / `available` for assertions.
- **`src/modules/users/tests/factories.ts`** → `createUser` and `PLAIN_PASSWORD` set up test customers.
- **`src/modules/addresses/tests/factories.ts`** → `giveAddress` assigns a shipping address required by checkout.

## Notes

- The suite mocks `@infrastructure/adapters/pdf` because the placed-order email renders an invoice; without the mock every checkout would log a failed render.
- "Once" is verified by counting `PAYMENT_SUCCEEDED` emissions on the event bus, not by inspecting HTTP status codes — a second settlement that is a no-op still counts as "the system settled once."
- `settleEvents()` must be awaited **before** reading `countSucceededEvents()` results; events are written inside the settlement transaction but delivered by the outbox relay, not synchronously.
- P5's race window (between `markPaid` and the payment write) was never hit in three runs at `TEST_RACE_SIZE=20` with the fix reverted; the bug is pinned deterministically in `src/modules/payments/tests/integration/service.test.ts`.
- `customerCounter` is module-level; each call yields a unique email/username so the default factory address doesn't cause unique-index collisions on the second customer.
- `GOOD_METHOD` is not arbitrary: it is the method the fake provider's contract explicitly maps to a `succeeded` outcome.
