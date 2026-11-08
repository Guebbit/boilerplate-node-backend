---
source: src/modules/inventory/tests/integration/backorder-arrivals.test.ts
sha256: ff7d44e1945a059a20fa5354c18cebea13121b03d969bb66d2a5efdbc9a55302
generated_at: 2026-11-08T06:04:59.574510+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/backorder-arrivals.test.ts

## Purpose

Integration tests that verify the "serve the paid backorder buyer first" invariant: whenever any write operation makes a unit sellable (stocktake, return restock, hold expiry, order cancellation, partial shipment release), the unit is allocated to the committed backorder reservation rather than becoming freely available.

## Key elements

- **`soldOutWithAPaidBuyerWaiting(shelf)`** — Setup helper. Creates a product with `shelf` units all reserved by a "holder" order, sets a backorder limit of 5, then creates and commits a second order with one `backorder`-kind reservation. Returns `{ productId, holder, waiting }`.
- **`anOrderId()`** — Generates a unique 24-char hex string per call; used as the order key for holds.
- **`levelOf(productId)`** — Reads `onHand`, `reserved`, `available`, `backordered` from `stockLevelRepository` for assertions.
- **`itemsOf(orderId)`** — Reads the reservation's items (quantity + kind) from `reservationRepository` for assertions.
- **7 test cases** inside `describe('a unit that becomes sellable')`:
  - Stocktake adjustment (`inventoryService.adjust`)
  - Return restock (`restockReturnedLines` inside a transaction)
  - Unpaid hold expiry via `runReservationSweep` (expiration set directly via `reservationModel.updateOne`)
  - Unpaid order cancel (`releaseForOrder`)
  - Paid order cancel (`releaseCommittedForOrder` inside a transaction)
  - Partial shipment cancel (`releaseLinesForOrder` inside a transaction)
  - Negative case: releasing a `backorder`-kind line only frees allowance, not a shelf unit

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to initialize the in-memory test database before any test runs.
- **`src/modules/products/tests/factories.ts`** — `createProduct` provides a product fixture with a controllable `onHand` count.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps service calls that are explicitly transactional (restock, paid cancel, partial release).
- **`src/modules/inventory/services/index.ts`** — `inventoryService` is the SUT; nearly every assertion path goes through its methods (`reserveForOrder`, `commitForOrder`, `adjust`, `restockReturnedLines`, `runReservationSweep`, `releaseForOrder`, `releaseCommittedForOrder`, `releaseLinesForOrder`).
- **`src/modules/inventory/model.ts`** — `reservationModel.updateOne` is used to force-expire the holder's reservation (bypassing time-based expiry) so the sweep test is deterministic.
- **`src/modules/inventory/repository.ts`** — `reservationRepository` and `stockLevelRepository` are used exclusively in assertion helpers (`itemsOf`, `levelOf`).
- **`tests/support/callers.ts`** — `testCallerContext` supplies the required caller identity for `inventoryService.adjust`.

## Notes

- The file is annotated with `@module` JSDoc; it intentionally has **no named exports** — it is a side-effect-only test module.
- Transactional service calls (`restockReturnedLines`, `releaseCommittedForOrder`, `releaseLinesForOrder`) require an explicit `session` argument, hence the `withTransaction` wrapper. Non-transactional calls (`adjust`, `releaseForOrder`, `runReservationSweep`) do not.
- The negative test ("does not take a unit from a buyer whose claim was only given back") confirms that releasing a `backorder`-kind reservation line does **not** trigger the serve-first logic — it only frees backorder allowance. This is a deliberate distinction from the positive cases above it.
- `reservationModel` is imported solely for the direct `updateOne` that sets `expiresAt` to epoch-zero; all other state changes go through the service.
