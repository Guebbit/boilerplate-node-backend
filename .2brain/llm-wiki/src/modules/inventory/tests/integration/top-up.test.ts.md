---
source: src/modules/inventory/tests/integration/top-up.test.ts
sha256: 1205e78f023d38a3a26a07119da2e16c332609a2c7a6d37155d52ce3facb34bd
generated_at: 2026-10-29T04:08:41.714852+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/top-up.test.ts

## Purpose

Integration tests for the top-up flow (`reserveMoreForOrder` / `releaseTopUpForOrder`), which handles reserving additional stock for an order whose parcel was lost. Verifies that only free shelf units are reserved (never another order's hold), that overage claims land in `backordered` even when the backorder cap is closed, that a `shipped` hold reopens as `committed` while retaining its original queue position, and that releasing a top-up ends the hold as `shipped` rather than `released`.

## Key elements

- **`anOrderId()`** — generates a unique 24-char hex-like order ID (module-level counter).
- **`productWith(shelf)`** — creates a product with the given `onHand` and default (0) backorder cap; returns the product ID.
- **`shippedOrder(productId, quantity)`** — preconditions helper: reserves, commits, and ships a given quantity so the hold is in `shipped` status.
- **`topUp(orderId, productId, quantity)`** — wraps `inventoryService.reserveMoreForOrder` in a transaction, mirroring production call sites.
- **`levelOf` / `holdOf` / `itemsOf` / `statusOf`** — read-only assertion helpers over `stockLevelRepository` and `reservationRepository`.
- **`describe('reserveMoreForOrder')`** — 6 cases covering: full shelf coverage, shipped→committed reopen, partial shelf + backorder split, other-order isolation, growing an open hold, and missing stock level.
- **`describe('releaseTopUpForOrder')`** — 1 case: releasing both `stock` and `backorder` items zeroes counters and leaves the hold `shipped`.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to provision an in-memory/ephemeral database for the whole suite.
- **`tests/support/callers.ts`** — `testCallerContext` is passed to `inventoryService.receive` to satisfy the caller-identity requirement.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps every transactional service call (`shipLinesForOrder`, `reserveMoreForOrder`, `releaseTopUpForOrder`).
- **`src/modules/inventory/services/index.ts`** — exports `inventoryService`, the SUT.
- **`src/modules/inventory/repository.ts`** — `reservationRepository` and `stockLevelRepository` are used exclusively for post-action state assertions.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the product fixture.
- **`src/modules/inventory/tests/factories.ts`** — `removeLevel` deletes a stock level to test the "no stock level" edge case.

## Notes

- Tests run against a real database (via `setupTestDb`), not mocks; ordering of side effects matters.
- `orderCounter` is mutable module-level state shared across all tests in the file; IDs are unique only within a single test-file run.
- The backorder cap is intentionally left at its default (`0`) so that any overage exercises the "closed cap" path; there is no test that opens the cap.
- `shippedOrder` ships the *entire* reserved quantity; partial-shipping is set up manually in the "grows an open hold" test.
