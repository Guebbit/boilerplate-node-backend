# src/modules/cart/tests/integration/schema-contract.test.ts

## Purpose

Integration tests that assert the **schema declarations** themselves on the cart collection — defaults, `required` fields, `minimum` constraints, the unique `userId` index, subdocument `_id` suppression, and timestamps. These behaviours are owned by Mongoose, not application logic, so the tests run against a real MongoDB instance rather than a mock. Sibling specs cover transforms; this file covers what the client actually receives or rejects at the wire level.

## Key elements

- **`describe('cart schema')`** — single suite containing eight `it` blocks, each targeting one schema guarantee:
  - *Empty `items` default* — a freshly created cart has `items: []` without the caller supplying it.
  - *`userId` is required* — creating a cart without `userId` rejects.
  - *Unique `userId` index* — a second cart for the same user rejects after `cartModel.syncIndexes()`.
  - *Line must reference a product* — an item without `productId` rejects.
  - *Line must carry a quantity* — an item without `quantity` rejects.
  - *Quantity minimum is 1* — `quantity: 0` rejects.
  - *No auto `_id` on subdocuments* — serialized items contain only `productId` and `quantity`.
  - *Timestamps* — `createdAt` / `updatedAt` are `Date` instances after creation.

## Relationships

- **`src/modules/cart/model.ts`** — imports `cartModel`; calls `cartModel.syncIndexes()` to materialise the unique index before the duplicate-user test.
- **`src/modules/cart/repository.ts`** — imports `cartRepository`; every test exercises `cartRepository.create()` as the write path.
- **`src/modules/users/tests/fixtures.ts`** — imports `createUser` to seed a valid `userId` reference.
- **`src/modules/products/tests/fixtures.ts`** — imports `createProduct` to seed a valid `productId` reference.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb`; called once at module level to start a real Mongo connection before the suite runs.

## Notes

- **Real database, not mocks.** The doc comment explicitly states this is testing Mongoose's own enforcement (defaults, `required`, `minimum`, unique index). A mock would assert its own shape, not the schema's.
- **`as never` casts.** Every `cartRepository.create(...)` call passes a payload that intentionally violates the typed signature (missing fields, zero quantities). The `as never` cast silences the type checker so the test can exercise runtime validation.
- **`syncIndexes()` is explicit.** Mongoose does not guarantee index creation at model-load time in all environments; the unique-index test calls `syncIndexes()` directly to ensure the index exists before asserting rejection.
- **Scope boundary.** This file does **not** test application-level transforms, validators beyond the schema, or business rules — those live in sibling test files.
