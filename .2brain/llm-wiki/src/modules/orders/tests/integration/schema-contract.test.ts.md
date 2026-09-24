---
source: src/modules/orders/tests/integration/schema-contract.test.ts
sha256: dcb338f8ccce442e99d5ff2fbf89566b9e983fd2bad90ef005c3b6b3dbd84b2e
generated_at: 2026-09-23T19:11:55.713799+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/schema-contract.test.ts

## Purpose

Integration test that asserts the Mongoose **schema declarations** for orders — `required` fields, `default` values, and `select: false` on credentials — rather than application-level transform behaviour. It runs against a real MongoDB instance because the assertions target Mongoose's own interpretation of those declarations, which a mock would only paraphrase.

## Key elements

- **`makeOrderPayload()`** – Async helper that creates a real user and product via factories, then assembles a valid order payload. The product is embedded as a snapshot (not a reference): `taxClass` is replaced with the resolved `taxRate` (via `resolveTaxRate`), and `onHand`/`reserved` are intentionally present in the raw `toObject()` output to prove the schema drops them.
- **`describe('order schema')`** – Two specs:
  - *serialises to id, never _id or __v* – Asserts `toJSON()` shape: `id` present, `_id` and `__v` absent.
  - *drops onHand/reserved* – Asserts the embedded product in a persisted order has no `onHand`, `reserved`, or `available` path, even though the live product document carried them at write time.
- **Trailing docblock (cart section)** – Documents the intent for a cart-unique-on-`userId` contract; the corresponding tests appear further down in the file.

## Relationships

- **`src/modules/orders/repository.ts`** – `orderRepository.create()` is the write path under test; the specs verify what the repository persists *as declared by the schema*, not any repository-level mapping.
- **`src/modules/products/tests/factories.ts`** – `createProduct` supplies a real product document whose `toObject()` output exercises the embedded-snapshot validation (required `title`, `price`, `taxRate`; absence of `onHand`/`reserved` paths).
- **`src/modules/users/tests/factories.ts`** – `createUser` supplies a real buyer `userId` and `email` for the payload.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` boots a real Mongo instance; no mocking of Mongoose behaviour is used or needed.

## Notes

- This file deliberately does **not** test `freezeOrderLines` or other transform logic; sibling specs in the same folder cover that. The overlap is intentional: the payload construction mirrors what `freezeOrderLines` produces so the schema assertions are realistic.
- The `as never` cast on `makeOrderPayload()` in the `create` call exists because the payload type is broader than what the repository signature expects at compile time; it does not indicate a type-safety gap in production code.
- A bare `ObjectId` for `items[].product` would **fail** validation — the embedded schema requires `title`, `price`, and `taxRate`. This is a contract distinction from any reference-based model.
