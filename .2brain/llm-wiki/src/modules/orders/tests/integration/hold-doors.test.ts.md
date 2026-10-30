---
source: src/modules/orders/tests/integration/hold-doors.test.ts
sha256: dab7af08913c502ea3c5bdd567527f210966498fb596d59dc2e4223ceedfe549
generated_at: 2026-10-29T04:53:37.947128+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/hold-doors.test.ts

## Purpose

Integration tests (against a real MongoDB) for the three stock-hold "doors" the orders module exposes to other modules: `extendHold` (push a hold's expiry forward), `releaseStock` (return committed units to the shelf), and `isPayableNow` (pre-check before charging a card). The file exists to guarantee that no other module can drive an order's stock hold through undocumented paths.

## Key elements

- **`orderHolding(status)`** – Local helper. Creates a product (10 on hand), seeds an order in the given `OrderStatus`, and reserves 3 units via `inventoryService.reserveForOrder`. Returns `{ orderId, productId }`.
- **`describe('extendHold')`** – Verifies the deadline shifts by the requested hours, is a no-op on an already-committed hold, and is a no-op when no hold exists.
- **`describe('isPayableNow')`** – Verifies the pre-check returns `true` for a pending order with a live hold, `false` after the hold is released (expiry path), `true` when no hold exists at all (missing ≠ oversold), `false` for paid or nonexistent orders.
- **`describe('releaseStock')`** – Verifies partial release decrements the hold but keeps it committed, full release flips status to `released`, and the call returns `false` when no open hold is found. All calls are wrapped in `withTransaction`.

## Relationships

- **`src/modules/orders/services/fulfillment.ts`** – The system under test; supplies `extendHold`, `isPayableNow`, `releaseStock`.
- **`src/modules/inventory/index.ts`** – Provides `inventoryService` used to set up/commit/release holds in fixtures.
- **`src/modules/inventory/tests/factories.ts`** – Provides `reservationRepository` for asserting hold state after each operation.
- **`src/modules/orders/tests/factories.ts`** – Provides `seedOrder` to create orders in a given status.
- **`src/modules/products/tests/factories.ts`** – Provides `createProduct` and `countersOf` (stock-level assertions).
- **`src/infrastructure/runtime/database.ts`** – Provides `withTransaction`; required because `releaseStock` is session-aware.
- **`src/types/index.ts`** – Provides the `OrderStatus` enum used by fixtures and assertions.
- **`tests/support/setup-test-db.ts`** – Called once at module load (`setupTestDb()`) to spin up the real Mongo instance.

## Notes

- `isPayableNow` deliberately returns **`true`** when the order has *no* hold at all. The test documents the intent: only a **closed** hold signals an oversell condition; a missing hold is a different (benign) case.
- `releaseStock` tests must pass a Mongo session via `withTransaction`; calling it outside a transaction is not exercised here.
- After any release, the test calls `inventoryService.refreshStockCacheForProducts` before reading `countersOf`, because stock counters are cached and not updated in-band.
- The file uses a **real** database (no mocks for inventory or orders); the only "fake" data comes from the factory helpers.
