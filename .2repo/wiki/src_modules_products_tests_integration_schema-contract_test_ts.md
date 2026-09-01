# src/modules/products/tests/integration/schema-contract.test.ts

## Purpose

Integration tests that verify Mongoose schema **declarations** — defaults, `required`, `select: false` — against a real MongoDB instance. These behaviors belong to Mongoose, not the application, so a mocked model would only assert the mock's own interpretation. Sibling specs in this folder cover the transforms; this file covers the raw contract.

## Key elements

- **`setupTestDb()`** (top-level) — boots a real test database before any test runs.
- **"applies documented defaults…"** — creates a product with only `title` and `price`; asserts `description`, `categories`, `tags`, `active`, `deletedAt`, and `imageUrl` all receive their schema defaults.
- **"requires a title" / "requires a price"** — confirm `required` enforcement rejects omitted fields.
- **"accepts a price of zero"** — guards against a truthiness-based guard that would wrongly reject `price: 0`.
- **"stamps createdAt and updatedAt"** — verifies Mongoose timestamp hooks fire on insert.
- **"serialises to id, never _id or __v"** — asserts `toJSON()` output uses a string `id` and excludes `_id` and `__v`.

## Relationships

- **`src/modules/products/index.ts`** — provides the `productRepository` export (via the barrel) used for all create calls.
- **`src/modules/products/repository.ts`** — the `productRepository.create` method under test (imported through the index).
- **`src/modules/products/tests/fixtures.ts`** — supplies the `createProduct` helper used by the timestamp and serialization tests.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, which provisions the in-memory/file-backed Mongo instance.

## Notes

- Tests intentionally use `as never` casts to pass type checking while supplying deliberately incomplete payloads; this is a pattern specific to "what the schema rejects" tests, not a type-safety workaround.
- `active` and `deletedAt` are explicitly noted as **independent** axes — a product can be active-but-deleted or inactive-but-not-deleted.
- The serialization test calls `toJSON()` rather than checking the raw doc; the contract is about the wire/API shape, not internal representation.
