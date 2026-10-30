---
source: src/modules/orders/tests/integration/model.test.ts
sha256: 3fbdcfde94c95521599b9f7c8fcecf51b2af15afce2ab06f07e93860ef185c2c
generated_at: 2026-10-29T04:54:06.632084+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/model.test.ts

## Purpose

Integration tests verifying that the order serialization contract holds on every response path: a hydrated Mongoose document (`toJSON`) and a raw `.aggregate()` result (manually mapped via `applyOrderTransform`). Also guards that `transferInstructions` is never fabricated and that the embedded product schema does not smuggle indexes into the order schema.

## Key elements

- **`describe('order serialization')`** — four tests:
  - Hydrated `toJSON` normalises `id`, strips `__v`, removes `_id` from items and embedded product.
  - `orderService.search()` (no query) returns aggregate rows where `id` is a 24-char hex string, `_id` is absent, and embedded items/products carry no `_id`.
  - `orderService.search({})` (empty query) — same aggregate assertions.
  - `orderService.getById(id, { userId })` returns a real Mongoose document (has `toJSON`), not a wire-shaped row.
- **`describe('transferInstructions')`** — asserts the field is `undefined` for a `bank_transfer` order with no `transferReference` (no fallback to raw id).
- **`describe('embedded product snapshot indexes')`** — inspects `orderSchema.indexes()` and asserts no index path contains `product`, preventing future index-smuggling from the nested product schema.
- **`setupTestDb()`** — called once at module top to provision the integration DB.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/model.ts` | Imports `orderSchema` for the index-smuggling assertion. |
| `src/modules/orders/services/index.ts` | Imports `orderService`; calls `.search()` and `.getById()`. |
| `src/modules/orders/tests/factories.ts` | Imports `createOrder`, `toOrderItem` to build fixture data. |
| `src/modules/products/tests/factories.ts` | Imports `createProduct` for product fixtures. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` for user fixtures. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb` to reset/provision the test database. |
| `tests/support/stub.ts` | Imports `asStub` to cast aggregate rows to `Record<string, unknown>` for assertions. |

## Notes

- Two tests in the `order serialization` block share the identical name *"normalizes aggregate results (search) the same way"* (one with no query arg, one with `{}`). They are distinct cases but will be indistinguishable in reporter output if one fails.
- The module doc comment is load-bearing: it explains *why* the aggregate path needs a separate check (aggregation output is plain JS and bypasses `toJSON`), and *why* `orderItemSchema` sets `_id: false` (OpenAPI shape is `{product, quantity}` only).
- The index-smuggling test is a regression guard for a Mongoose behaviour (nested schemas copy indexes to the embedding schema) that is not currently triggered but would silently add write overhead if a product-snapshot index were ever added.
