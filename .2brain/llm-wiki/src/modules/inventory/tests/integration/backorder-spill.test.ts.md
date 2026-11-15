---
source: src/modules/inventory/tests/integration/backorder-spill.test.ts
sha256: 34fb59563f856208c8547b275333010c06bca5096ef6f7d172861e7e2a0385f4
generated_at: 2026-11-14T20:08:25.851497+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/backorder-spill.test.ts

## Purpose

Integration test that verifies the "backorder spill" path of `inventoryService.reserveForOrder`: when a reservation line is marked `spill: true` and the shelf cannot fully cover it, the service splits the quantity into a `stock` portion and a `backorder` portion against the product's backorder cap — all inside one transaction. The seven cases cover full-shelf, partial-spill, full-backorder, refusal, multi-line rollback, concurrent racing, and mid-transaction failure rollback.

## Key elements

- **`anOrderId()`** — returns a unique 24-char hex string so each hold is keyed by a syntactically valid order ID.
- **`productWith(shelf, limit)`** — creates a product via `createProduct` with `onHand: shelf` and `allowBackorder: true`, then sets the backorder limit (or `null`) via `inventoryService.setBackorderLimit`.
- **`spilling(productId, quantity)`** — builds a reservation line item with `spill: true as const`, the flag that distinguishes a spillable line.
- **`levelOf(productId)`** — reads `stockLevelRepository` and returns `{ reserved, available, backordered }` for assertions.
- **`itemsOf(orderId)`** — reads `reservationRepository.findByOrderId` and maps each item to `{ quantity, kind }`.
- **`describe('reserving a line that may spill')`** — seven `it` blocks (see Purpose). The last two exercise failure-rollback (via `jest.spyOn` on `reservationRepository.pushItems`) and concurrent two-checkout racing (via `Promise.all`).

## Relationships

- **`src/modules/inventory/services/index.ts`** — imports `inventoryService`; calls `reserveForOrder` and `setBackorderLimit` under test.
- **`src/modules/inventory/repository.ts`** — imports `reservationRepository` and `stockLevelRepository`; used directly to assert post-condition state and in the spy-based failure test.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to seed a product with a known `onHand` count.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module top-level to provision the test database before any test runs.

## Notes

- `setupTestDb()` is invoked as a **side-effect statement** (not inside a `beforeAll`), so the DB must be ready before the module is even imported by the runner.
- The concurrent test (`Promise.all`) asserts that across both outcomes exactly one unit appears in `owed`, but does **not** assert *which* of the two checkouts won the shelf unit — only the aggregate.
- The failure-rollback test spies on `reservationRepository.pushItems` specifically; if the service is refactored to call a different repository method for the write, this test will no longer inject the failure and will silently pass.
- `anOrderId` pads to 24 hex chars (`padStart(24, 'f')`) to mimic a MongoDB ObjectId shape; the service likely validates format.
