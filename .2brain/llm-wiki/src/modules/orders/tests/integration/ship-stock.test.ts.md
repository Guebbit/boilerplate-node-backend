---
source: src/modules/orders/tests/integration/ship-stock.test.ts
sha256: 4f0d46ec63bc1ade221f6d345540bd8f6e45b1944c1782bc3899f91ee4afedcc
generated_at: 2026-10-15T11:18:25.818464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/ship-stock.test.ts

## Purpose

Integration test (real MongoDB) that verifies the stock-deduction contract around order dispatch: `shipStock` takes shipped units off `onHand` within its own transaction, the follow-up status moves (`markShipped`, `markDelivered`) take nothing further, and the admin override is the only status change that dispatches remaining units on its own.

## Key elements

- **`paidOrderHolding(status, digital?)`** — local helper; creates a product with 10 on-hand, seeds an order in the given status, reserves 3 units, and commits the hold. Returns `{ orderId, productId }`.
- **`stillClaimed(orderId)`** — delegates to `inventoryService.isStockBoundToOrder`; asserts whether the hold is still live.
- **`shipRows(productId)`** — counts `Ship`-reason movement entries in the ledger for the given product.
- **`describe('paying and processing')`** — asserts that an admin override from `paid` → `processing` changes no stock counters.
- **`describe('shipStock')`** — three cases: partial ship (1 of 3) leaves the remainder held; full ship (3 of 3) releases the hold and subsequent `markShipped`/`markDelivered` are stock-neutral; a thrown error inside the transaction rolls back all stock changes.
- **`describe('the admin override')`** — parameterized (`it.each`) test that overriding to `shipped` or `delivered` from `paid` takes all 3 units; a no-op check when the order is already `shipped`; and a partial-ship-then-override case confirming only the unshipped remainder is deducted.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions a real Mongo instance for the suite.
- **`tests/support/callers.ts`** — `callerContextAs('admin', …)` fabricates the admin identity passed to `overrideStatus`.
- **`src/modules/orders/tests/factories.ts`** — `seedOrder` / `seedDigitalOrder` create the order documents under test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` mints a product with a known `onHand`; `countersOf` reads back the live stock counters for assertions.
- **`src/modules/inventory/index.ts` / `services/index.ts`** — `inventoryService.reserveForOrder`, `.commitForOrder`, `.isStockBoundToOrder`, `.listMovements`, `.shipForOrder` are the production API the test exercises.
- **`src/modules/orders/services/fulfillment.ts`** — `shipStock` (the unit under test) and `refreshShelf` (cache invalidation after commit).
- **`src/modules/orders/services/status.ts`** — `markShipped` / `markDelivered`; asserted to be stock-neutral.
- **`src/modules/orders/services/override.ts`** — `overrideStatus`; the only status path that triggers a stock dispatch in the override scenario.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps `shipStock` calls and provides the rollback scenario.
- **`src/types/index.ts`** — `OrderStatus` and `StockMovementReason` enums used for setup and assertions.

## Notes

- The suite runs against **real Mongo**, not mocks, to exercise transactional atomicity (the rollback test deliberately throws inside `withTransaction`).
- `refreshShelf` is called **after** the transaction commits because the product catalogue cache cannot participate in the rollback — a convention that every `shipStock` test follows.
- `it.each([shipped, delivered])` covers the two override targets that trigger a dispatch; the "already shipped → delivered" case guards against a double-deduction bug.
- `seedDigitalOrder` is imported but only reachable via `paidOrderHolding(_, true)`; no current test case passes `digital = true`.
