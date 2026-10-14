---
source: src/modules/inventory/tests/integration/opening-stock.test.ts
sha256: 1e8b08c1d6992ca2b21c03827cdfe7d81da2678256c07337aac55f158259d36c
generated_at: 2026-10-14T16:02:49.845625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/opening-stock.test.ts

## Purpose

Integration test that verifies the inventory module's `PRODUCT_CREATED` listener is idempotent under the outbox's at-least-once delivery guarantee: a redelivered event books the opening count exactly once, and a product created with zero stock creates the level row without producing a ledger movement.

## Key elements

- **`productWithoutLevel()`** — helper that creates a real product (via `createProduct({ onHand: 0 })`) then deletes its stock-level row, simulating the state right after a product is created but before the event relay delivers.
- **`onHandOf(productId)`** — reads the level row through `stockLevelRepository.findByProductId`; returns `undefined` when no row exists.
- **`movementCount(productId)`** — calls `listMovements({ productId })` and returns the ledger-row count.
- **`describe('PRODUCT_CREATED listener')`** — two test cases:
  - *Books once on double delivery*: emits `PRODUCT_CREATED` twice with `onHand: 7`, asserts `onHand === 7` and exactly 1 movement.
  - *Zero stock, no movement*: emits once with `onHand: 0`, asserts `onHand === 0` and 0 movements.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory/test database before any test runs.
- **`src/modules/products/tests/factories.ts`** — `createProduct` inserts a real product document.
- **`src/modules/products/index.ts`** — supplies the `PRODUCT_CREATED` event-name constant.
- **`src/kernel/events.ts`** — `emitDomainEvent` triggers the listener; `resetDomainEvents` (called in `beforeEach`/`afterAll`) clears the event bus between tests.
- **`src/modules/inventory/module.ts`** — the module under test; `subscribe()` wires the `PRODUCT_CREATED` handler.
- **`src/modules/inventory/repository.ts`** — `stockLevelRepository` is used both to set up the "no row yet" precondition and to assert the resulting `onHand` value.
- **`src/modules/inventory/services/index.ts`** (re-exports from `levels.ts`) — `listMovements` provides the ledger rows used to verify idempotency.

## Notes

- `beforeEach` calls both `resetDomainEvents()` **and** `inventoryModule.subscribe()`. Forgetting the subscribe step silently skips every listener, making all assertions pass with stale state.
- The "delete the level row" step in `productWithoutLevel` is essential: without it the factory's own creation logic may already have written a row, and the idempotency assertion would be meaningless.
- The test emits the event **twice in sequence** (not concurrently) to model the outbox redelivery, not a race condition.
