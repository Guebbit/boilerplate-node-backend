---
source: src/modules/orders/tests/integration/model.test.ts
sha256: 3fbdcfde94c95521599b9f7c8fcecf51b2af15afce2ab06f07e93860ef185c2c
generated_at: 2026-11-08T07:05:57.404095+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/model.test.ts

## Purpose

Integration tests that verify order serialization never leaks Mongoose internals (`_id`, `__v`) on any response path — both the `toJSON` path (hydrated documents) and the `.aggregate()` path (plain-JS rows returned by `orderService.search`). Also guards two schema-level invariants: `transferInstructions` is absent when no `transferReference` was supplied, and the embedded product sub-schema's indexes are not silently copied onto `orderSchema`.

## Key elements

- **`describe('order serialization')`** — four tests:
  - `toJSON` on a hydrated order: asserts `id` replaces `_id`, `__v` is stripped, embedded items have no `_id`, and the embedded product snapshot is normalized (`id` present, `_id` absent).
  - Aggregate search (no args): casts the row via `asStub`, asserts `id` is a 24-hex string, `_id` is `undefined`, and the same invariants hold for items and their embedded product.
  - Aggregate search (explicit `{}` arg): same assertions on the top-level row only.
  - `orderService.getById(id, { userId })`: confirms the result is a real Mongoose document (exposes `.toJSON`), not a wire-shaped aggregate row.
- **`describe('transferInstructions')`** — creates a `bank_transfer` order with no `transferReference`; asserts `json.transferInstructions` is `undefined` (no fabricated reference fallback).
- **`describe('embedded product snapshot indexes')`** — reads `orderSchema.indexes()`, filters for any path containing `product`, and asserts the list is empty (prevents index smuggling from the nested product schema).

## Relationships

- **`src/modules/orders/model.ts`** — imports `orderSchema` to introspect its index list.
- **`src/modules/orders/services/index.ts`** — imports `orderService`; calls `search()` and `getById()` to exercise both aggregate and query paths.
- **`src/modules/orders/tests/factories.ts`** — imports `createOrder`, `toOrderItem` to build fixture data.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` for the embedded snapshot.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` to satisfy the order's user relation.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` before all tests to (re)initialize the in-memory DB.
- **`tests/support/stub.ts`** — imports `asStub` to cast aggregate results to `Record<string,unknown>` for raw-shape assertions.

## Notes

- Two tests in the `order serialization` block share the identical name *"normalizes aggregate results (search) the same way."* The second differs only in that it passes an explicit `{}` filter and checks fewer fields.
- The index-smuggling test is a **static schema guard**, not a runtime behavior test — it will pass or fail purely on how `orderSchema` and its nested sub-schemas are declared.
- `asStub` is used solely for type-level erasure; it does not modify the object at runtime.
