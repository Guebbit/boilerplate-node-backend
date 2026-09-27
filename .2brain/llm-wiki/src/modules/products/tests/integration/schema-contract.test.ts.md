---
source: src/modules/products/tests/integration/schema-contract.test.ts
sha256: 042c8c90b8d895b43d61565f730c28768765338040c35fa7c1240eaa8bcb00db
generated_at: 2026-09-27T15:34:55.919126+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/schema-contract.test.ts

## Purpose

Verifies that the Mongoose schema *declarations* for the Product model (the `required` constraint, `select: false` on `_id`/`__v`, `toJSON` serialization) behave as intended against a real Mongo instance. It exists to pin down driver-level semantics that sibling specs (which cover application transforms) intentionally leave out.

## Key elements

- **`setupTestDb()`** — provisions a real in-memory (or local) Mongo connection before the suite runs.
- **"accepts a price of zero"** — asserts that a `required: true` Number field accepts `0` (rejects only `undefined`/`null`), guarding against accidental truthiness checks.
- **"serialises to id, never _id or __v"** — asserts `toJSON()` yields a string `id` and omits both `_id` and the `__v` version key.

## Relationships

- **`src/modules/products/repository.ts`** — imports `productRepository.create` so the zero-price test exercises the real persistence path.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` for the serialisation test, reusing the shared factory rather than inlining a document.
- **`tests/support/setup-test-db.ts`** — provides the `setupTestDb` helper that spins up the real Mongo instance required for these assertions.

## Notes

- The module doc comment is explicit: this file tests Mongoose's own behavior, **not** application logic. A mocked model would only assert the mock's interpretation of `default`/`required`, which is why a real connection is mandatory here.
- The zero-price test is a regression guard: it fails if someone replaces the schema-level `required` with a truthiness check (`if (!price)` or `if (price === undefined || price === 0)`).
