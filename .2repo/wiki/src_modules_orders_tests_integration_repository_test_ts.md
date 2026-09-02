# src/modules/orders/tests/integration/repository.test.ts

## Purpose

Integration test suite for `orderRepository`. It verifies three contract areas against a real (test) database: `create` (insert + return a Mongoose document), `aggregate` (raw pipeline passthrough — the repository must *not* reshape Mongo stages), and `findByIdScoped` (two structurally different resolution branches: unscoped/admin hydrated doc vs. scoped/owner transformed aggregate row). The aggregate cases pin the passthrough guarantee so that `$match`/`$count`/`$addFields`/pagination remain a deliberate, tested design rather than an implicit assumption.

## Key elements

- **`describe('create')`** — Four tests confirming: a Mongoose document is returned with `_id`, `email`, `userId`; per-line `quantity` is stored; the full product snapshot (`title`, `price`) is embedded (not referenced by ObjectId); multiple line-items are supported.
- **`describe('aggregate')`** — Five tests exercising the raw pipeline passthrough: match-all (`$match: {}`), `$match` filtering, `$count`, `$addFields` with `$sum`/`$map`/`$multiply`, and the `$sort` → `$skip` → `$limit` pagination pattern using `DEFAULT_SORT`.
- **`describe('findByIdScoped')`** — Three tests covering: `id` is present and correct on *both* branches (unscoped and scoped); the scoped branch has `_id` removed (so `id` is the only reliable identifier); and a scope that doesn't cover the order returns `undefined` (authorization is preserved).

## Relationships

- **`src/modules/orders/repository.ts`** — The unit under test; `orderRepository` is imported via the module's barrel.
- **`src/modules/orders/index.ts`** — Barrel re-export from which `orderRepository` is imported.
- **`src/modules/orders/tests/fixtures.ts`** — Provides `createOrder`, `makeOrder`, `toOrderItem` helpers used in every test case.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` factory for seeding the owner/stranger users.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct` factory for seeding products with configurable `title`/`price`.
- **`src/modules/products/index.ts`** — Source of the `ProductDocument` type used for the snapshot assertion cast.
- **`src/infrastructure/persistence/search.ts`** — Supplies `DEFAULT_SORT`, the canonical sort (including tiebreaker) the pagination test must use.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory/test database before the suite runs.
- **`tests/support/stub.ts`** — `asStub<T>()` is used in `findByIdScoped` assertions to read fields whose presence is branch-dependent, without TypeScript narrowing.

## Notes

- An **empty** aggregate pipeline (`[]`) throws `MongooseError: Aggregate has empty pipeline`; the match-all test therefore passes `[{ $match: {} }]` instead.
- The `findByIdScoped` scoped branch returns an **already-transformed aggregate row**, not a hydrated Mongoose document. It drops `_id` and exposes only `id`; the unscoped branch is a full document. `id` is the only field both branches guarantee.
- The `id` assertion deliberately uses `String(...).toBe(expected)` rather than `toBeDefined()`, because a value that stringifies to the literal `"undefined"` would pass the looser check.
- `DEFAULT_SORT` includes a **tiebreaker** stage; a page is only well-defined when the sort preceding `$skip` is a total order.
- Product is stored as an **embedded snapshot** (title, price) in each order line — not an ObjectId reference. Tests assert the embedded fields directly.
- The authorization test creates two users with **distinct emails** (not the factory default) because `users.email` has a unique index.
