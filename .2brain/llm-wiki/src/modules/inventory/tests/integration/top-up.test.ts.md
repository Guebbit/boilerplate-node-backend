---
source: src/modules/inventory/tests/integration/top-up.test.ts
sha256: c0390d504e9457c5118fe1122de74466d66335e6982157d8b93ddc4faf5b9d27
generated_at: 2026-11-08T06:08:07.034564+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/top-up.test.ts

## Purpose

Integration tests for the "top-up" flow: reserving additional units onto an order's existing hold after a parcel was lost or partially returned. Verifies that the inventory service correctly splits a top-up between shelf stock and owed (backorder) units, respects existing holds from other orders, reopens already-shipped holds, and handles release-back semantics.

## Key elements

- **`anOrderId()`** – Generates a unique, syntactically valid 24-hex-char order ID per call.
- **`productWith(shelf)`** – Creates a product with the given on-hand count; backorder cap defaults to `0` (closed).
- **`shippedOrder(productId, quantity)`** – Runs the full lifecycle (reserve → commit → ship) to produce a completed order.
- **`topUp(orderId, productId, quantity)`** – Wraps `inventoryService.reserveMoreForOrder` in a `withTransaction` call.
- **`levelOf` / `holdOf` / `itemsOf` / `statusOf`** – Read helpers that project stock-level counters, hold status, and held items for assertions.
- **`describe('reserveMoreForOrder', …)`** – 8 tests covering: full shelf cover, hold reversion to `committed`, split shelf/owed claims, ledger reason (`owed` vs `backorder`), owed claims bypassing a closed cap while new sales are refused, protection of other orders' reservations, growth of a partially-shipped hold, and graceful no-op when the stock level row is deleted.
- **`describe('releaseTopUpForOrder', …)`** – 1 test verifying that releasing a top-up returns both shelf and backorder units and transitions the hold to `shipped` (not `released`).

## Relationships

- **`src/modules/inventory/services/index.ts`** – Source of `inventoryService`; all SUT calls (`reserveMoreForOrder`, `releaseTopUpForOrder`, `reserveForOrder`, `commitForOrder`, `shipLinesForOrder`, `receive`) go through this barrel.
- **`src/modules/inventory/repository.ts`** – Provides `reservationRepository`, `stockLevelRepository`, and `stockMovementRepository` used exclusively for post-condition assertions.
- **`src/modules/inventory/services/levels.ts`** – Indirectly exercised through `inventoryService`; the level counters asserted in `levelOf` are managed by this module.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` wraps every service call that mutates state, ensuring each top-up/ship/release is atomic.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds the product with a chosen on-hand quantity.
- **`src/modules/inventory/tests/factories.ts`** – `removeLevel` deletes the stock-level row to test the no-level edge case.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets the database before the suite runs.
- **`tests/support/callers.ts`** – `testCallerContext` supplies the caller identity required by `inventoryService.receive`.

## Notes

- All product fixtures have a backorder cap of `0` (closed). The tests explicitly verify that owed top-up claims bypass this cap while new-sale claims are still refused — a behavioral distinction central to the "owed" vs "backorder" ledger reasons.
- The hold lifecycle invariant tested here: top-up reverts a `shipped` hold to `committed` (preserving `committedAt`), while releasing the top-up reverts it back to `shipped` — never to `released`.
- `shippedOrder` ships the full quantity, so the shelf count drops to the on-hand remainder; tests rely on this to set up tight stock scenarios (e.g., 3 on hand, 3 shipped, then 1 received back).
