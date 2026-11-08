---
source: src/modules/products/tests/integration/facets.test.ts
sha256: 6391a9cab7cfa44a89685179034f90b8ba05b769ba2bbad2570496c3aab5ef08
generated_at: 2026-11-08T07:51:19.197513+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/facets.test.ts

## Purpose

Integration tests for `productRepository.facets()`, the query that powers the storefront's filter chips. The suite locks in three invariants: counts reflect only publicly visible products, the result set is stably ordered for UI rendering, and an empty catalogue yields empty lists rather than an error.

## Key elements

- **`describe('facets')`** — single test group containing four cases:
  - *Counts categories and tags* — verifies correct per-facet counts across multiple products.
  - *Does not count what the storefront cannot see* — confirms `active: false` and `deletedAt` products are excluded from facet counts.
  - *Sorts by count descending, then name* — asserts the stable ordering contract the chip UI relies on.
  - *Empty catalogue* — asserts `[]` for both `categories` and `tags` when no products exist.

## Relationships

- **`src/modules/products/repository.ts`** — imports `productRepository` and calls `.facets()`; this is the unit under test.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to seed rows with specific `categories`, `tags`, `active`, and `deletedAt` values.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` and calls it once at module load to prepare the test database.

## Notes

- The file's block comment states the design intent explicitly: a chip that resolves to zero products is worse than no chip, so visibility filtering is a hard requirement, not a convenience.
- Sort order is **count descending → name ascending**; the test `['b-common', 'a-rare', 'c-rare']` (counts 2, 1, 1) encodes both halves of the tiebreak.
- "Hidden" and "soft-deleted" are distinct states (`active: false` vs. `deletedAt` set); both must be invisible to facets.
