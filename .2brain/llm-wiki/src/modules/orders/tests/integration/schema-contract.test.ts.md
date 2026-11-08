---
source: src/modules/orders/tests/integration/schema-contract.test.ts
sha256: 3c7fd48b0f7d64fc7bb0cce595d686743b9fff3a49fd35508b63d9c41c897de6
generated_at: 2026-11-08T07:09:10.693487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/schema-contract.test.ts

## Purpose

Schema-contract tests for the orders Mongoose schema. Unlike sibling specs that verify transform/behaviour logic, this file asserts what the schema *declares*: serialization shape (`id` vs `_id`/`__v`), field presence/absence in embedded product snapshots, and (per the file's stated intent) defaults, `required` guards, and `select: false` on credentials. It runs against a real MongoDB instance because the behaviours under test belong to Mongoose itself, not application code.

## Key elements

- **`makeOrderPayload`** — Builds a valid order document: creates a real user and product via factories, embeds the product as a snapshot (`orderLineProductSchema`), and replaces `taxClass` with the resolved `taxRate`. Returns a plain object matching the order schema's top-level shape.
- **`describe('order schema')`** — Two test cases:
  - *serialises to id, never `_id` or `__v`* — Verifies `toJSON()` exposes a string `id` and omits Mongoose internals.
  - *drops `onHand`/`reserved`…* — Confirms the embedded `orderLineProductSchema` has no path for inventory fields, even when the source product document carries them.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/repository.ts` | `orderRepository.create()` is the write path under test; the repository owns the schema. |
| `src/modules/products/index.ts` | Re-exports `resolveTaxRate`, used to map a product's `taxClass` to a concrete `taxRate` for the snapshot. |
| `src/modules/products/tax.ts` | Source of `resolveTaxRate` (pulled in via the products barrel). |
| `src/modules/products/tests/factories.ts` | `createProduct` supplies a real product document with `onHand`/`reserved` to prove the embedded schema strips them. |
| `src/modules/users/tests/factories.ts` | `createUser` supplies the buyer identity for the order payload. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions a real (in-memory or containerised) MongoDB so Mongoose's own default/serialization logic is exercised, not a mock's. |

## Notes

- **Real Mongo is intentional.** Mocks would assert their own interpretation of Mongoose `default` and `select: false`; the file explicitly avoids that.
- **Product is embedded, not referenced.** A bare `ObjectId` in `items[].product` would fail validation because the embedded schema requires `title`, `price`, and `taxRate` on the inlined copy.
- **`taxClass` → `taxRate` substitution** mirrors what `freezeOrderLines` does at write time; the test payload pre-resolves it to match the schema's expected shape.
- **The file is truncated** in the provided content (ends mid-comment about a `userId`-addressed cart collection). Additional test blocks for defaults, `required`, and credential `select: false` are expected below the visible portion.
