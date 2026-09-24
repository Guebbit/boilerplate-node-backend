---
source: src/modules/orders/tests/integration/pending-effects.test.ts
sha256: cd835e03924117348eeeec811a56501c1969b9d6cc2550fd9f739770a1e5276a
generated_at: 2026-09-23T19:11:11.944967+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/pending-effects.test.ts

## Purpose

Integration tests for the "pending effects" durability mechanism: when `cancelById` fires `ORDER_CANCELLED` and the refund handler throws, a `pendingEffects: ['refund']` marker must survive in the order document, and `retryPendingEffects` must later re-announce the event to discharge it. All assertions read back from a real Mongo instance to verify actual write semantics (conditional `$set`, conditional `$pull`, sparse-index query) rather than service return values.

## Key elements

- **`seedOrder()`** — Creates a fresh user (unique `buyer-N@example.com`), a product, and a `pending` order. The `seeded` counter guarantees unique emails across tests.
- **`storedEffects(orderId)`** — Re-reads the order via `orderRepository.findById` and returns `order?.pendingEffects`. Always hits the DB; never trusts the in-memory object returned by the service.
- **`describe('cancelById — writing the intent down')`** — Four cases: marker persists when refund throws; marker drains on success; no marker when `refund: false`; marker excluded from serialized output (`withActions`).
- **`describe('retryPendingEffects')`** — Five cases: re-announcement settles a stuck order; second pass is a no-op (idempotence); marker retained if retry also throws; orders owing nothing are skipped; grace window defers the sweep.
- **Hooks** — `beforeEach` sets `NODE_ORDER_EFFECT_RETRY_MINUTES=0` (zero grace) and resets the `seeded` counter; `afterEach` deletes the env var and calls `resetDomainEvents()`.

## Relationships

- **`src/modules/orders/services/index.ts`** — The system under test: `orderService.cancelById`, `orderService.retryPendingEffects`, `orderService.withActions`.
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` is used to verify what Mongo actually stored (the whole point of real-DB tests).
- **`src/modules/orders/events.ts`** — Exports the `ORDER_CANCELLED` event constant that the tests subscribe to and assert on.
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` provide the event bus the tests hook into; the refund handler is registered here and made to throw or succeed.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` for order seeding.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for seeding.
- **`src/modules/users/tests/factories.ts`** — `createUser` for seeding.
- **`tests/support/callers.ts`** — `asAdmin()` supplies the authenticated caller passed to service methods.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions the real Mongo instance the tests run against.

## Notes

- **Real Mongo, not stubs.** The module docblock states the rationale: a stubbed repository would only assert the stub. The guarantees under test (conditional writes, sparse index) are properties of the persistence layer.
- **Grace window is zeroed by default.** `NODE_ORDER_EFFECT_RETRY_MINUTES=0` makes a marker written "now" immediately due. The single test that needs a non-zero window sets it to `'5'` inline and restores cleanup via `afterEach`.
- **`storedEffects` vs. service return.** Tests deliberately re-read from the repo after each operation. The service may return a document that hasn't been flushed or that includes transient state; the DB read is the source of truth for "what survived."
- **`seeded` counter is file-local.** It resets in `beforeEach` so each test file run starts at `buyer-1`, keeping email uniqueness within a single test run without coupling to a global counter.
