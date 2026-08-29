# src/modules/cart/tests/integration/schema-contract.test.ts

## Purpose

Verifies the Mongoose schema declarations on the cart model itself—defaults, required fields, unique indexes, subdocument constraints, and timestamps—against a real MongoDB instance. Sibling specs in this folder cover repository behaviour; this file pins down what the schema *says*, which no other test exercises.

## Key elements

- **`setupTestDb()`** — boots a real test database (via `tests/support/setup-test-db`) so Mongoose's own schema enforcement runs.
- **`describe('cart schema')`** — eight assertions, each targeting one schema declaration:
  - `items` defaults to `[]` on a fresh cart.
  - `userId` is `required`; a create without it rejects.
  - A unique index prevents a second cart for the same user (calls `cartModel.syncIndexes()` first).
  - A cart line must include `productId` (rejects when absent).
  - A cart line must include `quantity` (rejects when absent).
  - `quantity` enforces `minimum: 1` (zero rejects).
  - Line items are plain subdocuments with no auto-generated `_id`.
  - `createdAt` / `updatedAt` timestamps are populated automatically.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/repository.ts` | All create calls go through `cartRepository.create`, exercising the schema via the public write path. |
| `src/modules/cart/model.ts` | `cartModel.syncIndexes()` is called directly before the duplicate-user test to ensure the unique index exists. |
| `src/modules/users/tests/factory.ts` | `createUser` seeds a valid user `_id` for each test case. |
| `src/modules/products/tests/factory.ts` | `createProduct` seeds a valid product `_id` for line-item tests. |
| `tests/support/setup-test-db.ts` | Provides `setupTestDb` to connect to a real (non-mocked) Mongo for the duration of the suite. |

## Notes

- **Real Mongo, not a mock.** The file header explicitly states that a mocked model would assert the *mock's* interpretation of `default`, `required`, etc. These are Mongoose behaviours.
- **`as never` casts.** Every `cartRepository.create` call casts its argument to `never`. The repository's TypeScript input type is narrower than the raw schema; the casts let the tests intentionally omit fields to verify schema-level rejection.
- **`syncIndexes()` is not free.** In the test environment indexes are not auto-synced, so the duplicate-cart test calls it explicitly. Forgetting this would make the "second cart" test pass vacuously.
