---
source: src/modules/orders/tests/integration/repository.test.ts
sha256: 851f0b6355ee4f3b367708c0e46f020cb754afac289dbf147798d6f2a275974c
generated_at: 2026-09-27T15:18:48.479960+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/repository.test.ts

## Purpose

Integration test suite for `orderRepository` that runs against a real (test) MongoDB instance. It pins three contracts: that `create` persists the full product snapshot, that `aggregate` is a raw pipeline passthrough (no reshaping of Mongo stages), and that `findByIdScoped` always returns a hydrated Mongoose document regardless of whether a scope is supplied.

## Key elements

- **`describe('create')`** — four tests covering insertion, quantity storage, embedded product snapshot (title + price), and multi-line orders. Uses `createOrder` / `toOrderItem` from the orders factory.
- **`describe('aggregate')`** — five tests exercising the raw pipeline passthrough: match-all, `$match` filter, `$count`, `$addFields` (computed `totalQuantity`/`totalPrice`), and the `$sort` + `$skip` + `$limit` pagination pattern. Each test builds its own pipeline inline.
- **`describe('findByIdScoped')`** — two tests: one asserts both scoped and unscoped calls return a hydrated document (checks `_id` and `.toJSON`), the other asserts a non-matching `ownerScope` yields `undefined`.
- **`setupTestDb()`** — called once before all tests; resets/creates the test database.

## Relationships

- **`src/modules/orders/repository.ts`** — the system under test; `orderRepository.create`, `.aggregate`, `.findByIdScoped`, and `.ownerScope` are all exercised here.
- **`src/infrastructure/persistence/search.ts`** — exports `DEFAULT_SORT`, imported and used as the `$sort` stage in the pagination test to pin the tiebreaker convention.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder`, `makeOrder`, and `toOrderItem` used throughout.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct` for seeding products referenced by order lines.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` for seeding the owning user.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` for database lifecycle.

## Notes

- The aggregate tests deliberately pass raw pipeline arrays to the repository to pin its passthrough contract; adding transformation logic in the repo would break these tests.
- An empty array (`[]`) is never passed to `aggregate` — Mongoose throws `Aggregate has empty pipeline`; the minimum viable "match all" is `[{ $match: {} }]`.
- The `findByIdScoped` block exists because neither TypeScript types nor a response-body assertion (both shapes serialize the same `id`) can catch a regression to a wire-shaped row; the test explicitly checks for `_id` and the `.toJSON` method to confirm a real Mongoose document.
- The pagination test's comment ties `DEFAULT_SORT` to the requirement that the sort preceding `$skip` be total (i.e. include a tiebreaker) for pages to be well-defined.
