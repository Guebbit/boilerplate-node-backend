---
source: src/modules/payments/tests/integration/retention.test.ts
source_sha256: fd6421f7053fbd7d553ee4ad8810350fc1038209558cd154fce83472bbe76d6d
context_sha256: 509a8ea6c53525d6b4e3750021222960bc8c3ea0b4255c902d85b8031693b693
generated_at: 2026-11-22T07:01:56.647335+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/retention.test.ts

## Purpose
Integration tests for the payments module's data-retention behaviour. They cover two things. First, erasing a user account detaches the payment from the user (unsets `userId`) rather than deleting it. Second, the `reapAbandonedPayments` sweep deletes payment attempts that never settled once they are past a configurable retention window.

## Key elements
- **`describe('payments — detach on account erasure')`**: four tests.
  - `userId` is unset after `eraseAsScheduled(user)` runs.
  - The payment document still exists after erasure ("the receipt, not the account").
  - `recordOfflinePayment` by an admin against an already-detached order leaves `userId` `undefined`, not the string `"undefined"`.
  - A different customer cannot `createIntent` on an order whose account is gone (`success` is `false`).
- **`touch(paymentId, updatedAt)`**: local helper that backdates a payment's `updatedAt` via `paymentModel.updateOne(..., { timestamps: false })`. Without `timestamps: false`, Mongoose would overwrite the value with the current time.
- **`describe('payments — reapAbandonedPayments (reap-payments sweep)')`**: three tests, all with `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` set to `'7'`.
  - An unsettled attempt last updated 8 days ago is deleted, and the sweep returns `1`.
  - An attempt last updated 6 days ago is kept, and the sweep returns `0`.
  - A payment confirmed via `confirmPayment` is never deleted, even when backdated by 365 days, and the sweep returns `0`.
- Both suites call `setupTestDb()` at module level. In `beforeEach` they call `registerCheckoutModules([paymentsModule])`, and in `afterEach` they call `resetDomainEvents()`.

## Relationships
- **`@modules/payments/services`** (`paymentService`): `createIntent`, `confirmPayment`, `recordOfflinePayment` and `reapAbandonedPayments` are the code under test.
- **`@modules/payments/repository`** (`paymentRepository`) and **`@modules/payments/model`** (`paymentModel`, `PaymentDocument`): the repository is used to check persisted state, and the model is used to backdate `updatedAt`.
- **`@modules/payments/module`**: registered through `registerCheckoutModules` in `tests/support/checkout-modules.ts`. This gives the erasure cascade real module wiring.
- **Factories** (`users`, `products`, `orders` under `tests/factories`): `createUser`, `eraseAsScheduled`, `createProduct`, `createOrder`, `toOrderItem` and `detachOrderUserId` build the fixtures and trigger erasure or detachment.
- **`@kernel/events`**: `resetDomainEvents` clears handlers between tests.
- **`tests/support/*`**: `setupTestDb` sets up the database, `asCustomer`, `callerContextAs` and `testCallerContext` build caller contexts, and `setEnvironment` overrides env vars.
- **`@infrastructure/http/response`** (`ResponseSuccess`) and **`@types`** (`Payment`): used only for type assertions on service results.

## Notes
- `eraseAsScheduled(user)` goes through the real cascade. `detachOrderUserId(...)` (given a future date, `Date.now() + 100_000`) puts the order into the detached state directly.
- The header comment says the offline-payment path is the only live route to a detached order. A customer's intent cannot reach one, because no account owns it.
