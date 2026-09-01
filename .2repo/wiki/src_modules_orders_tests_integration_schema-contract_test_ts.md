# src/modules/orders/tests/integration/schema-contract.test.ts

## Purpose

Verifies the Mongoose schema *declarations* themselves (defaults, `required` fields, serialization shape, timestamps) rather than the domain transforms covered by sibling integration specs. Uses a real MongoDB instance because the behaviours under test are Mongoose-internal (e.g. what `default` actually does) and would be meaningless against a mock.

## Key elements

- **`makeOrderPayload()`** — async helper that creates a real user and product via fixture helpers, then returns a valid order payload with an *embedded* product snapshot (full object, not an ObjectId).
- **`describe('order schema')`** — three assertions:
  - `email` is required (omitting it causes `orderRepository.create` to reject).
  - `order.toJSON()` exposes `id`, never `_id` or `__v`.
  - `createdAt` / `updatedAt` are stamped as `Date` instances.
- **Trailing cart comment** — documents the intent behind the cart's `userId: unique` declaration (single upsert addressing), though the test block it introduces is not present in this file.

## Relationships

- **`src/modules/orders/index.ts`** — re-exports `orderRepository`, which is the sole SUT exercised here.
- **`src/modules/orders/repository.ts`** — implements `create`; the schema it attaches is what these tests assert against.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct` supplies a valid product document to embed.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` supplies a valid buyer with an `email`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` spins up and tears down a real in-memory/ephemeral Mongo for the whole file.

## Notes

- The `as never` casts on `orderRepository.create(...)` are a known workaround for a type mismatch between the test payload shape and the repository's expected input; they are intentional, not a typo.
- The embedded-product requirement means a bare `ObjectId` in `items[].product` will fail Mongoose validation (`title`/`price` are `required` on the sub-schema). This is by design, not a bug.
- The file deliberately does **not** test business-rule transforms (e.g. discount logic, status transitions) — those live in sibling specs in the same `integration/` folder.
