---
source: src/modules/payments/tests/integration/retention.test.ts
sha256: c6f93f14431df682fbe60c81d2f3bed63489ffbf9b083559ce561f6619b24eb6
generated_at: 2026-09-23T19:23:45.441022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/retention.test.ts

## Purpose

Integration test suite covering two retention guarantees of the payments module: (1) **erasure detach** — when an account is hard-deleted, the associated payment's `userId` is unset (the payment survives as a receipt), and (2) **abandoned-intent reaping** — the `reapAbandonedPayments` sweep deletes unsettled intents that exceed a configurable age window, while never touching settled payments. Both paths are exercised through real module wiring rather than unit-level mocks.

## Key elements

- **`describe('payments — detach on account erasure')`** — three tests asserting that `userService.remove(user, true)` unsets `payment.userId`, that the payment document still exists, and that an admin `createIntent` against an already-detached order records `userId: undefined` (not the string `"undefined"`).
- **`describe('payments — reapAbandonedPayments (reap-payments sweep)')`** — three tests asserting the sweep deletes an expired unsettled intent, leaves one still within the window intact, and never deletes a confirmed/successful payment regardless of age.
- **`touch(paymentId, updatedAt)`** — module-level helper that backdates a payment's `updatedAt` via `paymentModel.updateOne({ $set: { updatedAt } }, { timestamps: false })` to simulate elapsed time without Mongoose overwriting the value.
- **`beforeEach` / `afterEach`** in both suites — register the full module graph (account, delivery, products, users, inventory, orders, payments, cart) and reset domain events / restore the retention env var.

## Relationships

- **`@modules/payments/services`** (`createIntent`, `confirmPayment`, `reapAbandonedPayments`) — the production functions under test; all assertions are made against their effects.
- **`@modules/payments/repository`** (`paymentRepository`) — used to reload and assert payment state after each scenario.
- **`@modules/payments/model`** (`paymentModel`) — used exclusively by the `touch` helper to backdate `updatedAt`.
- **`@modules/payments/module`** — registered in `registerModules` so the retention service is wired and callable.
- **`@kernel/registry`** (`registerModules`) — sets up the full DI/module graph for each test.
- **`@kernel/events`** (`resetDomainEvents`) — clears the domain-event bus between tests to avoid cross-test contamination.
- **`@modules/orders/tests/factories`** (`createOrder`, `toOrderItem`, `detachOrderUserId`) — creates order fixtures and simulates the detached-user state for the admin-intent test.
- **`@infrastructure/http/response`** (`ResponseSuccess` type) — structural cast on `createIntent` / `confirmPayment` return values to access `.data`.
- **`@modules/account/module`**, **`@modules/cart/module`**, **`@modules/delivery/module`**, **`@modules/inventory/module`**, **`@modules/orders/module`**, **`@modules/users/module`**, **`@modules/products/module`** — all registered to satisfy the cross-module cascade path (account erasure → order detach → payment detach) that the suite exercises end-to-end.

## Notes

- **`timestamps: false` in `touch`** — Mongoose's `timestamps: true` (the default) would overwrite `updatedAt` with the current time on the next `save`; passing `timestamps: false` to the raw `updateOne` is what lets the test pin a past timestamp.
- **Env-var save/restore** — `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` is captured into `originalRetention` once at the describe-block level and restored (or deleted) in `afterEach`; forgetting this leaks the value into other suites.
- **The "string `"undefined"`" test** — this is a regression guard: when an admin creates an intent against an order whose user is already gone, the old code stringified `undefined` into the `userId` field. The test pins `toBeUndefined()` specifically to catch that.
- **`detachOrderUserId` is a factory helper**, not a production service call — it directly mutates the order document to simulate the post-erasure state, bypassing the real account-erasure cascade (which is covered by the first two tests instead).
