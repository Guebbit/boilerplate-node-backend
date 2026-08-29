# src/modules/products/tests/integration/facets.test.ts

## Purpose

Integration tests for `productRepository.facets`, the query behind the storefront's filter chips. The file verifies three invariants that unit-level or listing tests would miss: counts respect public visibility (inactive and soft-deleted products are excluded), results are deterministically ordered, and an empty catalogue returns empty arrays rather than an error.

## Key elements

- **`setupTestDb()`** — called once at module scope; provisions an isolated database before the suite runs.
- **`createProduct`** (from the test factory) — inserts a product with optional `categories`, `tags`, `active`, and `deletedAt` fields to shape catalogue state per test.
- **`productRepository.facets()`** — the method under test; returns `{ categories: {name, count}[], tags: {name, count}[] }`.
- **Four `it` blocks** covering: aggregate counts, visibility filtering, sort order (count desc → name asc), and the empty-catalogue case.

## Relationships

- **`src/modules/products/index.ts`** — re-exports `productRepository`, which is the system under test.
- **`src/modules/products/repository.ts`** — implementation of `facets()` that these tests exercise end-to-end (SQL, joins, visibility predicates).
- **`src/modules/products/tests/factory.ts`** — provides `createProduct`, the helper that writes fixtures with controllable visibility fields.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which configures the test database connection and isolation.

## Notes

- The docblock encodes the domain rule explicitly: a facet chip that would match zero visible products must not appear at all. The second test (`does not count what the storefront cannot see`) exists specifically to guard against this drift that a green product listing would not surface.
- `setupTestDb()` runs at module level, not inside each test. Per-test isolation is expected to come from the factory or a transaction/rollback mechanism in the setup helper.
- The sort test uses names prefixed with single letters (`a-`, `b-`, `c-`) to distinguish the count-descending tiebreaker from a plain alphabetical sort.
