---
source: src/modules/inventory/tests/integration/repository.test.ts
sha256: 066732889f930f9fd469d63633aba59d6e7e084352b25f5be64628d580ae2a34
generated_at: 2026-11-08T06:07:28.501434+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/repository.test.ts

## Purpose

Integration tests for `stockLevelRepository`'s **aggregate reads** (`sumReserved`, `stockBoard`, `lowAvailabilityProductIds`) against a real MongoDB instance. The file exists to pin down two things that unit tests cannot: (1) what a `$group`/`$facet` pipeline returns over an empty collection (no row, not a zeroed row — so the `.at(0)` guard in calling code is asserted, not assumed), and (2) that the two stock gauges intentionally count different populations (all products vs. publicly-visible-only). Transition logic (`applyDelta`, `insertIfAbsent`) is deliberately out of scope here.

## Key elements

- **`describe('an empty collection')`** — three tests asserting the repository returns safe defaults (`0`, `{ items: [], totalItems: 0 }`, `[]`) when the stock-level collection has no documents.
- **`describe('the two stock gauges count different populations')`** — seeds products with varying `active`/`onHand`/`reserved` values, then asserts that `lowAvailabilityProductIds` returns *every* candidate (visible and hidden) and `sumReserved` counts *all* reserved units regardless of visibility.
- **`beforeEach(() => stockLevelModel.deleteMany({}))`** — clears only the inventory collection; visibility filtering is applied by the `products` module downstream, not by a join in this repository.

## Relationships

- **`src/modules/inventory/repository.ts`** — the system under test; every assertion targets `stockLevelRepository` methods.
- **`src/modules/inventory/model.ts`** — `stockLevelModel` is imported solely for the `deleteMany({})` cleanup in `beforeEach`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` is the only way test data is seeded; it writes into the `products` collection, and the repository's pipeline reads *from* `stockLevel` (the aggregate's source), not via a join on `products`.
- **`tests/support/setup-test-db.ts`** — called once at module top level to spin up a real MongoDB instance before any test runs.

## Notes

- **No transition coverage.** `applyDelta` / `insertIfAbsent` are exercised in `../../services/transition.ts`'s own tests; this file is aggregates only.
- **Visibility is not this repository's job.** The docblock and inline comment make explicit that `lowAvailabilityProductIds` returns *all* low-availability candidates and that `products`/`services/levels.ts` narrows to publicly visible ones. The visibility half of that behaviour is asserted in `../../tests/integration/service.test.ts`, not here.
- **All-reserved ≠ healthy.** The comment near `alsoVisible` warns that a bare `$lte: onHand` check would miss a fully-reserved product; the test asserts the repository treats *availability* (onHand − reserved), not raw `onHand`, as the threshold input.
- **Cross-reference.** The threshold semantics and the "two readers" rationale are documented in `docs/modules/inventory-reservations.md` §"The threshold, and its two readers".
