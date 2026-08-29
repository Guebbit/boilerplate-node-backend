# src/modules/orders/tests/integration/repository.test.ts

## Purpose

Integration tests for `orderRepository` covering the three public methods — `create`, `aggregate`, and `findByIdScoped` — against a real (in-memory) MongoDB instance. The suite pins runtime contract details that TypeScript cannot express, most notably the split shape between the unscoped (hydrated Mongoose doc) and scoped (aggregate row) return paths of `findByIdScoped`.

## Key elements

- **`setupTestDb()`** — called once at module scope; provisions a per-suite in-memory Mongo and connects Mongoose to it.
- **`describe('create')`** — four tests asserting insertion semantics: `_id`/`email`/`userId` population, per-line quantity, embedded product snapshot (title + price, not an ObjectId ref), and multi-line orders.
- **`describe('aggregate')`** — five tests exercising raw pipeline passthrough: match-all, `$match` filter, `$count`, `$addFields` (totalQuantity / totalPrice), and the `$sort → $skip → $limit` pagination pattern using `DEFAULT_SORT`.
- **`describe('findByIdScoped')`** — three tests locking down the polymorphic contract:
  - `id` is present and correct on **both** branches (uses `String(...)` assertion to catch the literal-string `"undefined"` failure mode).
  - `_id` is **absent** on the scoped (aggregate) branch.
  - A scope that does not cover the order's `userId` returns `undefined` (authorization guard).
- **`asStub<T>()`** — a type-only cast from `tests/support/stub` used to reach into runtime properties (`id`, `_id`) without fighting the `OrderDocument` type that extends `Document` and therefore type-checks `_id` on both branches.
- **`toOrderItem(product, qty)`** — factory helper that converts a `ProductDocument` into the embedded `{ product, quantity }` shape expected by the order schema.
- **`makeOrder(user, items)`** — builds a plain order object (no DB write) for tests that call `orderRepository.create` directly.

## Relationships

- **`src/modules/orders/index.ts`** → imports the SUT (`orderRepository`) and re-exports `visibleScope`.
- **`src/modules/orders/repository.ts`** → the implementation under test (reached via the index barrel).
- **`src/modules/orders/tests/factory.ts`** → provides `createOrder`, `makeOrder`, `toOrderItem` used throughout.
- **`src/modules/products/index.ts`** → source of the `ProductDocument` type import.
- **`src/modules/products/tests/factory.ts`** → `createProduct` fixture.
- **`src/modules/users/tests/factory.ts`** → `createUser` fixture.
- **`src/infrastructure/persistence/search.ts`** → `DEFAULT_SORT` constant used in the pagination test to verify the tiebreaker is applied.
- **`tests/support/setup-test-db.ts`** → `setupTestDb()` lifecycle hook.
- **`tests/support/stub.ts`** → `asStub<T>()` for safe property access in assertions.

## Notes

- **`id` vs `_id` contract is the critical invariant.** The unscoped path returns a hydrated Mongoose doc (has `_id`, has `id`). The scoped path returns an aggregate row after `applyOrderTransform` (has `id`, `_id` deleted). Reading `_id` on the scoped branch silently yields `undefined` — there is no compile-time or serialization-time signal. The tests use `String(value)` comparison specifically so a value of `undefined` (which `toBeDefined()` would miss) is caught.
- **Aggregate pipeline must be non-empty.** MongoDB/Mongoose throw on `[]`; the "match-all" test uses `[{ $match: {} }]` instead.
- **Products are stored as snapshots** (embedded document), not as ObjectId references. The test asserts `title` and `price` are present inline.
- **`DEFAULT_SORT` is a required tiebreaker** for correct `$skip`/`$limit` pagination; the test asserts it is applied, not that its exact value is a specific field.
- **`asStub` is a type-level assertion helper, not a runtime proxy.** It exists solely to satisfy the compiler when reaching into a union/polymorphic return type.
