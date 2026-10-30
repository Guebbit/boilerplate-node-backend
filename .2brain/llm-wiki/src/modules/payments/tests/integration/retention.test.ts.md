---
source: src/modules/payments/tests/integration/retention.test.ts
sha256: 6a99f6230cf5c5c128cd597cd2001470a127eac4f49a6a9a39e2d4eea6ed6ef2
generated_at: 2026-10-29T05:20:53.341120+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/retention.test.ts

## Purpose

Integration tests covering two retention mechanisms for payments: (1) account erasure detaches a payment from its user without deleting it, and (2) the `reapAbandonedPayments` sweep deletes only unsettled attempts past a configurable window. Both are exercised through real module wiring rather than unit-level mocks.

## Key elements

- **`describe('payments — detach on account erasure')`** — four tests verifying that `eraseAsScheduled` unsets `userId` on the payment, the payment document survives, an offline payment recorded against a detached order stores `userId: undefined` (not `"undefined"`), and a stranger cannot open a new intent on a detached order.
- **`describe('payments — reapAbandonedPayments (reap-payments sweep)')`** — three tests verifying the sweep deletes an abandoned attempt past the retention window, leaves within-window attempts untouched, and never deletes a confirmed/successful payment regardless of age.
- **`touch(paymentId, updatedAt)`** — local helper that backdates a payment's `updatedAt` via `paymentModel.updateOne` with `{ timestamps: false }` so Mongoose doesn't immediately overwrite it.
- **`beforeEach` / `afterEach`** in each block — registers `paymentsModule` via `registerCheckoutModules` and resets domain events after every test.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once at module load to provision the in-memory/ephemeral database.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` and `eraseAsScheduled` to simulate the erasure trigger.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder`, `toOrderItem`, and `detachOrderUserId` to set up pre-detached order state.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct` for order line items.
- **`src/modules/payments/services/index.ts`** — the `paymentService` under test (`createIntent`, `recordOfflinePayment`, `confirmPayment`, `reapAbandonedPayments`).
- **`src/modules/payments/repository.ts`** — `paymentRepository.findById` used to assert post-condition state.
- **`src/modules/payments/model.ts`** — `paymentModel` used directly in the `touch` helper; `PaymentDocument` type imported for the offline-payment assertion.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered into the checkout module graph.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the module graph per test.
- **`tests/support/callers.ts`** — `asCustomer`, `callerContextAs`, `testCallerContext` build the caller identity passed to service methods.
- **`tests/support/environment.ts`** — `setEnvironment` injects `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` to control the sweep window.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears queued domain events between tests.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess<T>` type used to narrow service return values.
- **`src/types/index.ts`** — `Payment` domain type for cast assertions.

## Notes

- The `touch` helper deliberately passes `{ timestamps: false }` so Mongoose's automatic `updatedAt` bump doesn't undo the backdate. Without this, the reaping-window tests would be meaningless.
- `setEnvironment` is called inside individual tests (not `beforeEach`) because the retention-days value could theoretically differ per test; currently all reaping tests use `'7'`.
- The file tests two logically separate concerns (erasure cascade vs. time-based reaping) in one file because both are "retention" of payment records and share the same setup scaffolding.
- The offline-payment test is explicitly called out in the module doc-comment as the *only* live path that can still write to a detached order (an operator recording cash), distinguishing it from the customer-facing intent path which is blocked.
