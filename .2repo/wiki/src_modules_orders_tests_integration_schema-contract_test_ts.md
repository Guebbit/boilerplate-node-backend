# src/modules/orders/tests/integration/schema-contract.test.ts

## Purpose

Asserts the Mongoose **schema declarations** of the `order` model — defaults, `required` flags, serialization shape, and timestamps — against a real MongoDB instance. Sibling tests in this folder cover behaviour/transforms; this file pins what the schema *says*, which is equally part of the public API and is not exercised elsewhere.

## Key elements

- **`makeOrderPayload`** – Async helper that creates a real user and product (via factories) and returns a valid order document with an embedded product snapshot (`items[].product` carries the full product object, not a reference).
- **`describe('order schema')`** – Three test cases:
  - `email` is `required` (removing it must reject on write).
  - `toJSON()` serialises to `id` and omits `_id` / `__v`.
  - `createdAt` / `updatedAt` are stamped with `Date` instances.
- **Truncated cart block** – A doc comment at the bottom describes the `userId` `unique` constraint that makes a cart addressable by owner, but the corresponding test body is not present in this excerpt.

## Relationships

- **`src/modules/orders/index.ts`** — Re-exports `orderRepository`, which is the SUT (system under test) for every assertion in this file.
- **`src/modules/orders/repository.ts`** — The concrete implementation behind `orderRepository.create`; its schema definitions are what these tests verify.
- **`src/modules/users/tests/factory.ts`** — Provides `createUser` to seed a valid buyer document.
- **`src/modules/products/tests/factory.ts`** — Provides `createProduct` to seed a valid embedded product snapshot.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` bootstraps a real in-memory/file-backed MongoDB so Mongoose's own schema semantics (defaults, validation, serialization) are tested rather than a mock's interpretation.

## Notes

- Tests intentionally use **real Mongo** because the behaviours under test (default application, `required` enforcement, `select: false`, `toJSON` shape) are Mongoose features, not application logic. A mocked model would assert the mock's opinion, not the schema's.
- `items[].product` is an **embedded document**, not a `ref`. A bare `ObjectId` there fails validation because `title` and `price` are required on the embedded copy.
- The `as never` casts on `orderRepository.create(...)` calls suggest the repository's type signature is stricter than what the test payloads satisfy; this is a known ergonomic gap, not a type error to fix.
- The file's header comment also mentions `select: false` on credentials as a schema guarantee, but no explicit test for that field appears in the visible content — it may be covered in the truncated portion or in a sibling spec.
