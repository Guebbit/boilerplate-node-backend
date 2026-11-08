---
source: src/modules/inventory/tests/integration/backorder-spill.test.ts
sha256: bb655cfd7d50ce61086e88c363d5ab5baeb3a50d5f8aa86e63617e0d2b6478bd
generated_at: 2026-11-08T06:05:12.666733+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/backorder-spill.test.ts

## Purpose

Integration tests for the "backorder-spill" reservation path: a line whose quantity exceeds shelf stock is split between `stock` and `backorder` kinds within a single transaction, the overflow is claimed against a per-product cap, and a failure anywhere rolls the entire hold back. Validates the atomicity, partial-coverage, concurrency, and failure-rollback guarantees of `inventoryService.reserveForOrder` when `spill: true`.

## Key elements

- **`anOrderId()`** – returns a unique 24-char hex string (MongoDB-ObjectId-shaped) so holds are keyed distinctly per test.
- **`productWith(shelf, limit)`** – creates a product via the factory, then sets a backorder limit on it; returns the product ID.
- **`spilling(productId, quantity)`** – builds a line item object with `spill: true`.
- **`levelOf(productId)`** – reads `reserved`, `available`, `backordered` from `stockLevelRepository` for assertions.
- **`itemsOf(orderId)`** – reads the reservation's items (`quantity`, `kind`) from `reservationRepository`.
- **`describe('reserving a line that may spill')`** – seven test cases:
  1. Whole line fits on shelf → no backorder owed.
  2. Partial shelf coverage → remainder claimed as backorder.
  3. Empty shelf → entire line claimed as backorder.
  4. Shelf + cap insufficient → refusal, nothing reserved.
  5. Multi-line hold where second line fails cap → first line rolled back.
  6. Two concurrent checkouts race for last unit → exactly one owes it.
  7. `replaceItems` throws → hold and stock levels fully restored.

## Relationships

- **`src/modules/inventory/services/index.ts`** – calls `inventoryService.setBackorderLimit` (setup) and `inventoryService.reserveForOrder` (the system under test).
- **`src/modules/inventory/repository.ts`** – imports `reservationRepository` (read holds, mock `replaceItems`) and `stockLevelRepository` (assert counters).
- **`src/modules/products/tests/factories.ts`** – uses `createProduct` to seed products with controlled `onHand` values.
- **`tests/support/setup-test-db.ts`** – calls `setupTestDb()` at module load to provision a clean test database.

## Notes

- The module doc block points to `docs/modules/inventory-reservations.md#preorders` for the design rationale.
- `anOrderId` pads with `'f'` to guarantee a 24-char string; this is a syntactic requirement, not a semantic one.
- The concurrency test (case 6) uses `Promise.all` on two `reserveForOrder` calls; assertions accept *either* order winning the shelf unit, only checking that exactly one backorder unit is owed in total.
- The rewrite-failure test spies on `reservationRepository.replaceItems` and asserts both stock counters and the hold document are fully restored after the rejection.
