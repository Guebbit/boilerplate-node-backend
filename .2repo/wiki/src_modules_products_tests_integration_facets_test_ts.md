# src/modules/products/tests/integration/facets.test.ts

## Purpose

Integration tests for `productRepository.facets()`, the query behind the storefront's filter chips. The suite verifies that facet counts, visibility filtering, sort order, and empty-state behavior all match the contract the UI depends on.

## Key elements

- **`setupTestDb()`** — called once at the top to initialize a clean test database before any `describe`/`it` block runs.
- **`createProduct`** (from fixtures) — creates product rows with explicit `categories`, `tags`, `active`, and `deletedAt` fields to control visibility scenarios.
- **`productRepository.facets()`** (the SUT) — returns `{ categories: {name, count}[], tags: {name, count}[] }`.
- **Test: counts across public catalogue** — confirms multi-category and multi-tag products are counted per-facet, not per-product.
- **Test: visibility filtering** — asserts that products with `active: false` or a set `deletedAt` contribute zero to any facet count.
- **Test: sort order** — asserts results are ordered by count descending, then name ascending (the stable order chips render in).
- **Test: empty catalogue** — asserts the method returns `[]` for both arrays rather than throwing.

## Relationships

- **`src/modules/products/index.ts`** — the import source for `productRepository`; the test exercises the public module surface rather than reaching into `repository.ts` directly.
- **`src/modules/products/repository.ts`** — contains the actual SQL/query logic that `facets()` delegates to; this test is its integration-level guard.
- **`src/modules/products/tests/fixtures.ts`** — supplies the `createProduct` helper used to seed rows with controlled visibility flags.
- **`tests/support/setup-test-db.ts`** — provides the `setupTestDb` utility that resets and seeds the database before the suite runs.

## Notes

- The module docstring calls out the *reason* the visibility test exists: a facet chip that renders but matches nothing is a worse UX than no chip at all. This is a regression guard against query drift that a simple listing test would miss.
- The sort-order test uses deliberately colliding names (`b-common` vs `a-rare` vs `c-rare`) to pin down the secondary tiebreaker (alphabetical ascending) when counts are equal.
- `createProduct` defaults to a visible product; tests that need hidden/deleted rows pass `active: false` or `deletedAt` explicitly.
