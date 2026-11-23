---
source: src/modules/inventory/tests/integration/preorder.test.ts
source_sha256: a73dbff85a89a6ecf6000310e38ba182d84096efe670fb25406da7633b6b7928
context_sha256: da73864802c4c44ae3338020445900f62f39066457c541f419c18c3530e3426a
generated_at: 2026-11-22T05:27:33.543133+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/preorder.test.ts

## Purpose
Integration test suite for the preorder allowance in the inventory module. It exercises the flow through the service entry points: claiming against `backorderLimit` (not the shelf), payment stamping the queue key, a stock receipt allocating to paid holds oldest-payment-first in its own transaction, and what release or expiry gives back. It runs against a real test DB (`setupTestDb()`) and replaces the audit port with a mock.

## Key elements
- **Local helpers**
  - `anOrderId()` produces a unique 24-character hex-style order id per call.
  - `levelOf(productId)` returns `onHand`, `reserved`, `backordered` and `backorderLimit` from the stock level.
  - `preorderProduct(limit)` creates a product with `onHand: 0` and `allowBackorder: true`, then sets the limit via `inventoryService.setBackorderLimit`.
  - `claim(productId, qty)` builds a line with `kind: 'backorder'`.
  - `announced()` reads `PREORDER_ALLOCATED` outbox events (payloads, in order).
- **`reserving a preorder`**
  - A claim raises `backordered` and leaves `onHand` and `reserved` at 0.
  - Over-limit requests are refused with `shortfalls` reporting `available`.
  - A product with no allowance is refused.
  - Stock on hand does not count as preorder room.
  - The ledger movement has `reason: backorder` with only `backorderedDelta` set.
  - A refused line rolls back the other lines of the same order.
- **`giving a preorder claim back`**
  - Covers `releaseForOrder`, expiry through `runReservationSweep` (with `NODE_RESERVATION_TTL_MINUTES: '0'`), and `releaseCommittedForOrder`.
  - Also covers `releaseLinesForOrder` for a partial cancel inside `withTransaction`. It leaves a hold item with quantity 1 and kind `backorder`.
  - In every case the allowance returns, not `reserved`.
- **`paying for a preorder`**
  - `commitForOrder` sets status `committed` and `committedAt`, the queue key.
  - If stock arrived while the hold was unpaid, committing serves it immediately and announces `waiting: 0`.
- **`a receipt serving the queue`**
  - `receive` allocates oldest payment first, not oldest order.
  - A short delivery splits the hold into a `stock` item and a remaining `backorder` item, with `waiting` set to the remainder.
  - The converted units are not sellable in between (`available` is 0).
  - The last visible test, which checks movement reasons, is cut off.

## Relationships
- **Services under test:** `inventoryService` (`../../services`), plus `productService` from `@modules/products` (imported).
- **Persistence:** reads state through `stockLevelRepository`, `stockMovementRepository` and `reservationRepository` (`../../repository`). Reads `outboxEventModel` (`@kernel/outbox`) for `PREORDER_ALLOCATED` (`../../events`). Uses `withTransaction` from `@infrastructure/runtime/database`.
- **Fixtures:** `createProduct` from `@modules/products/tests/factories`.
- **Test support:** `setupTestDb`, `withEnvironmentOverrides`, `observePort`, `auditPortMock`, `callerContextAs` and `testCallerContext`. `api` is also imported. The visible portion uses `testCallerContext` for `receive`.
- **Audit:** `@infrastructure/observability/audit` is mocked with `auditPortMock()` from `tests/support/ports.ts`. `inventoryAuditActions` (`../../audit`) and `StockMovementReason` (`@types`) are imported.

## Notes
- The audit port is replaced with `jest.mock` rather than spied on.
- Receipts only find committed (paid) holds. Unpaid holds are not allocated.
- Order ids are padded with the letter `c`, so ids from other test files do not collide.
