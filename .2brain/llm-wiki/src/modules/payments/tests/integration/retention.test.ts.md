---
source: src/modules/payments/tests/integration/retention.test.ts
sha256: 4547ba5f0e04ac3847ec2c8f6586d0f0c6ff543723ce7d105d103ec5be36b4a0
generated_at: 2026-10-15T11:35:45.770251+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/retention.test.ts

## Purpose

Integration tests for two retention behaviors of the payments module: (1) what happens to a payment when its owning user account is hard-deleted (the "detach" / erasure cascade), and (2) the `reapAbandonedPayments` sweep that deletes never-settled payment attempts past a configurable retention window. Tests exercise real module wiring (via `registerCheckoutModules`) rather than unit-mocking services.

## Key elements

- **`describe('payments — detach on account erasure')`** — four tests verifying that `userService.remove(user, true)` unsets `payment.userId` while the payment document itself survives, that an offline payment recorded against a detached order stores `userId: undefined` (not the string `"undefined"`), and that a stranger cannot open a new intent on a detached order.
- **`describe('payments — reapAbandonedPayments (reap-payments sweep)')`** — three tests verifying the retention window: abandoned (unconfirmed) payments past `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` are deleted; those still within the window are untouched; confirmed (settled) payments are never deleted regardless of age.
- **`touch(paymentId, updatedAt)`** — local helper that backdates a payment's `updatedAt` via `paymentModel.updateOne` with `{ timestamps: false }` so Mongoose does not immediately overwrite it.
- **`setEnvironment({ NODE_PAYMENT_ABANDONED_RETENTION_DAYS: '7' })`** — used in the reap block to control the retention threshold per test.

## Relationships

- **`payments/services/retention.ts`** — provides `reapAbandonedPayments`, the function under test in the second describe block.
- **`payments/services/offline.ts`** — provides `recordOfflinePayment`, tested in the offline-vs-detached-order case.
- **`payments/services/intent.ts`** — provides `createIntent` and `confirmPayment`, used to create and settle test payments.
- **`payments/services/index.ts`** — barrel from which the above service functions are imported.
- **`payments/repository.ts`** — `paymentRepository.findById` is the assertion surface for "does the document still exist / what is `userId`?".
- **`payments/model.ts`** — `paymentModel` is used directly by the `touch` helper; `PaymentDocument` type is imported for the offline test.
- **`payments/module.ts`** — `paymentsModule` is registered with `registerCheckoutModules` in `beforeEach` to wire the real service graph.
- **`users/index.ts`** — `userService.remove(user, true)` triggers the hard-delete cascade that unsets the payment's `userId`.
- **`users/tests/factories.ts`** — `createUser` factory for test accounts.
- **`orders/tests/factories.ts`** — `createOrder`, `toOrderItem` for order setup; `detachOrderUserId` simulates the order-side cascade (the same path `personalData.erase` walks) for the offline and stranger tests.
- **`products/tests/factories.ts`** — `createProduct` to build the order line item.
- **`kernel/events.ts`** — `resetDomainEvents()` in `afterEach` to isolate event-bus state between tests.
- **`infrastructure/http/response.ts`** — `ResponseSuccess<T>` type used to cast the return values of service calls (e.g. `intent as ResponseSuccess<Payment>`).

## Notes

- The file's module doc-comment makes the design intent explicit: the payment is a *receipt*, not an account-owned entity. The erasure cascade detaches (`userId → undefined`) rather than deletes.
- The offline-payment test is called out as the **only live path** that can still write a payment against a detached order (an operator recording cash); a customer's intent path is blocked, and the test proves it.
- `touch` must pass `{ timestamps: false }` — without it Mongoose's `updatedAt` middleware rewrites the field to "now" and the retention-window assertions break.
- The reap tests rely on environment variables (`NODE_PAYMENT_ABANDONED_RETENTION_DAYS`), not hardcoded constants, so the window is controllable per-test.
- All tests run against a real test database (`setupTestDb()`) and real module wiring; there are no service-level mocks in this file.
