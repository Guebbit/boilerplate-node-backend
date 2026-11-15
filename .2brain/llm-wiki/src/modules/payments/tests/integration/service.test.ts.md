---
source: src/modules/payments/tests/integration/service.test.ts
sha256: 96e1bb01540df88bba86b046c4f46703c16822530cb1c82672ed3e54a4c5f71c
generated_at: 2026-11-14T21:19:12.697686+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration tests that pin the payment service's core invariants against a **real Mongo** database: the intent freezes the order's published total (shipping included), confirm moves the order `pending → paid` only when the payment row goes `succeeded`, a decline is retryable on the same document, and refunds are at-most-once. The fake provider is the only non-real component; the conditional writes are the subject under test.

## Key elements

- **`orderFor(price?, quantity?)`** — Fixture returning a user, product, and pending order. The starting point for most tests.
- **`paidOrder()`** — Runs `createIntent` + `confirmPayment` via `payByCard`; returns a fully-paid order for money-movement tests.
- **`auth(user)`** — Wraps a user ID into a customer caller context via `asCustomer`.
- **`GOOD_METHOD` / `FAKE_DECLINE_METHOD`** — Opaque card references passed to the fake provider to simulate success or decline.
- **`describe('createIntent')`** — Asserts total freezing (compared against `order.totalPrice`, not a literal), idempotency (one payment per order), 404 for non-owner, 409 for non-pending orders, and method vocabulary.
- **`describe('confirmPayment')`** — Asserts order→paid / payment→succeeded ordering, decline → 409 `PAYMENT_DECLINED` with retryability, double-confirm → 409 `PAYMENT_NOT_CONFIRMABLE`, auth isolation, and offline-vs-card payment-method propagation.
- **Jest mock of `@infrastructure/observability/audit`** — Replaced with `auditPortMock` (not spied), per the project's port-replacement convention.
- **`refundOrderPayment`** (imported from `../factories`) — Used in the (truncated) refund section to verify at-most-once semantics.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — Source of `fakePaymentProvider`, `FAKE_DECLINE_METHOD`, `signFakeDelivery`, `setFakeOutcome`; the sole stub in an otherwise real-stack test.
- **`src/infrastructure/observability/audit.ts`** — Mocked at module level; the test never hits real audit logging.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` used in caller-context construction.
- **`src/kernel/events.ts`** — `resetDomainEvents` called between tests to clear the in-memory event bus.
- **`src/kernel/outbox.ts`** — `outboxEventModel` / `settleOutboxNudges` for asserting published events such as `PAYMENT_SUCCEEDED`.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `toOrderItem` build the order fixture.
- **`src/modules/orders/index.ts`** — `orderService` imported for reading back order state in assertions.
- **`src/modules/payments/model.ts`** — `paymentModel` used to inspect persisted payment documents.
- **`src/modules/payments/events.ts`** — `PAYMENT_SUCCEEDED` constant for outbox assertions.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered via `registerCheckoutModules` to wire the service under test.
- **`src/modules/payments/providers/index.ts`** — `WebhookRejected`, `ProviderWebhookEvent` types used in webhook-delivery tests.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` for admin/moderator role tests.

## Notes

- **Real Mongo is deliberate.** The file's docstring states the guarantees *are* the conditional writes; mocking the DB would defeat the purpose. `setupTestDb()` is called at module scope.
- **Total assertion compares against `order.totalPrice`**, not a hardcoded string. The comment explicitly calls out the historical bug where shipping was silently dropped because two files computed the total independently.
- **Audit is replaced, not spied** — the mock is injected via `jest.mock` → `auditPortMock()`, following the convention documented in `tests/support/ports.ts`.
- **One-payment-per-order is a database fact** (unique index), not an application guard; the test verifies via `paymentRepository.count({})` after two `createIntent` calls.
- **Decline is a state, not a terminal state.** The same payment document is confirmed again with a good card after a decline, and the test asserts it succeeds.
