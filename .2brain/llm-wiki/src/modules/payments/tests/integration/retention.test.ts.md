---
source: src/modules/payments/tests/integration/retention.test.ts
sha256: 28ee3b1f4ad101af930d29ff1db52e2e733726390a350e166aec6965730082df
generated_at: 2026-09-27T15:28:37.198449+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/retention.test.ts

## Purpose

Integration tests for two payment-retention behaviors: (1) **account erasure** — hard-deleting a user detaches `userId` from the associated payment (and order) without deleting the payment record itself, and (2) **abandoned-payment reaping** — the `reapAbandonedPayments` sweep deletes unsettled attempts past a configurable retention window while never touching settled payments. Both suites exercise real module wiring via `registerCheckoutModules([paymentsModule])`.

## Key elements

- **`describe('payments — detach on account erasure')`** — three tests verifying that `userService.remove(user, true)` unsets `userId` on the payment, leaves the payment row intact, and that an admin intent against a pre-detached order records `undefined` (not the string `"undefined"`) as payer.
- **`describe('payments — reapAbandonedPayments (reap-payments sweep)')`** — three tests verifying the retention window: an 8-day-old attempt is deleted, a 6-day-old attempt survives, and a 365-day-old *settled* payment is never deleted regardless of age.
- **`touch(paymentId, updatedAt)`** (local helper) — backdates a payment's `updatedAt` via `paymentModel.updateOne` with `{ timestamps: false }` to prevent Mongoose from immediately resetting it to the current time.
- **Env-var save/restore** — `afterEach` in the reap suite restores `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` to its original value.

## Relationships

- **`src/modules/payments/services/index.ts`** — re-exports `createIntent`, `confirmPayment`, and `reapAbandonedPayments` used directly in assertions.
- **`src/modules/payments/services/retention.ts`** — implements `reapAbandonedPayments` (the function under test in the second suite).
- **`src/modules/payments/services/intent.ts`** — implements `createIntent`, the entry point that produces the payment records under test.
- **`src/modules/payments/services/settlement.ts`** — implements `confirmPayment`, used to settle a payment before the "never delete settled" assertion.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findById` is the primary assertion vehicle in every test.
- **`src/modules/payments/model.ts`** — `paymentModel` is used by the `touch` helper for raw Mongoose updates.
- **`src/modules/payments/module.ts`** — `paymentsModule` is registered in `beforeEach` to wire the real service→repository→event graph.
- **`src/modules/users/index.ts`** — `userService.remove(user, true)` triggers the cascade that detaches the payment.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, and `detachOrderUserId` (used to pre-detach an order before the admin-intent test).
- **`src/modules/products/tests/factories.ts`** — `createProduct` factory.
- **`src/kernel/events.ts`** — `resetDomainEvents` called in `afterEach` to prevent cross-test event leakage.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess<T>` type used to unwrap intent results.
- **`src/types/index.ts`** — `Payment` domain type for the cast `(intent as ResponseSuccess<Payment>).data`.

## Notes

- `touch` passes `{ timestamps: false }` to Mongoose; without it Mongoose's automatic `updatedAt` management would immediately overwrite the backdated value, making the retention-window test non-deterministic.
- The retention window is controlled entirely by the `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` env var (string number of days). Tests set it to `'7'` and rely on the afterEach cleanup.
- The erasure tests assert `userId` is `undefined` (not `null`) after `userService.remove` — a convention that downstream code must check with `toBeUndefined` / truthiness rather than a `null` comparison.
- `reapAbandonedPayments()` returns the count of deleted documents; tests assert `resolves.toBe(1)` or `resolves.toBe(0)` accordingly.
