---
source: src/modules/orders/tests/integration/repository.test.ts
sha256: 36f516b74968bd29b7d1a8b80ac2e15485933217d707691fd3ff14fafb7ddeb2
generated_at: 2026-09-23T19:11:27.918288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/repository.test.ts

## Purpose

Integration test suite for `orderRepository` that runs against a real (test) database. It verifies three contract areas: `create` (fixture-driven insert), `aggregate` (the repository is a raw passthrough that does **not** reshape MongoDB pipeline stages), and `findByIdScoped` (two structurally different branches — unscoped/hydrated doc vs scoped/aggregate row). The aggregate and scoped-branch tests exist to pin design decisions that TypeScript and response-body assertions alone cannot catch.

## Key elements

- **`describe('create')`** — 4 tests asserting the Mongoose document is returned with correct `userId`, per-line `quantity`, an embedded (not referenced) product snapshot, and multi-item orders.
- **`describe('aggregate')`** — 5 tests exercising `$match` (empty & filtered), `$count`, `$addFields` (computed `totalQuantity`/`totalPrice`), and the `$sort` + `$skip` + `$limit` pagination pattern. Each test builds a real pipeline and asserts the repository returns it unmodified.
- **`describe('findByIdScoped')`** — 3 tests covering: `id` is present on **both** branches (using `asStub` to bypass type erasure), `_id` is deliberately absent on the scoped branch, and a non-owner scope returns `undefined` (authorization still enforced).
- **`setupTestDb()`** — called once at module scope; provisions the test database before any test runs.

## Relationships

- **`src/modules/orders/repository.ts`** — the system under test; `orderRepository` is imported and its `create`, `aggregate`, `findByIdScoped`, and `ownerScope` methods are exercised.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder`, `makeOrder`, and `toOrderItem` fixture builders used to seed realistic order data.
- **`src/modules/users/tests/factories.ts`** — `createUser` generates the owning/stranger users for scoped-branch tests.
- **`src/modules/products/tests/factories.ts`** — `createProduct` generates products whose snapshot (title, price) is embedded in order items.
- **`src/modules/products/model.ts`** — defines the product shape that the snapshot assertions (`snapshot.title`, `snapshot.price`) validate against.
- **`src/infrastructure/persistence/search.ts`** — exports `DEFAULT_SORT`, imported into the pagination test to ensure the sort tiebreaker precedes `$skip`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initializes the in-test MongoDB instance.
- **`tests/support/stub.ts`** — `asStub` is used to access runtime properties (`id`, `_id`) that are absent from the static type but present (or absent) on the actual object.

## Notes

- **Aggregate is a passthrough by design.** The tests intentionally build full Mongo pipelines and assert results, locking in that the repository never reorders, injects, or strips stages. Any future "convenience" wrapper inside `aggregate` will break these tests.
- **`findByIdScoped` branches return different shapes.** Unscoped → hydrated Mongoose doc (has `_id` and `id`). Scoped → aggregate row where the serializer writes `id` and then _deletes_ `_id`. Reading `_id` on the scoped branch is a silent `undefined`, which is why the tests assert its absence explicitly.
- **`asStub` is a deliberate escape hatch.** It exists because the two branches have incompatible types; a plain property access would fail at compile time. The tests use it to assert on the runtime value without weakening the module-level type contract.
- **MongoDB requires ≥ 1 aggregate stage.** The "match all" test uses `[{ $match: {} }]` rather than `[]`; an empty array throws `MongooseError: Aggregate has empty pipeline`.
- **Pagination requires a total sort before `$skip`.** The test hard-codes `DEFAULT_SORT` as the first stage. Omitting it makes the page boundary nondeterministic.
