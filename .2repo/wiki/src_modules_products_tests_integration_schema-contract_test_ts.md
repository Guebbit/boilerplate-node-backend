# src/modules/products/tests/integration/schema-contract.test.ts

## Purpose

Integration test that validates the Mongoose schema declarations themselves — `required`, `default`, `select: false`, serialization options — against a real MongoDB instance. It exists because these behaviours belong to Mongoose, not to application code; mocking the model would assert the mock's interpretation rather than the actual schema contract.

## Key elements

- **`setupTestDb()`** — called once at module scope; spins up a real (in-memory or spun-up) Mongo database for the suite.
- **`describe('product schema')`** — top-level suite; contains two tests:
  - *"accepts a price of zero"* — creates a product via `productRepository.create` with `price: 0` (cast `as never` to bypass the non-null type) and asserts the stored value is `0`. Guards against a truthiness-based validation that would wrongly reject free products.
  - *"serialises to id, never _id or __v"* — creates a product via the `createProduct` fixture, calls `toJSON()`, and asserts the output has `id` (stringified `_id`) while `_id` and `__v` are absent.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which initialises the real Mongo connection used by every test in this file.
- **`src/modules/products/index.ts`** — re-exports `productRepository`; this test imports it from the public module entry point rather than reaching into the barrel's internals.
- **`src/modules/products/repository.ts`** — the `create` method under test; the test exercises the schema path that the repository triggers during document creation.
- **`src/modules/products/tests/fixtures.ts`** — provides `createProduct`, a convenience factory used in the serialization test to build a valid product document.

## Notes

- The `as never` cast on the `create` call is intentional: `price` is typed as non-nullable, but the test deliberately passes `0` to confirm the *schema-level* `required` constraint (which rejects `undefined`, not falsy values) behaves correctly at the Mongoose layer.
- Because this test hits real Mongo, it lives under `tests/integration/` rather than alongside unit tests; CI must have a Mongo instance available.
- Sibling specs in the same folder cover application-level transforms; this file is scoped strictly to schema declarations.
