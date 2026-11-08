---
source: tests/integration/payment-succeeded-outbox.test.ts
sha256: b75ebed15cc581ab7c78358f071b68dd2d8cd4e119de622f863846f61f15dc88
generated_at: 2026-11-08T09:44:07.039591+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/payment-succeeded-outbox.test.ts

## Purpose

Integration test that exercises the full lifecycle of a `payment.succeeded` webhook event as it flows through the outbox: settlement → nudge → relay → delivery. Verifies exactly-once delivery per subscription, idempotency on duplicate relay, stable event-ID mapping between outbox and webhook, and retry-after-failure semantics. Designed to run against the real `payments` and `webhooks` modules (not mocks).

## Key elements

- **`setupTestDb()`** — initialises the test database (called once at module level).
- **`beforeEach`** — registers the `payments` and `webhooks` modules via `registerCheckoutModules`, mints a Ring signing secret, and creates a webhook subscription for `payment.succeeded` on tenant `shop`.
- **`afterEach`** — calls `resetDomainEvents()` and restores all Jest mocks.
- **`settledOrder()`** (local helper) — creates a user, a product (onHand: 10), places an order via `orderService.create` with an admin caller context, then pays it with `payByCard`. Returns the paid order.
- **Test: "reaches the subscriber once the relay publishes"** — confirms one delivery row exists after `settleOutboxNudges` + `relayOutbox`, with correct `eventType` and `payload.orderId`.
- **Test: "a duplicate publish … creates no second delivery"** — manually resets the outbox row to `pending` (simulating a crash between publish and mark), re-relays, asserts delivery count is still 1 and `eventId` is unchanged.
- **Test: "an outbox event keeps its id as the webhook event id"** — asserts `delivery.eventId === String(outboxRow._id)`.
- **Test: "a fan-out that fails is retried by the relay, not swallowed"** — mocks `webhookDeliveryRepository.create` to reject once; verifies the outbox row stays `pending` with `attempts: 1`, then a second relay pass succeeds and produces exactly 1 delivery.

## Relationships

- **`src/kernel/outbox.ts`** — supplies `outboxEventModel` (Mongo model queried/updated directly in tests), `relayOutbox` (the relay function under test), and `settleOutboxNudges` (flushes pending nudges before relaying).
- **`src/kernel/events.ts`** — `resetDomainEvents()` is called in `afterEach` to clear any in-memory event queue between tests.
- **`src/modules/payments/module.ts`** and **`src/modules/webhooks/module.ts`** — registered as the two checkout modules; the payments module emits the `payment.succeeded` domain event on successful card payment, the webhooks module handles subscription lookup and delivery creation.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository.create` sets up the subscription in `beforeEach`; `webhookDeliveryRepository.findAll` / `.count` / `.create` are the primary assertions and the spy target in the failure-retry test.
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret()` produces the signing-secret entry stored on the subscription.
- **`src/modules/orders/index.ts`** — exports `orderService` used to create the order in `settledOrder`.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` triggers the successful payment that emits the domain event.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** — `createUser` / `createProduct` seed the minimum domain entities needed for an order.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires modules into the test container.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` provides the auth context for `orderService.create`.
- **`tests/support/response.ts`** — `asSuccess` narrows the Result union returned by `orderService.create`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory / temp MongoDB for the suite.

## Notes

- The duplicate-delivery test **mutates the outbox row directly** (`outboxEventModel.updateOne`) to simulate a crash window where the event was published but not yet marked. It does not re-invoke the business logic; the idempotency guard lives inside the relay/delivery path.
- `nextAttemptAt: new Date(0)` is used to make a row immediately eligible for the next `relayOutbox()` call without waiting for a real backoff.
- The file references `docs/tools/outbox.md` (in its block comment) for the design rationale behind the outbox pattern.
- All `findAll` calls use `{ limit: 10 }` — a defensive cap so an unbounded query cannot hang the test if the assertion is about to fail.
