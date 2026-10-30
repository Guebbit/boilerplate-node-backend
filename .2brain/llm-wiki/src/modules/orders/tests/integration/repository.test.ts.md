---
source: src/modules/orders/tests/integration/repository.test.ts
sha256: 0ea95a911167387164b2c4a9c156b702a51ac052f81a7f1faa5b0fd3de8835df
generated_at: 2026-10-29T04:56:00.177289+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/repository.test.ts

## Purpose

Integration tests for `orderRepository` that run against a real (test) database. They pin three contracts: `create` persists the correct embedded shape, `aggregate` is a raw passthrough that does not reshape the caller's pipeline stages, and `findByIdScoped` always returns the same hydrated Mongoose document regardless of whether a scope is applied.

## Key elements

- **`describe('create')`** — Verifies insertion via the `createOrder` fixture builder: `_id` present, email/userId linkage, item quantities, embedded product snapshot (title + price), and multi-item orders.
- **`describe('aggregate')`** — Feeds raw MongoDB pipelines into `orderRepository.aggregate` and asserts pass-through behavior: match-all, `$match` filtering, `$count`, `$addFields` (including a Decimal128 total read via `toMinorUnits`), and the `$sort`/`$skip`/`$limit` pagination pattern using `DEFAULT_SORT`.
- **`describe('findByIdScoped')`** — Confirms that scoped and unscoped lookups both return a hydrated Mongoose document (checks `_id` and `toJSON`), and that a non-matching owner scope yields `undefined`.
- **Module-level `setupTestDb()`** — Boots the test database once before any test runs.

## Relationships

- **`src/modules/orders/repository.ts`** — System under test. Exercises `orderRepository.create`, `.aggregate`, `.findByIdScoped`, and the static helper `.ownerScope`.
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder`, `makeOrder`, and `toOrderItem` to build valid order documents for the test database.
- **`src/modules/users/tests/factories.ts`** — `createUser` supplies user fixtures (including distinct emails for scope-rejection tests).
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies product fixtures with configurable title/price.
- **`src/domain-primitives/money.ts`** — `toMinorUnits` converts the Decimal128 total returned by an `$addFields`/`$sum` pipeline into an integer minor-unit value for assertion.
- **`src/infrastructure/persistence/search.ts`** — `DEFAULT_SORT` is the sort stage the pagination test uses to guarantee a total ordering before `$skip`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the shared test database instance.

## Notes

- The `aggregate` suite is intentionally a **passthrough contract test**: it asserts the repository neither adds, removes, nor reorders stages. If a future refactor wraps `aggregate`, these tests will fail by design.
- `findByIdScoped` tests check for `_id` and `toJSON` specifically because TypeScript's erased types and a plain JSON-body assertion both miss the distinction between a hydrated Mongoose document and a wire-shaped plain object.
- The pagination test calls `orderRepository.create` directly (not via the fixture builder) to ensure the repository's own write path is exercised for the skip/limit arithmetic.
- Money values coming out of aggregation (`$sum` over stored prices) are **Decimal128**, not numbers; always convert with `toMinorUnits` before asserting.
