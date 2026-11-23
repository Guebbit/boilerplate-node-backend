---
source: src/modules/products/tests/integration/facets.test.ts
source_sha256: 6391a9cab7cfa44a89685179034f90b8ba05b769ba2bbad2570496c3aab5ef08
context_sha256: 0f6167f61d5fc83bb2853235ddd84cd224c7ac8a5f10f3d817310c7ed2496fca
generated_at: 2026-11-22T07:16:21.358396+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/facets.test.ts

## Purpose
Integration tests for `productRepository.facets()`, which supplies the storefront's filter chips (category and tag counts). The key property under test is that counts follow public visibility: a category or tag held only by hidden or soft-deleted products must not appear, since a chip that finds nothing is worse than no chip.

## Key elements
- `setupTestDb()`: called at module level to prepare the test database.
- `describe('facets')` with four cases:
  - **Counting:** categories and tags are counted across public products. Two products yield `pets: 2, food: 1` and `cute: 2, noisy: 1`.
  - **Visibility:** a product with `active: false` and a product with `deletedAt` set contribute nothing. Only the `visible` category is returned, with count 1.
  - **Ordering:** results sort by count descending, then by name. The expected order is `b-common`, `a-rare`, `c-rare`.
  - **Empty catalogue:** returns `{ categories: [], tags: [] }` rather than throwing.
- Each facet entry has the shape `{ name, count }`, and `facets()` returns `{ categories, tags }`.

## Relationships
- `src/modules/products/repository.ts`: provides `productRepository`, the unit under test, imported via a relative path (`../../repository`).
- `src/modules/products/tests/factories.ts`: supplies `createProduct`, which seeds products with `categories`, `tags`, `active` and `deletedAt` options.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`, which sets up the database state the tests run against.

## Notes
- The tests assume each test starts with an empty catalogue (the empty-catalogue case and the exact-equality assertions depend on it). The file doesn't show how `setupTestDb()` provides that isolation.
- The ordering test uses `a-rare` and `c-rare`, which tie on count, so it pins the name tiebreak (ascending, as the expected order shows).
