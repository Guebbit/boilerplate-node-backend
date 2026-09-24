---
source: src/modules/products/tests/integration/facets.test.ts
sha256: 6391a9cab7cfa44a89685179034f90b8ba05b769ba2bbad2570496c3aab5ef08
generated_at: 2026-09-23T19:29:24.848005+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/facets.test.ts

## Purpose

Integration tests for `productRepository.facets`, the storefront's filter-chip data. The tests pin the contract that facet counts reflect **only public, active, non-deleted products**, that results are deterministically sorted, and that an empty catalogue yields empty arrays rather than an error. They exist to catch visibility-drift that a passing listing query would not surface (a chip pointing at zero results).

## Key elements

- **`describe('facets')`** — four focused cases:
    - _Counts categories and tags across the public catalogue_ — verifies multi-product aggregation for both `categories` and `tags`.
    - _Does not count what the storefront cannot see_ — asserts `active: false` and `deletedAt`-set products contribute no counts.
    - _Sorts by count descending, then name_ — confirms the stable ordering contract chips rely on.
    - _Empty catalogue returns empty lists_ — guards against a thrown error on zero rows.
- **`setupTestDb()`** — called once at module scope (outside `describe`) to provision/tear down the test database.
- **`createProduct`** — factory helper used to seed rows with controlled `categories`, `tags`, `active`, and `deletedAt` values.

## Relationships

- **`src/modules/products/repository.ts`** — the system under test; the file calls `productRepository.facets()` and asserts on its return shape.
- **`src/modules/products/tests/factories.ts`** — supplies `createProduct` for deterministic data setup in every case.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, the shared DB lifecycle hook invoked at import time.

## Notes

- The sort-order test (`b-common` > `a-rare` > `c-rare`) encodes **count DESC, then name ASC** as the tiebreaker. If the implementation changes sort, this test is the first to fail.
- `setupTestDb()` is called at **module top level**, not inside a `beforeEach` or `beforeAll`. It is expected to be idempotent across test suites in the same run.
- The module doc comment frames the visibility rule as a business invariant ("a chip that finds nothing is worse than no chip"), not merely a query filter — treat the `active: false` / `deletedAt` exclusion as intentional, not incidental.
