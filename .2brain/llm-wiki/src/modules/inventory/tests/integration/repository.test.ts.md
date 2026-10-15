---
source: src/modules/inventory/tests/integration/repository.test.ts
sha256: 066732889f930f9fd469d63633aba59d6e7e084352b25f5be64628d580ae2a34
generated_at: 2026-10-15T10:37:05.102700+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/repository.test.ts

## Purpose

Integration tests for `stockLevelRepository`'s **aggregate reads only** (`sumReserved`, `stockBoard`, `lowAvailabilityProductIds`) against a real Mongo instance. The file specifically asserts the empty-collection edge case (a `$group`/`$facet` pipeline returns no row rather than a zeroed one, so the `.at(0)` guard in calling code is exercised) and documents the intentional difference between the two "stock gauge" queries in terms of which product populations they count. Transition-path methods (`applyDelta`, `insertIfAbsent`) are deliberately out of scope here.

## Key elements

- **`describe('an empty collection')`** — Three assertions confirming that `sumReserved()` → `0`, `stockBoard()` → `{ items: [], totalItems: 0 }`, and `lowAvailabilityProductIds(5)` → `[]` when the collection has zero documents.
- **`describe('the two stock gauges count different populations')`** — Seeds a mix of visible/hidden and low/high-availability products via `createProduct`, then asserts:
  - `lowAvailabilityProductIds` returns **all** candidates (active and inactive, including fully-reserved ones) because visibility is a downstream concern of the `products` module, not this repository.
  - `sumReserved` also counts **all** products regardless of visibility, since an inactive product still holds reserved units.
- **`beforeEach(() => stockLevelModel.deleteMany({}))`** — Clears only the stock-level collection between tests; no need to clear `products` because both gauges query *from* the stock level and visibility is applied afterwards.

## Relationships

- **`src/modules/inventory/repository.ts`** — The system under test. The file imports and calls `stockLevelRepository.sumReserved`, `.stockBoard`, and `.lowAvailabilityProductIds`.
- **`src/modules/inventory/model.ts`** — `stockLevelModel` is imported solely for collection cleanup (`deleteMany`) in the second `describe` block's `beforeEach`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` is the seed helper; each call also creates the corresponding stock-level document so the aggregates have data to read.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to provision and connect a real Mongo instance for the entire file.

## Notes

- **Visibility is intentionally absent here.** `lowAvailabilityProductIds` does not filter by `products.active` / public visibility. That filtering lives in `services/levels.ts` (`lowStockCount`) and is asserted in `../../tests/integration/service.test.ts`. A reader might expect the filter here; it is not.
- **Availability ≠ `onHand`.** The gauge keys off `available = onHand − reserved`. A product with `onHand: 40, reserved: 40` is a low-availability candidate even though `onHand` alone would look healthy. The test asserts this explicitly.
- **Cross-reference:** The behavioral contract is documented in `docs/modules/inventory-reservations.md`, §"The threshold, and its two readers."
- **Scope boundary:** `applyDelta` and `insertIfAbsent` are tested in the transition service's own integration tests, not here. Do not add those cases to this file.
