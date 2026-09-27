---
source: src/modules/orders/tests/integration/pending-effects.test.ts
sha256: ca3d122495194326cf575dee432288afc0546d3e7ec3e73f7b00e4ead7e931e9
generated_at: 2026-09-27T15:18:34.174697+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/pending-effects.test.ts

## Purpose

Integration test suite verifying that a failed refund during order cancellation leaves a durable `pendingEffects` marker on the order document, and that `retryPendingEffects` correctly re-announces the refund, drains the marker on success, preserves it on repeated failure, and respects a configurable grace window. Runs against real MongoDB because the guarantees under test are properties of the actual writes (conditional `$set`/`$pull`, sparse-index query), not of in-memory logic.

## Key elements

- **`seedOrder()`** — creates a fresh user (unique email via a `seeded` counter), a product, and a pending single-item order; returns the order.
- **`storedEffects(orderId)`** — re-reads the order from `orderRepository.findById` and returns its `pendingEffects` array (or `undefined`).
- **`describe('cancelById — writing the intent down')`** — four tests:
  - Marker survives when the refund handler throws.
  - Marker is drained (→ `[]`) when the refund succeeds.
  - No marker is written when the operator passes `{ refund: false }`.
  - `pendingEffects` is stripped from the serialized API response via `orderService.withActions`.
- **`describe('retryPendingEffects')`** — five tests:
  - A stuck order is re-announced and settles on the second attempt.
  - A second pass is a no-op (idempotent; returns `0`, no duplicate refund).
  - Marker is preserved when the retry handler also throws.
  - Orders that owe nothing are ignored (no announcement, returns `0`).
  - Grace window (`NODE_ORDER_EFFECT_RETRY_MINUTES = '5'`) defers the sweep; marker remains.
- **`beforeEach`** — zeroes the grace window env var and resets the `seeded` counter.
- **`afterEach`** — deletes the env var and calls `resetDomainEvents()`.

## Relationships

- **`@kernel/events`** — `onDomainEvent` registers per-test stub handlers for `ORDER_REFUND_OWED`; `resetDomainEvents` clears them between tests.
- **`../../events`** — exports the `ORDER_REFUND_OWED` event constant used to subscribe and assert.
- **`../../repository`** — `orderRepository.findById` is the read path used to verify the document's `pendingEffects` state after writes.
- **`../../services/index`** — `orderService.cancelById` and `orderService.retryPendingEffects` are the SUTs; `orderService.withActions` is used to confirm serialization exclusion.
- **`@modules/orders/tests/factories`** — `createOrder`, `toOrderItem` build the order fixture.
- **`@modules/products/tests/factories`** — `createProduct` seeds the product referenced by the order item.
- **`@modules/users/tests/factories`** — `createUser` seeds the buyer.
- **`@tests/callers`** — `asAdmin()` provides the authorization context passed to service calls.
- **`@tests/setup-test-db`** — `setupTestDb()` provisions and tears down a real Mongo instance for the suite.

## Notes

- Real MongoDB is used deliberately; a stubbed repository would make the tests tautological.
- `NODE_ORDER_EFFECT_RETRY_MINUTES` controls the sweep's grace window; tests zero it in `beforeEach` so markers are immediately eligible, then one test overrides it to `'5'` to exercise the deferral path.
- The `seeded` counter exists because `users_email` has a unique index — without it, sequential tests would collide.
- `pendingEffects` is internal bookkeeping (similar to `anonymizeAfter`); it must never appear in API responses. One test explicitly asserts this via `withActions`.
- The `retryPendingEffects` "keeps the marker when retry throws" test encodes the invariant that clearing the marker on failure would destroy the only record that the refund is still owed.
