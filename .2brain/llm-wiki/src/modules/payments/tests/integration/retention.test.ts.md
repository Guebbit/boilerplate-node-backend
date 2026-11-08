---
source: src/modules/payments/tests/integration/retention.test.ts
sha256: 6a99f6230cf5c5c128cd597cd2001470a127eac4f49a6a9a39e2d4eea6ed6ef2
generated_at: 2026-11-08T07:36:47.973998+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/retention.test.ts

## Purpose

Integration tests for payment retention semantics: verifying that account erasure *detaches* (unsets `userId`) rather than deletes a payment, and that the `reapAbandonedPayments` sweep only reclaims unsettled attempts past a configurable window. Runs against a real test database with full module wiring.

## Key elements

- **`describe('payments — detach on account erasure')`** — four tests:
  - *unsets userId on the payment when the account is hard-deleted* — confirms the `personalData.erase → detachUserId` cascade reaches the payment document.
  - *the payment itself survives* — asserts `paymentRepository.findById` still returns a record after erasure.
  - *offline payment against a detached order records no payer* — calls `paymentService.recordOfflinePayment` with an admin caller and asserts `userId` is `undefined`, not `"undefined"`.
  - *no customer can open an intent on a detached order* — a second user calling `createIntent` on the orphaned order must fail.
- **`describe('payments — reapAbandonedPayments')`** — three tests:
  - *deletes an attempt past the window* — backdates `updatedAt` 8 days, sets retention to 7 days, expects `reapAbandonedPayments()` to return `1`.
  - *leaves an attempt within the window* — 6 days old, 7-day window, expects `0` and the record to persist.
  - *never deletes a confirmed payment* — confirms the payment, backdates 365 days, expects `0`.
- **`touch(paymentId, updatedAt)`** (local helper) — Mongoose `updateOne` with `{ timestamps: false }` to backdate `updatedAt` without the schema middleware rewriting it.

## Relationships

- **`@modules/payments/services`** — exercises `paymentService.createIntent`, `recordOfflinePayment`, `confirmPayment`, and `reapAbandonedPayments`.
- **`@modules/payments/repository`** — reads back payment documents to assert state.
- **`@modules/payments/model`** — `paymentModel` used directly by the `touch` helper.
- **`@modules/payments/module`** — registered in `beforeEach` via `registerCheckoutModules` to wire the module graph.
- **`@kernel/events`** — `resetDomainEvents` called in `afterEach` to prevent event leakage between tests.
- **`@modules/users/tests/factories`** — `createUser` and `eraseAsScheduled` drive the erasure scenario.
- **`@modules/orders/tests/factories`** — `createOrder`, `toOrderItem` build the order; `detachOrderUserId` simulates the detached-order precondition.
- **`@modules/products/tests/factories`** — `createProduct` supplies the order line item.
- **`@tests/callers`** — `asCustomer`, `callerContextAs`, `testCallerContext` construct caller identities for service calls.
- **`@tests/checkout-modules`** — `registerCheckoutModules` installs the module dependency graph for each test.
- **`@tests/environment`** — `setEnvironment` sets `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` for the sweep tests.
- **`@tests/setup-test-db`** — `setupTestDb` initialises the shared in-memory/ephemeral database.
- **`@infrastructure/http/response`** / **`@types`** — `ResponseSuccess<Payment>` and `PaymentDocument` used to type-assert service return values.

## Notes

- The module-level doc comment makes the design intent explicit: erasure is a *detach*, not a delete, and the offline-payment path is the only live route that can still touch a detached order.
- The `touch` helper relies on `timestamps: false` specifically to bypass Mongoose's `pre('save')` / `post('save')` auto-stamping; omitting it would reset `updatedAt` to the current time and break the window assertions.
- The sweep tests set `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` via `setEnvironment` rather than an env file, so the retention window is per-test and the file doesn't depend on `.env` state.
- `detachOrderUserId` is imported from the *orders* factories (not users), reflecting that the order document is where the user reference lives on the order side of the relationship.
