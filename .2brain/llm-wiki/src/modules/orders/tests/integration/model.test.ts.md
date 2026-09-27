---
source: src/modules/orders/tests/integration/model.test.ts
sha256: 6e0875fb84629b23b6f078ae9ec9455f2034d3a92935f919cbdeb0178cf9cbd0
generated_at: 2026-09-27T15:17:58.389015+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/model.test.ts

## Purpose

Integration tests that verify the order serialization contract on every response path: hydrated documents (via `toJSON`) and aggregate results (via the manual mapping in the service layer) must expose `id`, never `_id` or `__v`, and must normalize embedded product snapshots and item entries the same way. A secondary concern is guarding the schema itself (no index smuggling from the embedded product sub-schema, no fabricated `transferInstructions`).

## Key elements

- **`describe('order serialization')`** — four tests covering `toJSON` output, aggregate (`search`) output (two variants: no-arg and empty-object arg), and scoped `getById`. Asserts `id` is present, `_id`/`__v` are absent, item `_id` is absent, and embedded product is normalized.
- **`describe('transferInstructions')`** — asserts a `bank_transfer` order with no `transferReference` yields `transferInstructions === undefined` (no fallback to raw id).
- **`describe('embedded product snapshot indexes')`** — inspects `orderSchema.indexes()` directly and asserts no index key path contains `product`, preventing a future nested-schema index from silently propagating onto the parent.
- **`asStub<T>(…)`** — unwraps the test-stub proxy to inspect the raw underlying object (wire shape) for field-level assertions.
- **`setupTestDb()`** — called once at module scope to provision/reset the integration database.

## Relationships

- **`src/modules/orders/model.ts`** — imports `orderSchema` for the index-smuggling guard test.
- **`src/modules/orders/services/index.ts`** — imports `orderService` to exercise `search()` and `getById()` end-to-end.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder` and `toOrderItem` for seeding.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct`.
- **`src/modules/users/tests/factories.ts`** — provides `createUser`.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` for integration DB lifecycle.
- **`tests/support/stub.ts`** — provides `asStub` to unwrap proxied values for raw field inspection.

## Notes

- Two tests inside `describe('order serialization')` share the identical title *"normalizes aggregate results (search) the same way"* (one calls `search()`, the other `search({})`). Report output will show a duplicate name; one may be redundant.
- The index-smuggling test is deliberately placed here (integration, module-specific) rather than a generic schema-index suite, per the in-file comment.
- `getById` is asserted to return a real Mongoose document (has `toJSON`), unlike the aggregate rows from `search` which are plain JS objects — the two paths use different serialization mechanisms.
