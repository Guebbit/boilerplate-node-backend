---
source: tests/integration/payment-succeeded-outbox.test.ts
sha256: 81437cbbb8f4393c8cf402eb0bd8e213a4eed7e34320f30aa665be518704df7a
generated_at: 2026-10-15T12:49:33.717031+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/payment-succeeded-outbox.test.ts

## Purpose

Integration test that exercises the full `payment.succeeded` webhook path through the outbox with the real `payments` and `webhooks` modules registered. It verifies four invariants: exactly one delivery per subscription after settlement, idempotency under duplicate relay, preservation of the outbox row's ID as the webhook event ID, and that a failed fan-out is retried rather than silently dropped.

## Key elements

- **`settledOrder()`** – Helper that creates a user, product, order, and payment intent, then confirms the payment. Returns the order. All four test cases call this to produce a settled order with a pending outbox row.
- **`beforeEach`** – Registers `paymentsModule` and `webhooksModule` via `registerCheckoutModules`, mints a ring secret, and creates an enabled webhook subscription for `payment.succeeded`.
- **`afterEach`** – Calls `resetDomainEvents()` and `jest.restoreAllMocks()` to isolate tests.
- **"reaches the subscriber once the relay publishes the settlement's row"** – Asserts a single delivery with the correct `eventType` and `orderId` after `settleOutboxNudges()` + `relayOutbox()`.
- **"a duplicate publish … creates no second delivery"** – Manually resets the outbox row to `pending` (simulating a crash after publish, before mark) and re-runs `relayOutbox()`. Asserts delivery count stays at 1 and `eventId` is unchanged.
- **"an outbox event keeps its id as the webhook event id"** – Compares `delivery.eventId` against the outbox row's `_id`.
- **"a fan-out that fails is retried by the relay, not swallowed"** – Spies on `webhookDeliveryRepository.create` to reject once, asserts the row is `pending` with `attempts: 1` and no delivery, then forces `nextAttemptAt` back and confirms the relay retries successfully.

## Relationships

- **`src/kernel/outbox.ts`** – Source of `outboxEventModel` (Mongo model for outbox rows), `relayOutbox` (publishes due rows), and `settleOutboxNudges` (triggers nudge-based relay). The test drives the relay lifecycle and inspects/mutates rows directly.
- **`src/kernel/events.ts`** – `resetDomainEvents` clears the in-memory domain-event bus between tests.
- **`src/modules/payments/services/index.ts`** – Provides `createIntent` and `confirmPayment`, which together trigger the settlement that enqueues the outbox row.
- **`src/modules/payments/module.ts`** – Registered so the settlement pipeline (and its event emission) is active during the test.
- **`src/modules/webhooks/module.ts`** – Registered so the fan-out/delivery logic executes when the relay publishes.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` (seeded in `beforeEach`) and `webhookDeliveryRepository` (asserted and spied-on) are the persistence layer the test inspects.
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` generates the HMAC secret attached to the subscription.
- **`src/modules/orders/index.ts`** – `orderService.create` is used to produce the order that the payment intent references.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` wires the chosen modules into the test container.
- **`tests/support/callers.ts`** – `asCustomer`, `testCallerContext`, `callerContextAs` supply the caller identity for order creation and payment confirmation.
- **`src/modules/users/tests/factories.ts` / `src/modules/products/tests/factories.ts`** – `createUser` and `createProduct` seed the minimal domain data needed.

## Notes

- The idempotency test simulates a **crash-after-publish, before-mark** by manually setting `status: 'pending'` and `$unset`-ing `publishedAt`. This is a deliberate partial-failure scenario, not a natural code path.
- The failure/retry test uses `mockRejectedValueOnce` on `webhookDeliveryRepository.create`, meaning the *delivery insert* fails, not the outbox publish. The retry is verified by resetting `nextAttemptAt` and calling `relayOutbox()` again.
- The file references `docs/tools/outbox.md` in its doc comment for conceptual background on the outbox pattern.
- `setupTestDb()` is called at module scope (not in `beforeEach`), so the DB connection is established once for the whole suite.
