---
source: tests/integration/payment-succeeded-outbox.test.ts
sha256: b75ebed15cc581ab7c78358f071b68dd2d8cd4e119de622f863846f61f15dc88
generated_at: 2026-10-29T06:59:53.069634+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/payment-succeeded-outbox.test.ts

## Purpose

Integration test that exercises the full lifecycle of a `payment.succeeded` webhook event through the outbox, with the real `payments` and `webhooks` modules registered. It verifies that a settlement produces exactly one delivery per subscription, that idempotency is preserved on re-publish, that the outbox row ID is propagated as the webhook event ID, and that transient fan-out failures are retried rather than lost.

## Key elements

- **`settledOrder()`** (local helper) — Creates a user, product, and order via `orderService.create`, then pays by card with `payByCard`, returning the paid order. Used as the precondition for every test case.
- **`beforeEach`** — Registers `paymentsModule` and `webhooksModule` via `registerCheckoutModules`, and seeds a webhook subscription for `payment.succeeded` with a fresh Ring secret.
- **`afterEach`** — Calls `resetDomainEvents()` and `jest.restoreAllMocks()` to clean state between tests.
- **"reaches the subscriber once the relay publishes the settlement's row"** — Asserts exactly one delivery row exists with the correct `eventType` and `payload.orderId`.
- **"a duplicate publish of the same event creates no second delivery"** — Manually re-sets the outbox row to `pending` (simulating a crash after publish), re-runs `relayOutbox()`, and confirms the delivery count stays at 1 with the same `eventId`.
- **"an outbox event keeps its id as the webhook event id"** — Confirms `delivery.eventId` equals the outbox row's `_id`.
- **"a fan-out that fails is retried by the relay, not swallowed"** — Mocks `webhookDeliveryRepository.create` to reject once, verifies the outbox row stays `pending` with `attempts: 1` and no delivery is created, then forces `nextAttemptAt` to the past and confirms a second `relayOutbox()` call succeeds.

## Relationships

- **`src/kernel/outbox.ts`** — Primary SUT: `outboxEventModel`, `relayOutbox`, and `settleOutboxNudges` are the functions under test.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears in-memory event state after each test.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/services/index.ts`** — `orderService.create` builds the order that triggers the settlement.
- **`src/modules/payments/module.ts`** — Registered in `beforeEach`; its settlement logic emits the `payment.succeeded` outbox event.
- **`src/modules/webhooks/module.ts`** — Registered in `beforeEach`; owns the delivery fan-out logic exercised by `relayOutbox`.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` (subscription setup) and `webhookDeliveryRepository` (delivery assertions and the mocked failure in the retry test).
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret` generates the signing key for the subscription.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` simulates a successful card payment.
- **`src/modules/products/tests/factories.ts`** — `createProduct` provides an in-stock product for the order.
- **`src/modules/users/tests/factories.ts`** — `createUser` provides the buyer.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the real modules into the test kernel.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` supplies the auth context for `orderService.create`.
- **`tests/support/response.ts`** — `asSuccess` unwraps the result envelope to extract the order.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory test database.

## Notes

- The test uses **real module registration** (not unit-level mocking) for payments and webhooks, making it a true integration test of the outbox pipeline. Only `webhookDeliveryRepository.create` is spied on, and only in the retry test.
- The duplicate-publish test **manually mutates the outbox row** (`status: 'pending'`, clears `publishedAt`) to simulate a relay crash after the HTTP publish but before the status write — this is the specific race the outbox is designed to absorb.
- `settleOutboxNudges()` must be called **before** `relayOutbox()` to simulate the nudge timer making the row eligible; calling `relayOutbox` alone would skip rows that haven't been nudged yet.
- The file's header docstring references `docs/tools/outbox.md` as the design source for the outbox contract.
