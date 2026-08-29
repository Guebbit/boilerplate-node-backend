# src/modules/products/tests/integration/schema-contract.test.ts

## Purpose

Asserts the Mongoose **schema declarations** for the Product model — defaults, `required` flags, `select: false`-driven exclusion, auto-timestamps, and `toJSON` serialization. Sibling specs in this folder test behaviour/transforms; this file pins the schema itself as part of the public API contract.

## Key elements

- **`describe('product schema', …)`** — single suite containing six `it` blocks:
  - *Defaults for omitted optional fields* — creates a product with only `title` + `price`, asserts `description`, `categories`, `tags`, `active`, `deletedAt`, `imageUrl` land on their schema-declared values.
  - *Requires `title`* / *Requires `price`* — expects `productRepository.create` to reject when each is absent.
  - *Accepts a price of zero* — guards against a truthiness-based guard that would wrongly reject `0`.
  - *Stamps `createdAt` and `updatedAt`* — verifies Mongoose timestamps are populated.
  - *Serialises to `id`, never `_id` or `__v`* — checks `product.toJSON()` output shape.

- **`setupTestDb()`** — call at module top-level; ensures a real MongoDB instance is available.
- **`as never` casts** on `create` payloads — the tests intentionally pass minimal/partial objects that don't satisfy the full TS type.

## Relationships

- **`src/modules/products/index.ts`** — exports `productRepository`, the system under test.
- **`src/modules/products/repository.ts`** — implementation behind `productRepository.create`; the test exercises its write path to reach Mongoose schema validation.
- **`src/modules/products/tests/factory.ts`** — provides `createProduct`, a convenience wrapper used for the timestamp and serialization tests.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which spins up the real Mongo instance the tests run against.

## Notes

- Tests run against **real MongoDB**, not a mocked model, because the assertions target Mongoose's own interpretation of `default`, `required`, `timestamps`, and `toJSON`. A mock would only assert the mock's opinion.
- The `as never` cast on every `create` call means the TypeScript compiler is bypassed; the tests rely on the runtime schema to enforce (or reject) shapes. This is intentional — the schema *is* the contract being tested.
- `active: true` and `deletedAt: undefined` are asserted as **independent** fields; a product can be active-and-deleted or inactive-and-undeleted.
