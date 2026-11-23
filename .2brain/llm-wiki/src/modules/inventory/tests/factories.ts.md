---
source: src/modules/inventory/tests/factories.ts
source_sha256: d2f65825268b9c10ece2e4e047d691dc8cd53de138e374f26f820eb254f3d5fc
context_sha256: cb2820a7f482b4d22e0ccc8db7b6e5af31e172348fa1093c8e379a759fd36eaa
generated_at: 2026-11-22T05:25:08.905266+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/factories.ts

## Purpose
The test-side entry point into `inventory`'s storage, for other modules' tests. Sibling modules have an import boundary that forbids reaching `../repository` or `../model` directly, so this file re-exports or wraps the pieces they need to read, assert on, and force stock rows.

## Key elements
- `removeLevel` (re-export from `../services/levels`): erases a product's level row, for testing a product that has none. It is deliberately not on `inventoryService`. In production only this module's own `product.deleted` listener runs it.
- `stockLevelRepository`, `reservationRepository` (re-exports from `../repository`): the stock rows and holds, used for a sibling's own assertions on what the ledger holds.
- `forceStockLevel(productId, onHand, reserved)`: runs `stockLevelModel.updateOne` with `$set` on `onHand` and `reserved`, and sets `available` to `onHand - reserved`. It bypasses every stock rule, so a test can move stock behind a cart's back.

## Relationships
- Imports `stockLevelModel` from `../model`, and re-exports from `../repository` and `../services/levels`.
- Used by integration tests in other modules (cart, delivery, orders, payments, returns, shop-tasks) and by inventory's own integration tests (`availability-cache.test.ts`, `top-up.test.ts`).

## Notes
- `forceStockLevel` is never a production door. Every real stock write goes through a conditional movement.
- `forceStockLevel` is an `updateOne` on `{ productId }`, so it only changes an existing level row. It does not create one.
