---
source: src/modules/orders/tests/integration/hold-doors.test.ts
sha256: 8d65dbb1a434000ff2b53ee534b9aaf938d03a9fce342aa20c225cd2fdee1ff4
generated_at: 2026-11-08T07:05:29.653004+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/hold-doors.test.ts

## Purpose

Integration tests (real MongoDB) for the three "doors" the orders module exposes for stock-hold management: `releaseStock`, `extendHold`, and `isPayableNow`. The file verifies that no other module needs to drive an order's hold directly—these functions are the only entry points, and their edge-case behavior (committed holds, missing holds, partial release) is locked in here.

## Key elements

- **`orderHolding(status)`** – helper that creates a product with 10 units on hand, seeds an order in the given `OrderStatus`, and reserves 3 units for that order via `inventoryService.reserveForOrder`. Returns `{ orderId, productId }`.
- **`describe('extendHold')`** – asserts the deadline shifts forward by the requested hours, is a no-op when the hold is already committed, and is a no-op when no hold exists.
- **`describe('isPayableNow')`** – asserts `true` for a pending order with an open hold, `false` after the hold is released (even if the order is still pending), `true` for a pending order with *no* hold at all, `false` for paid orders, and `false` for nonexistent orders.
- **`describe('releaseStock')`** – asserts partial release decrements reserved count while the hold stays committed, full release flips the hold to `released`, and calling it with no open hold returns `false`. All calls are wrapped in `withTransaction`.

## Relationships

- **`src/modules/orders/services/fulfillment.ts`** – the module under test; provides `extendHold`, `isPayableNow`, and `releaseStock`.
- **`src/modules/inventory/index.ts` / `src/modules/inventory/services/index.ts`** – `inventoryService` is used to set up and tear down holds (`reserveForOrder`, `commitForOrder`, `releaseForOrder`) and to refresh stock caches (`refreshStockCacheForProducts`).
- **`src/modules/inventory/tests/factories.ts`** – supplies `reservationRepository` for direct hold-state assertions.
- **`src/modules/orders/tests/factories.ts`** – `seedOrder` creates orders in a given status.
- **`src/modules/products/tests/factories.ts`** – `createProduct` and `countersOf` for product setup and stock-counter verification.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` wraps `releaseStock` calls so they run inside a Mongo session.
- **`src/types/index.ts`** – `OrderStatus` enum used to parameterize fixtures.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` provisions a real (test) database before any test runs.

## Notes

- Tests run against **real MongoDB**, not mocks; there is no in-memory DB or mock driver.
- `isPayableNow` deliberately returns `true` when a pending order has *no* hold at all—the only blocking state is a **committed** (closed) hold, not an open or missing one.
- `releaseStock` must be invoked inside a `withTransaction` session; calling it bare is not the supported path.
- After a `releaseStock` call the test manually calls `inventoryService.refreshStockCacheForProducts` before asserting counters—cache invalidation is not automatic.
- The module-level doc comment positions these three functions as the *sole* interface other modules use for hold lifecycle, reinforcing a boundary the tests guard.
