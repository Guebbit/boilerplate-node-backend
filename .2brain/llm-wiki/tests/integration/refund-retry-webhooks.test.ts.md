---
source: tests/integration/refund-retry-webhooks.test.ts
sha256: 9e68bd268ac5be0dd15dc6f75ed1e1bba26dff5a36e7be2326a579efce6dd3ee
generated_at: 2026-11-08T09:46:08.005426+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refund-retry-webhooks.test.ts

## Purpose

Integration test verifying the end-to-end refund path triggered by an order cancellation: the `order.canceled` outbox row is written atomically with the cancel, the payments module opens a refund when the relay delivers it, redelivery is idempotent (no double refund, no duplicate webhook), and a provider refusal leaves the refund open for the sweep while still acknowledging the event. It lives here rather than in any single module's `tests/` because it exercises the real `subscribe()` hooks of orders, payments, and webhooks together.

## Key elements

- **`paidOrder()`** — Fixture: creates a user, a product, an order, pays by card, and settles the outbox so settlement rows are published. Returns `{ user, order }`.
- **`canceledRows(orderId)`** — Queries the outbox for `order.canceled` rows on a given order.
- **`canceledDeliveries()`** — Queries `webhookDeliveryRepository` for all `order.canceled` deliveries on the test tenant.
- **`subscribeToEverything()`** — Creates a webhook subscription with `eventTypes: ['*']` so any duplicate delivery is observable.
- **Test 1** ("writes one outbox row…refund lands once the relay has delivered it") — Asserts exactly one outbox row on cancel, one succeeded refund after relay, and row status `published`.
- **Test 2** ("refunds nothing twice and sends no second webhook…") — Spies on `fakePaymentProvider.refund`, manually resets the outbox row to `pending` to simulate a crash after consumers returned, re-relays, then asserts the refund was called once, the refund list has length 1, and deliveries total 1.
- **Test 3** ("leaves a refund the provider refused open for the sweep…") — Mocks `fakePaymentProvider.refund` to reject once, asserts the refund record is `failed` (open for sweep), the outbox row is still `published` with `attempts: 0`, then calls `paymentService.retryOpenRefunds()` and confirms the refund transitions to `succeeded` with no extra webhook.

## Relationships

- **`@kernel/outbox`** — `outboxEventModel` is queried directly; `relayOutbox()` and `settleOutboxNudges()` drive delivery; test 2 mutates the row to simulate a missed publish.
- **`@kernel/events`** — `resetDomainEvents()` in `afterEach` clears the in-memory event registry between tests.
- **`@modules/orders`** — `orderService.create` and `orderService.cancelOnRequestById` are the entry points that write the outbox row.
- **`@modules/payments/module`** & **`@modules/webhooks/module`** — Registered via `registerCheckoutModules` in `beforeEach`; their `subscribe()` hooks wire the relay→consumer pipeline.
- **`@modules/payments/repository`** — `paymentRepository.findByOrderId` is the primary assertion target for refund state.
- **`@modules/payments/services`** — `paymentService.retryOpenRefunds()` is invoked in test 3 to confirm the sweep picks up the failed record.
- **`@scenarios/support/doubles/payments/fake`** — `fakePaymentProvider.refund` is spied/mocked to control provider behaviour.
- **`@modules/webhooks/repository`** — `webhookDeliveryRepository.findAll` verifies delivery counts (dedup assertion).
- **`@modules/webhooks/services/subscriptions`** — `create` builds the wildcard subscription used in tests 2 and 3.
- **`@modules/users/tests/factories`**, **`@modules/products/tests/factories`**, **`@modules/payments/tests/factories`** — Provide `createUser`, `createProduct`, `payByCard` for fixture setup.
- **`@tests/callers`** — Supplies `callerAs`, `asCustomer`, `callerContextAs`, `TEST_TENANT_ID` for auth context and tenant scoping.

## Notes

- The module doc comment explicitly states the design rationale: the row is written *with* the cancel, so no separate "refund request" exists; idempotency is guaranteed by event-id dedup in webhooks and the payments module's own guard.
- Test 2's crash simulation (`$set: { status: 'pending', nextAttemptAt: new Date(0) }`) is the only place the test mutates outbox state directly; in production this state would arise from a process crash between consumer completion and the publish mark.
- Test 3 sets `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` via `withEnvironmentOverrides`, meaning the sweep is immediately eligible rather than waiting for a real backoff window.
- `settleOutboxNudges()` must be awaited before asserting on payment/webhook state; the module comment notes this mirrors the real-world gap between the cancel response and the relay's delivery.
