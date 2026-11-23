---
source: src/modules/orders/tests/integration/hold-doors.test.ts
source_sha256: a4eecec69a6f7a9133a04f1fde2d462d4df74c8a6e63164011d6400c252bc8ee
context_sha256: 60bfe278ecc599b6af7a55011dbdce0e3d70dbc59868270f453b2d85666210ee
generated_at: 2026-11-22T06:28:47.427295+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/hold-doors.test.ts

## Purpose
Integration tests, run against a real Mongo database, for the three "doors" the `orders` module exposes over an order's stock hold: `releaseStock` (give back a canceled remainder), `extendHold` (keep an open hold alive) and `isPayableNow` (card-confirm pre-check). They exist so that no other module needs to manipulate an order's inventory reservation directly.

## Key elements
- `setupTestDb()`: called at module level to prepare the test database.
- `orderHolding(status)`: helper that creates a product (`onHand: 10`), seeds an order in the given `OrderStatus`, reserves 3 units via `inventoryService.reserveForOrder`, and returns `{ orderId, productId }`.
- `describe('extendHold')`:
  - Moves an open hold's `expiresAt` to roughly now plus the given hours (checked with a 7-day extension, within 60 s).
  - Resolves to nothing (`toBeUndefined`) and leaves `expiresAt` unchanged for an already `committed` hold.
  - Resolves to nothing (`toBeUndefined`) for an order with no hold.
- `describe('isPayableNow')`:
  - `true` for a pending order whose units are held.
  - `false` if the hold was released (via `releaseForOrder(orderId, 'expire')`) even though the order is still pending.
  - `true` for a pending order with no hold at all.
  - `false` for an order already `paid`, and for a nonexistent order id.
- `describe('releaseStock')`:
  - Releasing 1 of 3 committed units returns `true`, leaves counters at `{ onHand: 10, reserved: 2, available: 8 }`, and keeps the reservation `committed`.
  - Releasing all 3 units ends the reservation as `released`.
  - Returns `false` when there is no open hold.

## Relationships
- Tests `extendHold`, `isPayableNow` and `releaseStock` from `src/modules/orders/services/fulfillment.ts`.
- Uses `inventoryService` (`src/modules/inventory`) to set up state: `reserveForOrder`, `commitForOrder`, `releaseForOrder` and `forgetAvailability`.
- Reads reservation state through `reservationRepository` (re-exported from `src/modules/inventory/tests/factories.ts`) with `findByOrderId`.
- Seeds data with `seedOrder` (`src/modules/orders/tests/factories.ts`) and `createProduct` / `countersOf` (`src/modules/products/tests/factories.ts`).
- Wraps `releaseStock` calls in `withTransaction` from `src/infrastructure/runtime/database.ts`, passing the session through.
- `OrderStatus` comes from `src/types/index.ts`; `setupTestDb` comes from `tests/support/setup-test-db.ts`.

## Notes
- `isPayableNow` only treats a *closed* (released) hold as unpayable. A missing hold still counts as payable. The test comments explain this: an expiry releases the hold first and cancels the order after, so a card must not be charged in between.
- `releaseStock` takes a transaction session as its third argument.
- After a successful `releaseStock`, the test calls `inventoryService.forgetAvailability([productId])` before reading counters.
- `releaseStock` tests commit the hold first, so they cover releasing from a committed (paid) hold.
- The nonexistent-order test uses a hard-coded 24-hex-character id.
