---
source: src/modules/inventory/tests/integration/preorder.test.ts
sha256: d247a14a18f6d3d6a7f38be22c1b41e5b943ccaae396ed37679578583cd1cdfe
generated_at: 2026-10-14T16:03:18.424271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/preorder.test.ts

## Purpose

Integration test for the preorder-allowance lifecycle driven entirely through the public service API. It verifies that preorders claim a dedicated `preorderLimit` counter (never the shelf), that payment stamps a queue key, that a receipt allocates oldest *payment* first in its own transaction, and that release/expiry returns the allowance. The file exists so regressions in any of those invariants are caught before they reach production inventory logic.

## Key elements

- **`anOrderId()`** – generates a distinct, hex-padded 24-char string per call to simulate real order IDs (holds are keyed by one).
- **`levelOf(productId)`** – returns the three counters (`onHand`, `reserved`, `preordered`) plus `preorderLimit` for assertion.
- **`preorderProduct(limit)`** – creates a zero-stock product and sets its `preorderLimit`, the canonical fixture shape.
- **`claim(productId, quantity)`** – shorthand for a preorder line object passed to service calls.
- **`announced()`** – queries `outboxEventModel` for `PREORDER_ALLOCATED` events to assert allocation announcements in order.
- **`describe('reserving a preorder')`** – tests that a claim increments only `preordered`, refuses over-limit requests with a shortfall report, rejects products with no allowance, keeps on-hand stock separate from allowance, writes a `StockMovementReason.preorder` ledger row, and rolls back when a sibling line fails.
- **`describe('giving a preorder claim back')`** – tests `releaseForOrder`, TTL-expiry sweep (`runReservationSweep`), `releaseCommittedForOrder`, and partial `releaseLinesForOrder` (within `withTransaction`).
- **`describe('paying for a preorder')`** – tests that `commitForOrder` stamps `committedAt` and that commit-after-receipt allocates immediately.
- **`describe('a receipt serving the queue')`** – tests oldest-payment-first ordering, partial delivery splitting, no sellable gap between commit and allocate, surplus becoming available after full service, unpaid holds being skipped, and a plain receipt with no waiters.

## Relationships

- **`src/modules/inventory/services/index.ts`** – every assertion targets functions re-exported here (`reserveForOrder`, `commitForOrder`, `releaseForOrder`, `releaseCommittedForOrder`, `releaseLinesForOrder`, `runReservationSweep`, `setPreorderLimit`, `receive`, `shipLinesForOrder`, etc.).
- **`src/modules/inventory/repository.ts`** – `reservationRepository`, `stockLevelRepository`, and `stockMovementRepository` are used directly to assert post-condition state and ledger rows.
- **`src/modules/inventory/events.ts`** – imports `PREORDER_ALLOCATED` to identify the outbox event name.
- **`src/kernel/outbox.ts`** – imports `outboxEventModel` (Mongoose model) to read persisted events for assertions.
- **`src/infrastructure/runtime/database.ts`** – imports `withTransaction` to wrap `releaseLinesForOrder` in a session, matching the service's own transactional contract.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the fixture products.
- **`src/types/index.ts`** – imports `StockMovementReason` enum for ledger assertions.
- **`tests/support/environment.ts`** – `withEnvironment` overrides `NODE_RESERVATION_TTL_MINUTES` to force immediate expiry in the sweep test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module scope to provision the test database before any suite runs.

## Notes

- `setupTestDb()` is invoked at module top-level (not in a `beforeAll`/`beforeEach`), so it runs exactly once for the entire file.
- `anOrderId()` produces IDs that are *not* MongoDB ObjectIds; they are 24-char hex strings padded with `c`. Do not assume `bson.ObjectId` validity when comparing.
- The `announced()` helper sorts by `_id` (insertion order), which is how "oldest payment first" is verified without relying on timestamps.
- The receipt-queue test for "oldest payment first" deliberately commits the *second* order before the *first*, then asserts the second is served first—this is the key invariant that distinguishes payment order from reservation order.
- `withTransaction` is used only in the partial-release test; all other service calls rely on the service's internal transaction management.
- The test file imports `shipLinesForOrder` and `availableFor` / `listPreorders` / `lowStockCount` but the visible (truncated) content does not show them exercised—check the remainder of the file for additional suites.
