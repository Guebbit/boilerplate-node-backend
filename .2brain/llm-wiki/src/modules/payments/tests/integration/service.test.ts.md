---
source: src/modules/payments/tests/integration/service.test.ts
sha256: 0fad00c08e3230435570486afcd9f9f43b49be536a372ecdd1c37a552cb53b76
generated_at: 2026-11-08T07:37:05.786163+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration tests that pin the payments service's core invariants against real MongoDB: the intent freezes the order's published total (shipping included), confirmation moves order `pending → paid` and payment `→ succeeded` as a conditional write, a decline is retryable (not terminal), and one payment per order is a database fact. The provider is the `fake` double; everything else (orders, inventory, outbox, events) runs for real.

## Key elements

- **`createIntent` suite** — verifies the payment amount equals `order.toJSON().totalPrice` (not a recomputed sum), idempotent re-creation, 404 for non-owner, 409 `PAYMENT_ORDER_NOT_PAYABLE` for non-pending orders, and `method: 'card'` on the row.
- **`confirmPayment` suite** — verifies order→paid / payment→succeeded ordering, card-last-4 capture, decline returns 409 `PAYMENT_DECLINED` with order still `pending` and the same document retriable, double-confirm rejected with 409 `PAYMENT_NOT_CONFIRMABLE`, and 404 for non-owner.
- **JB8 test** — an order created as `bank_transfer` but paid via card has its `paymentMethod` rewritten to `'card'`; `recordOfflinePayment` leaves it as `'bank_transfer'`.
- **`orderFor` / `paidOrder`** — shared fixtures: one customer, one two-line order; `paidOrder` additionally creates an intent and confirms with a good card.
- **`GOOD_METHOD` (`'pm_card_visa'`) / `FAKE_DECLINE_METHOD`** — opaque provider handles driving success and decline paths.
- **Audit port mock** — `jest.mock('@infrastructure/observability/audit')` replaces the port with `auditPortMock()` (full replacement, not a spy).
- **`setupTestDb()`** — ensures a clean real Mongo connection before the suite.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — source of `fakePaymentProvider`, `setFakeOutcome`, and `FAKE_DECLINE_METHOD`; the only payment-provider interaction in these tests.
- **`src/infrastructure/observability/audit.ts`** — fully replaced at module-load time via `jest.mock`; the test never hits the real audit sink.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the event bus between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` / `settleOutboxNudges` used to assert or drain outbox rows written by conditional confirms.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes tenant context.
- **`src/modules/orders/index.ts`** — `orderService` reads back order state; `ORDER_STATUS_CHANGED` event used for assertions.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `readOrder`, `toOrderItem` build the order fixtures.
- **`src/modules/inventory/index.ts` / `services/index.ts`** — `inventoryService` participates in the checkout flow the test exercises.
- **`src/modules/payments/model.ts`** — `paymentModel` used directly in repository-level assertions.
- **`src/modules/payments/events.ts`** — `PAYMENT_SUCCEEDED` event constant for outbox/event assertions.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered via `registerCheckoutModules`.
- **`src/modules/payments/providers/index.ts`** — `WebhookRejected`, `ProviderWebhookEvent` types for webhook-related assertions.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` for RBAC fixtures.

## Notes

- **Real Mongo is intentional.** The guarantees under test (conditional writes, idempotency, one-payment-per-order) are database-level; mocking the repository would make the tests tautological.
- **The under-charge test asserts against `order.toJSON().totalPrice`, not a literal.** This catches the class of bug where the intent summed line items in a second file and silently dropped shipping.
- **The audit port is *replaced*, not spied on.** The test imports `auditPortMock()` from `@tests/ports`, which returns a fresh object; there is no `jest.spyOn`.
- **Decline is a state, not a terminal failure.** The test explicitly re-confirms the same payment document with a different method to prove retryability.
