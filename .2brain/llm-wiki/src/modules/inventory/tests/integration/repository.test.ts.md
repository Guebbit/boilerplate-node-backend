---
source: src/modules/inventory/tests/integration/repository.test.ts
sha256: f13b725a9ca8ac0b3d1c8772a7919fdd1fcc19a0490f9a8e6761a63d1e570678
generated_at: 2026-09-23T18:46:59.432903+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/repository.test.ts

## Purpose

Integration tests for `stockLevelRepository`'s aggregate read methods (`sumReserved`, `stockBoard`, `lowAvailabilityProductIds`) against a real MongoDB instance. Its primary concern is asserting the `.at(0)` fallback path: a `$group`/`$facet` pipeline on an empty collection yields zero rows rather than a zeroed row, so the guard the calling code relies on is verified explicitly. Transition-path methods (`applyDelta`, `ensure`) are intentionally out of scope here — they belong to the service tests.

## Key elements

- **`describe('an empty collection')`** — three tests confirming each aggregate returns a sensible zero/empty value when the collection has no documents, exercising the `.at(0)` arm.
- **`describe('the two stock gauges count different populations')`** — asserts that `lowAvailabilityProductIds` and `sumReserved` both include inactive/hidden products by design (no visibility filter at the repository layer), using `createProduct` to seed visible, all-reserved, and hidden fixtures.
- **`beforeEach(() => stockLevelModel.deleteMany({}))`** — cleans only the stock-level collection between tests in the second block (visibility is applied by `products`, not by a join here).

## Relationships

- **`src/modules/inventory/repository.ts`** — the SUT; `stockLevelRepository` is imported and its three aggregate methods are the sole things under test.
- **`src/modules/inventory/model.ts`** — `stockLevelModel` is used exclusively for `deleteMany` cleanup in `beforeEach`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds fixture products (with `active`, `onHand`, `reserved` fields) so the stock-level aggregates have rows to read.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions and connects a real MongoDB instance for the entire suite.

## Notes

- The file is deliberately narrow: it tests aggregates **only**. `applyDelta` and `ensure` guarantees are asserted in `src/modules/inventory/tests/integration/service.test.ts`.
- The "two gauges" distinction is a documented domain rule (see `docs/modules/inventory-reservations.md` § "The threshold, and its two readers"): `lowAvailabilityProductIds` returns candidates across the whole catalogue (admin restocking needs inactive SKUs), while the service's `lowStockCount` narrows to publicly visible products. This repository applies **no** visibility filter; that half of the behaviour is asserted in the service tests.
- `sumReserved` similarly has no visibility scope — an inactive product still holds reserved units, and the total must reflect that.
- The all-reserved product (`onHand: 40, reserved: 40`) is an explicit candidate in the low-availability test: availability is `onHand − reserved`, not a bare `$lte: onHand` check.
