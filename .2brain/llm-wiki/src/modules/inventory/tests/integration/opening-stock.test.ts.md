---
source: src/modules/inventory/tests/integration/opening-stock.test.ts
sha256: d3d4f9177e6b543e8690107851c416cced0bcb34e8691875cf3440d5ee15952d
generated_at: 2026-10-29T04:07:35.360731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/opening-stock.test.ts

## Purpose

Integration test that verifies the `PRODUCT_CREATED` listener is **idempotent** under the outbox's at-least-once delivery guarantee: a redelivered event must not create a second stock-level row, must not alter an existing on-hand count, and must never book a spurious ledger movement.

## Key elements

- **`setupTestDb()`** – one-time test-database initialisation (in-memory or throwaway schema).
- **`beforeEach`** – resets the in-memory domain-event queue and re-subscribes `inventoryModule` so every test starts with a clean listener wiring.
- **`afterAll`** – final domain-event reset to avoid leakage.
- **`productWithoutLevel()`** (local helper) – creates a real product via the products factory, then deletes its stock-level row to simulate the window where the product exists but the relay has not yet created the level.
- **`onHandOf(productId)`** (local helper) – returns the stored `onHand` count, or `undefined` if no level row exists.
- **`movementCount(productId)`** (local helper) – returns the number of ledger rows for the product via `inventoryService.listMovements`.
- **Test 1 – "opens the level at zero and books no movement"** – emits `PRODUCT_CREATED` once; asserts level is created at 0 and zero movements exist.
- **Test 2 – "opens it once when the same event is delivered twice, and leaves what a receipt booked"** – emits the event, performs a real `receive(7)`, then emits the event again; asserts on-hand is still 7 and exactly one movement row exists.

## Relationships

- **`src/kernel/events.ts`** – supplies `emitDomainEvent` / `resetDomainEvents` to drive and clean the in-memory event bus.
- **`src/modules/inventory/module.ts`** – `inventoryModule.subscribe()` registers the listener under test.
- **`src/modules/inventory/repository.ts`** – `stockLevelRepository.deleteByProductId` (setup) and `findByProductId` (assertion).
- **`src/modules/inventory/services/index.ts`** – `inventoryService.receive` (simulates a real receipt) and `inventoryService.listMovements` (assertion).
- **`src/modules/products/index.ts`** – exports the `PRODUCT_CREATED` event name.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates a persisted product for the test.
- **`tests/support/callers.ts`** – `testCallerContext` satisfies the caller-argument required by `receive`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the test database.

## Notes

- The module docstring frames the contract explicitly as **at-least-once idempotency**, not just "first delivery works." Both tests should be read through that lens.
- `productWithoutLevel` deletes the level row *after* creation to mimic the real race (product committed, relay pending); without that deletion the factory's own creation path may already have opened the level.
- The second test deliberately interleaves a `receive` call between the two emissions to prove the listener does not **clobber** stock that a legitimate receipt has already booked.
