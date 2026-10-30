---
source: src/modules/payments/tests/integration/service.test.ts
sha256: 31b96b772a67b5b9c08a90e0123e4c1daf4ebd15b84a945afcf98e940d5051f8
generated_at: 2026-10-29T05:21:11.207808+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration test suite for the payments service (`src/modules/payments/services/`) that pins the core financial invariants against a real Mongo database: the intent freezes the order's published total (shipping included), confirm atomically transitions the order `pending → paid` before marking the payment `succeeded`, a decline is retryable, and a refund fires at-most-once. The payment provider is the controlled `fake` double, not a real gateway.

## Key elements

- **`GOOD_METHOD`** — constant (`'pm_card_visa'`) representing the opaque card handle the fake provider expects for a successful charge.
- **`orderFor(price, quantity)`** — fixture helper that creates a user, a product, and a single-line order; most tests start here.
- **`paidOrder()`** — fixture helper that extends `orderFor` with a successful `payByCard` call; used by tests that need a completed payment.
- **`auth(user)`** — shorthand wrapping `asCustomer(user.id)` to build the caller context.
- **`describe('createIntent')`** — pins amount freezing (line total + shipping), idempotency (one payment per order), ownership (404 for strangers), status guard (409 on non-pending), and the `card` method vocabulary.
- **`describe('confirmPayment')`** — pins the order→payment status ordering, the `paymentMethod` rewrite on card vs. offline (`bank_transfer`) paths, decline retryability, double-confirm refusal, and the "no new intent after money moved" rule.
- **Audit port mock** — `jest.mock('@infrastructure/observability/audit', …)` replaces the real port with the shared `auditPortMock` so tests can assert audit calls without I/O.
- **`setupTestDb()`** — initialises a real Mongo instance for the suite; all repository reads go against it.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — supplies `fakePaymentProvider`, `FAKE_DECLINE_METHOD`, and `setFakeOutcome`; the test drives charge success/failure through this double rather than a real gateway.
- **`src/modules/payments/services`** — the SUT: `paymentService.createIntent`, `.confirmPayment`, `.recordOfflinePayment`.
- **`src/modules/payments/repository`** — `paymentRepository.findByOrderId` and `.count` are used to assert persisted state after each service call.
- **`src/modules/payments/model.ts`** — `paymentModel` imported for direct collection access in assertions.
- **`src/modules/payments/events.ts`** — `PAYMENT_SUCCEEDED` referenced when asserting outbox/domain event emission.
- **`src/modules/payments/providers/index.ts`** — `WebhookRejected` and `ProviderWebhookEvent` types used in webhook-related assertions.
- **`src/modules/payments/module.ts`** — `paymentsModule` imported to ensure the module's event listeners (e.g. the refund listener) are registered in the test harness.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — `orderService.getById` reads order state; `ORDER_STATUS_CHANGED` is an event the test observes.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `toOrderItem` build and manipulate order fixtures.
- **`src/modules/inventory/index.ts` / `src/modules/inventory/services/index.ts`** — `inventoryService` registered so inventory side-effects during order lifecycle are exercised.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-memory event bus between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` and `settleOutboxNudges` let the test flush and inspect outbox rows.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` used in multi-tenant or admin-context assertions.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` provisions role/membership data for admin-context tests.
- **`src/infrastructure/observability/audit.ts`** — mocked at the module boundary; the test asserts audit entries via the shared port mock rather than hitting the real sink.

## Notes

- The file deliberately uses **real Mongo** (`setupTestDb()`) because the invariants under test (conditional writes, at-most-once refund) are enforced at the database level; mocking the repository would make those guarantees invisible.
- The `createIntent` shipping test compares the stored `amount` to `order.toJSON().totalPrice` (the number `openapi.yaml` publishes) rather than to a literal, guarding against the two totals drifting in separate files.
- The audit port is **replaced**, not spied on (`jest.mock` → `auditPortMock`), so `jest.spyOn` on the real module would not intercept calls.
- `payByCard` is imported from `@modules/payments/tests/factories` (a sibling of this file) and encapsulates the createIntent + confirmPayment happy path in one call for higher-level fixtures.
