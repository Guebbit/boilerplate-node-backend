---
source: src/modules/inventory/tests/integration/repository.test.ts
sha256: 11aa98dbbcb886789dfbc523e8937fd5eeccf4552018213c186113521bcb2785
generated_at: 2026-10-14T16:03:38.762269+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/repository.test.ts

## Purpose

Integration tests for `stockLevelRepository`'s aggregate read methods (`sumReserved`, `stockBoard`, `lowAvailabilityProductIds`) against a real MongoDB instance. The file verifies zero-state behavior (empty collection returns sane defaults, not a missing row) and documents the deliberate design choice that these gauges operate over the *entire* catalogue regardless of product visibility. Transition-path logic (`applyDelta`, `ensure`) is intentionally excluded — it is covered by the services-layer tests.

## Key elements

- **`setupTestDb()`** (from `@tests/setup-test-db`) — spins up a real Mongo instance for the suite.
- **`describe('an empty collection')`** — three tests asserting that `sumReserved()` → `0`, `stockBoard()` → `{ items: [], totalItems: 0 }`, and `lowAvailabilityProductIds()` → `[]` when the collection has no documents. This pins the `.at(0)` guard that the calling code relies on, since a `$group`/`$facet` pipeline yields no row at all rather than a zeroed one.
- **`describe('the two stock gauges count different populations')`** — seeds products via `createProduct` and asserts that both `lowAvailabilityProductIds` and `sumReserved` include *inactive* products in their counts. Uses `stockLevelModel.deleteMany({})` in `beforeEach` to isolate the stock-level collection.
- **Availability vs. onHand distinction** — the test explicitly includes a fully-reserved product (`onHand: 40, reserved: 40`) as a low-availability candidate, confirming the gauge measures `onHand - reserved`, not raw `onHand`.

## Relationships

- **`src/modules/inventory/repository.ts`** — the system under test; imports `stockLevelRepository`.
- **`src/modules/inventory/model.ts`** — imports `stockLevelModel` solely for `deleteMany` cleanup in `beforeEach`.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to seed products with specific `active`/`onHand`/`reserved` values.
- **`tests/support/setup-test-db.ts`** — imports and calls `setupTestDb()` to provision the real Mongo connection.

## Notes

- **Visibility is not this repository's concern.** `lowAvailabilityProductIds` and `sumReserved` intentionally do *not* filter by `active`. The public-visibility narrowing is applied downstream by `services/levels.ts` (`lowStockCount`). The "two numbers will not match, and should not" invariant is documented in `docs/modules/inventory-reservations.md` §"The threshold, and its two readers."
- **Transition path is out of scope here.** `applyDelta` and `ensure` are tested in `../../services/transition.ts`'s own test file, where their guarantees are contractually asserted.
- **`beforeEach` clears only the stock-level collection**, not `products`. Both gauges query *from* the stock-level collection; visibility is applied by `products` afterwards, so deleting the stock-level rows is sufficient isolation.
- **The `.at(0)` guard is a load-bearing assumption.** Mongo's `$group`/`$facet` returns an empty array (not a zero-filled row) on an empty collection. These tests pin that behavior so the repository's defensive `.at(0) ?? 0` arm is verified, not merely assumed.
