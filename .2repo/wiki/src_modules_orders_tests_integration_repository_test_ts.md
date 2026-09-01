# src/modules/orders/tests/integration/repository.test.ts

## Purpose

Integration tests for `orderRepository` that verify three contracts against a real MongoDB instance: (1) `create` persists correct order data with embedded product snapshots, (2) `aggregate` is a faithful passthrough that does not reshape Mongo pipeline stages, and (3) `findByIdScoped` returns a usable `id` on both its unscoped and scoped branches while enforcing authorization.

## Key elements

- **`describe('create')`** — four tests confirming that `orderRepository.create` stores the correct `_id`, `email`, `userId`, per-line `quantity`, the full embedded product snapshot (title, price), and multiple line items in a single order.
- **`describe('aggregate')`** — five tests pinning the raw-passthrough contract: empty `$match`, filtered `$match`, `$count`, `$addFields` (computed totals), and the `$sort`/`$skip`/`$limit` pagination pattern using `DEFAULT_SORT` as the tiebreaker sort.
- **`describe('findByIdScoped')`** — three tests covering the two structural branches: both branches expose a correct `id`; the scoped branch has `_id` deleted (so `id` is the reliable field); and a scope that does not cover the order returns `undefined`.
- **`asStub`** (from `tests/support/stub`) — used to safely access optional/unknown-typed fields on results that differ in shape between branches, avoiding TypeScript errors while still asserting runtime values.

## Relationships

- **`src/modules/orders/repository.ts`** — the system under test; provides `orderRepository.create`, `.aggregate`, `.findByIdScoped`, and `.visibleScope`.
- **`src/modules/orders/index.ts`** — re-exports `orderRepository` so tests import via the module barrel rather than the file path.
- **`src/modules/orders/tests/fixtures.ts`** — supplies `createOrder`, `makeOrder`, and `toOrderItem` for building valid order documents.
- **`src/modules/users/tests/fixtures.ts`** — supplies `createUser` (supports explicit `email` to avoid unique-index collisions).
- **`src/modules/products/tests/fixtures.ts`** — supplies `createProduct` with optional field overrides (title, price).
- **`src/modules/products/index.ts`** — source of the `ProductDocument` type used to cast embedded snapshots.
- **`src/infrastructure/persistence/search.ts`** — exports `DEFAULT_SORT`, the canonical sort (including tiebreaker) the pagination test depends on.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises and tears down the in-memory MongoDB instance before the suite runs.

## Notes

- The aggregate tests are intentionally written against raw pipeline objects (`$match`, `$count`, `$addFields`, `$sort`/`$skip`/`$limit`) to **pin** that the repository does not inject or reorder stages. Adding or removing a stage in the repository implementation will break these tests.
- An empty array is not a valid Mongoose aggregate pipeline (throws `MongooseError`), so the "match all" test uses `[{ $match: {} }]`.
- `findByIdScoped` returns **structurally different** shapes per branch: the unscoped path yields a hydrated Mongoose document (has `_id`, `id`); the scoped path yields an aggregate row where the serializer deletes `_id` after writing `id`. Reading `_id` on the scoped result silently yields `undefined` — the tests assert this explicitly.
- The `id` assertion uses `String(value) === expected` rather than `toBeDefined()`, guarding against the value being the literal string `"undefined"`.
- The authorization test creates two users with **explicitly distinct emails** because the `users.email` field is unique; relying on the fixture default would cause a duplicate-key error.
