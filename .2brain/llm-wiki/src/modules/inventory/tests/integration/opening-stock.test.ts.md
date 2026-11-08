---
source: src/modules/inventory/tests/integration/opening-stock.test.ts
sha256: d3d4f9177e6b543e8690107851c416cced0bcb34e8691875cf3440d5ee15952d
generated_at: 2026-11-08T06:06:46.716358+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/opening-stock.test.ts

## Purpose

Integration test verifying that the inventory module's `PRODUCT_CREATED` event listener is **idempotent** under the outbox's at-least-once delivery guarantee: a redelivered event must neither create a duplicate stock-level row nor book a spurious movement.

## Key elements

- **`productWithoutLevel()`** – Creates a real product via the products factory, then deletes its stock-level row to simulate the state "exists in products but inventory hasn't reacted yet."
- **`onHandOf(productId)`** – Reads the stored `onHand` value from `stockLevelRepository`; returns `undefined` if no row exists.
- **`movementCount(productId)`** – Returns the number of ledger entries via `inventoryService.listMovements`.
- **Test 1: "opens the level at zero and books no movement"** – Emits `PRODUCT_CREATED` once; asserts a level row at `onHand = 0` and zero movements.
- **Test 2: "opens it once when the same event is delivered twice…"** – Emits `PRODUCT_CREATED`, receives 7 units, then re-emits the same event; asserts `onHand` is still 7 and only one movement exists.

## Relationships

- **`@kernel/events`** – Supplies `emitDomainEvent` (to trigger the listener) and `resetDomainEvents` (test isolation).
- **`src/modules/inventory/module.ts`** – `inventoryModule.subscribe()` wires the `PRODUCT_CREATED` listener under test.
- **`src/modules/inventory/repository.ts`** – `stockLevelRepository` is the persistence layer the listener writes to; the test reads/deletes through it.
- **`src/modules/inventory/services/index.ts`** – `inventoryService.receive` books a receipt to exercise the "leaves what a receipt booked" path; `listMovements` counts ledger rows.
- **`src/modules/products/index.ts`** – Exports the `PRODUCT_CREATED` event constant used in the emit calls.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates a real product record in the test DB.
- **`tests/support/callers.ts`** – `testCallerContext` satisfies the caller parameter on `inventoryService.receive`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the in-memory/test database before the suite runs.

## Notes

- The test deliberately **deletes** the stock-level row after product creation (`productWithoutLevel`) to model the race where the product is committed before the relay delivers the event. Without this step the row would already exist and the idempotency path would be untested.
- `inventoryModule.subscribe()` is called in `beforeEach` rather than a one-time setup, ensuring the listener is freshly registered per test after each `resetDomainEvents`.
- The file exercises the *real* repository and service (not mocks), so it depends on a working test database and the full subscription wiring being correct.
