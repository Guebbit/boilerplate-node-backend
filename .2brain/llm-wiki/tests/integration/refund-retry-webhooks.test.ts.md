---
source: tests/integration/refund-retry-webhooks.test.ts
sha256: 5b12a98cc65141bdff7a3b2179c297cfca7d651584e8f6126700eefa17772b0e
generated_at: 2026-10-29T07:01:22.253967+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refund-retry-webhooks.test.ts

## Purpose

Integration test suite verifying the cross-module cancel→refund→webhook pipeline: a single `order.cancelled` outbox row drives the refund, redelivery is idempotent (no double-refund, no duplicate webhook), and a provider refusal leaves the refund open for the periodic sweep while the event itself is still considered delivered. It lives under `tests/integration/` because it exercises the real `subscribe()` hooks of orders, payments, and webhooks together.

## Key elements

- **`paidOrder()`** — Fixture: creates a user, a 20-unit product, an order (admin context), pays by card, then calls `settleOutboxNudges()` so the settlement relay has published its rows before the test cancels.
- **`cancelledRows(orderId)`** — Queries `outboxEventModel` for the `order.cancelled` row(s) on a given aggregate.
- **`cancelledDeliveries()`** — Queries `webhookDeliveryRepository` for all `order.cancelled` deliveries on the test tenant.
- **`subscribeToEverything()`** — Registers a wildcard (`*`) webhook subscription so any duplicate delivery would be observable.
- **Test 1** — Cancel writes exactly one outbox row; after relay, the payment has one `succeeded` refund and the row is `published`.
- **Test 2** — Simulates a crash (row reset to `pending`, `nextAttemptAt` zeroed) then calls `relayOutbox()` again; asserts `fakePaymentProvider.refund` was called once, refunds array length is 1, and webhook deliveries remain at 1.
- **Test 3** — Mocks `fakePaymentProvider.refund` to reject once; asserts the refund record is `failed` but the outbox row is still `published` with `attempts: 0`; then `paymentService.retryOpenRefunds()` recovers it to `succeeded` without emitting a second webhook.

## Relationships

- **`src/kernel/outbox.ts`** — Provides `outboxEventModel` (direct DB queries), `relayOutbox()` (manual relay trigger in test 2), and `settleOutboxNudges()` (advance relay before assertions).
- **`src/kernel/events.ts`** — `resetDomainEvents()` called in `afterEach` to prevent cross-test event leakage.
- **`src/modules/orders/index.ts`** — `orderService.create` and `orderService.cancelOnRequestById` are the trigger actions under test.
- **`src/modules/payments/module.ts`** / **`src/modules/webhooks/module.ts`** — Registered via `registerCheckoutModules` in `beforeEach` so their real event-subscription hooks fire during relay.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` used for refund-state assertions.
- **`src/modules/payments/services/index.ts`** — `paymentService.retryOpenRefunds()` exercised in test 3.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` sets up the initial card payment.
- **`src/modules/products/tests/factories.ts`** / **`src/modules/users/tests/factories.ts`** — `createProduct`, `createUser` for fixture data.
- **`src/modules/webhooks/repository.ts`** — `webhookDeliveryRepository.findAll` for delivery-count assertions.
- **`src/modules/webhooks/services/subscriptions.ts`** — `createSubscription` to register the wildcard subscriber.
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` whose `refund` method is spied/mocked to control provider success and failure.
- **`tests/support/callers.ts`** — `callerAs`, `asCustomer`, `callerContextAs`, `TEST_TENANT_ID` for tenant/role context.

## Notes

- The suite depends on **real module subscription hooks** (registered via `registerCheckoutModules`), not hand-rolled event dispatch. This is why it cannot live inside a single module's `tests/` folder.
- Test 2 simulates a post-consume crash by writing directly to `outboxEventModel` (status → `pending`, `nextAttemptAt` → epoch) rather than re-invoking the service layer.
- Test 3 uses `withEnvironmentOverrides` to set `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `'0'`, making `retryOpenRefunds` pick up the stuck record immediately.
- `settleOutboxNudges()` must be awaited after any action that enqueues outbox rows (settlement, cancel) before asserting on downstream state—omitting it causes flaky "row not yet published" failures.
