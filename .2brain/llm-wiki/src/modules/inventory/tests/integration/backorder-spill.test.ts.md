---
source: src/modules/inventory/tests/integration/backorder-spill.test.ts
sha256: bb655cfd7d50ce61086e88c363d5ab5baeb3a50d5f8aa86e63617e0d2b6478bd
generated_at: 2026-10-29T04:06:23.205601+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/backorder-spill.test.ts

## Purpose

Integration tests for the "spill" reservation path: when a line item requests more units than the shelf holds, the service splits the hold into a `stock` portion and a `backorder` portion (claimed against the product's backorder cap) within a single transaction. The tests verify the split math, the hold record's `kind` annotations, refusal and rollback semantics, and concurrent-assignment correctness.

## Key elements

- **`anOrderId()`** — returns a unique 24-char hex string per call; holds are keyed by this id.
- **`productWith(shelf, limit)`** — creates a product via `createProduct`, then sets its backorder limit via `inventoryService.setBackorderLimit`. Returns the product id.
- **`spilling(productId, quantity)`** — shorthand for a reservation line item with `spill: true`.
- **`levelOf(productId)`** — reads `stockLevelRepository` and projects `{ reserved, available, backordered }` for assertions.
- **`itemsOf(orderId)`** — reads `reservationRepository` and projects the hold's items as `{ quantity, kind }[]` for assertions.
- **`describe('reserving a line that may spill')`** — seven cases:
  - Full shelf coverage (no backorder needed).
  - Partial shelf + partial backorder split.
  - Empty shelf → entire quantity is backorder.
  - Refusal when `shelf + cap < requested`; nothing is taken.
  - Multi-line rollback: a later line's cap refusal rolls back the first line's stock hold.
  - Two concurrent orders racing for one unit: exactly one owes the backorder unit.
  - Failure of `reservationRepository.replaceItems` → hold is not written, levels unchanged.

## Relationships

- **`src/modules/inventory/services/index.ts`** — under test; calls `inventoryService.reserveForOrder` and `inventoryService.setBackorderLimit`.
- **`src/modules/inventory/repository.ts`** — assertions read state through `stockLevelRepository.findByProductId` and `reservationRepository.findByOrderId`; the failure test spies on `reservationRepository.replaceItems`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the seed product with `onHand` and `allowBackorder: true`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` is called at module load to provision an in-memory database for the whole suite.

## Notes

- `spilling` sets `spill: true as const`; omitting it would exercise the non-spill (strict stock) path, which is covered elsewhere.
- The concurrency test uses `Promise.all` without artificial interleaving — it relies on the service's transaction/locking to serialize the two reservations, not on test timing.
- Order ids are hex-padded to 24 chars to mimic MongoDB ObjectId shape; the counter is module-scoped, so ids are unique across the file but not across test files (irrelevant since each file gets a fresh DB via `setupTestDb`).
- The failure test (`replaceItems` rejection) proves the service rolls its own work back before the rewrite step; if the service ever adds post-rewrite side effects, this test will need updating.
