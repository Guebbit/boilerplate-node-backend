---
source: src/modules/orders/tests/integration/repository.test.ts
sha256: f9704c96552cd6630c491a7a12aa878d4c8c73cf1ec91e873bcc85fb009f71fa
generated_at: 2026-10-15T11:16:39.792689+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/repository.test.ts

## Purpose

Integration tests that pin the behavioral contracts of `orderRepository` against a real MongoDB instance. They exist to lock down three things that TypeScript signatures and unit tests cannot guarantee: (1) `aggregate` is a raw pipeline passthrough that does not silently reshape stages, (2) `findByIdScoped` always returns the same hydrated Mongoose document regardless of whether a scope filter is applied, and (3) `create` embeds a full product snapshot rather than a reference.

## Key elements

- **`describe('create')`** — Four tests covering order insertion: returned Mongoose doc identity, per-line quantity, embedded product snapshot (title + price as plain values, not ObjectId), and multi-product orders.
- **`describe('aggregate')`** — Five tests exercising the raw pipeline passthrough with `$match` (empty, filtered), `$count`, `$addFields` (computed sums), and the `$sort` + `$skip` + `$limit` pagination trio.
- **`describe('findByIdScoped')`** — Two tests asserting that both scoped and unscoped lookups return an identical hydrated document (verified via `_id` and `.toJSON`), and that a non-matching `ownerScope` yields `undefined`.
- **`setupTestDb()`** — Called once before the suite; wires up the in-memory Mongo instance for all cases.

## Relationships

- **`src/modules/orders/repository.ts`** — System under test; imports `orderRepository` (methods: `create`, `aggregate`, `findByIdScoped`, `ownerScope`).
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder`, `makeOrder`, `toOrderItem` for building order fixtures.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct` (accepts `title`, `price` overrides).
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` (accepts `email` override; email is unique).
- **`src/shared-kernel/money.ts`** — Provides `toMinorUnits` for converting Decimal128 pipeline sums into integer minor-unit assertions.
- **`src/infrastructure/persistence/search.ts`** — Provides `DEFAULT_SORT`, the total-order sort key required before `$skip` in the pagination test.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb` to boot and teardown the shared Mongo test database.

## Notes

- **Aggregate is intentionally a passthrough.** The tests are the spec: if a future refactor adds stage-wrapping or reordering inside `orderRepository.aggregate`, these cases fail. The pipeline stages (`$match`, `$count`, `$addFields`, `$sort/$skip/$limit`) are authored by the caller (typically `orderService.search`).
- **Empty pipeline guard.** MongoDB/Mongoose rejects `aggregate([])` with a `MongooseError`. The "match all" test uses `[{ $match: {} }]` as the minimal valid pipeline.
- **Pagination requires total order.** `DEFAULT_SORT` must precede `$skip`; without it, page boundaries are non-deterministic. The comment in the test explicitly calls this out.
- **Money in pipeline results is Decimal128.** The `$addFields` test stores `10 × 4` and asserts via `toMinorUnits(result.totalPrice, 'EUR')` → `4000`, not a plain numeric comparison.
- **Product is an embedded snapshot, not a reference.** `order.items[0].product` is a plain object with `title` and `price`; no `populate` or cast is needed.
- **`findByIdScoped` shape pin.** Both the scoped and unscoped calls are asserted to expose `_id` (Mongoose Document) and `.toJSON` (Document method), distinguishing a real hydrated doc from a wire-shaped plain object that serializes the same `id` string.
- **Scope rejection uses distinct emails.** The "stranger" test passes an explicit different `email` to `createUser` because the `users.email` field carries a unique index; the factory default would collide.
