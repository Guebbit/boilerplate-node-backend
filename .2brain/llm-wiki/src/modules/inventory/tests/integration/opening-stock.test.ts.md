---
source: src/modules/inventory/tests/integration/opening-stock.test.ts
source_sha256: d3d4f9177e6b543e8690107851c416cced0bcb34e8691875cf3440d5ee15952d
context_sha256: 0407bd63734af0abf069b29ddfe4c29c632ba8b6ebe0b61f0337d225692c2b58
generated_at: 2026-11-22T05:27:23.699737+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/opening-stock.test.ts

## Purpose
Integration test verifying that the inventory module's `PRODUCT_CREATED` listener is idempotent under the outbox's at-least-once delivery. A redelivered event must find the existing stock level, change nothing, and never book a movement.

## Key elements
- `setupTestDb()` — sets up the test database for the suite.
- `beforeEach` — calls `resetDomainEvents()` and then `inventoryModule.subscribe()` so each test has a freshly registered listener. `afterAll` resets the events again.
- `productWithoutLevel()` — creates a product via `createProduct({ onHand: 0 })`, then deletes its stock-level row with `stockLevelRepository.deleteByProductId`. This simulates the state before the relay delivers the event. It returns the product id as a string.
- `onHandOf(productId)` — returns the stored `onHand` count, or `undefined` if there is no row.
- `movementCount(productId)` — returns the number of ledger rows from `inventoryService.listMovements`.
- Test 1: after emitting `PRODUCT_CREATED`, `onHand` is 0 and there are no movements.
- Test 2: emits the event, then calls `inventoryService.receive(productId, 7, undefined, testCallerContext)`, then emits the event again. `onHand` remains 7 and there is exactly 1 movement (the receipt).

## Relationships
- `@kernel/events` (`src/kernel/events.ts`): supplies `emitDomainEvent` to fire the event and `resetDomainEvents` to clear subscribers.
- `src/modules/inventory/module.ts`: the default-exported `inventoryModule` is subscribed in `beforeEach` to register the listener under test.
- `src/modules/inventory/repository.ts`: `stockLevelRepository` is used to delete and read level rows.
- `src/modules/inventory/services/index.ts`: `inventoryService` is used for `receive` and `listMovements`.
- `src/modules/products/index.ts`: exports the `PRODUCT_CREATED` event constant.
- `src/modules/products/tests/factories.ts`: `createProduct` builds the product fixture.
- `tests/support/callers.ts`: `testCallerContext` is the caller context passed to `receive`.
- `tests/support/setup-test-db.ts`: `setupTestDb` provides the database lifecycle.

## Notes
- The listener is exercised by emitting the event directly through `emitDomainEvent`. The outbox relay itself is not involved.
- Creating a product with `onHand: 0` already leaves a level row, so the helper deletes it to reproduce the pre-delivery state.
