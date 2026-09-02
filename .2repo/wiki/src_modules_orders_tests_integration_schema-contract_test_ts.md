# src/modules/orders/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies the Mongoose schema declarations on the order model — defaults, `required` constraints, `select: false` on credentials — rather than any application-level transforms. It runs against a real Mongo instance because the assertions target Mongoose's own runtime behaviour, which a mock would only re-implement opaquely.

## Key elements

- **`makeOrderPayload`** — Async helper that creates a real user and product via fixtures, then returns a valid order payload. The `items[].product` field embeds the full product document (title, price, etc.), not a bare ObjectId, because the schema expects the entire embedded schema.
- **`describe('order schema')` → "serialises to id, never _id or __v"** — Calls `orderRepository.create()`, then asserts `toJSON()` exposes `id` (stringified) and omits both `_id` and `__v`.
- **Trailing doc comment (cart uniqueness)** — Documents the design intent that `userId` on the cart collection is `unique`, making it the sole address for a user's cart. (No corresponding `it` block is visible in the current excerpt.)

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision a real Mongo connection for the suite.
- **`src/modules/orders/index.ts`** — Re-exports `orderRepository`, the object whose `create()` method is exercised by the test.
- **`src/modules/orders/repository.ts`** — Underlying implementation behind `orderRepository`; the test exercises its persistence path to reach Mongoose's serialization.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` seeds a real user document so the order's `userId` and `email` reference valid data.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct` seeds a real product whose `toObject()` output is embedded into the order payload.

## Notes

- The embedded `product` in `items[]` must be a full document (title, price present); a plain ObjectId will fail validation because the embedded schema marks those fields `required`.
- Sibling files in the same `integration/` directory cover behavioural/transform specs; this file is intentionally scoped to "what the schema says and nothing else."
- The cast `as never` on the payload passed to `orderRepository.create` is a workaround for the repository's typed signature — the test intentionally supplies a raw shape to exercise the schema layer directly.
