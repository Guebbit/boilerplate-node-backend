---
source: src/modules/orders/tests/integration/schema-contract.test.ts
sha256: e0efb61fb38943e1b180ce8edcb75aecb3fee2f672cc9a06b0193a4c98bba120
generated_at: 2026-10-15T11:17:06.351612+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/schema-contract.test.ts

## Purpose

Validates the *declarations* of the order schema (defaults, per-field `required`, `select: false` on credentials) against a real MongoDB instance, rather than testing transform logic or business behaviour. A real Mongo is required because the assertions depend on Mongoose's own interpretation of `default`, `select`, and path stripping — a mock would only assert its own semantics.

## Key elements

- **`makeOrderPayload()`** – async helper that creates a real user and product via test factories, then builds a full valid order document. The product is embedded as a snapshot (spreading `product.toObject()`), with `taxClass` replaced by `resolveTaxRate(taxClass)` and `onHand`/`reserved` intentionally left in the input to prove the schema drops them.
- **`describe('order schema')`** – two tests:
  - `serialises to id, never _id or __v` – asserts `toJSON()` exposes `id` and omits `_id` and `__v`.
  - `drops onHand/reserved…` – asserts the embedded `product` in a persisted order has no `onHand`, `reserved`, or `available` properties, even though the source live product document carries them.
- **Trailing cart comment** – a section header for cart-collection uniqueness (`userId` as `unique`) is present at the bottom, but the corresponding tests are not yet written in the visible portion of the file.

## Relationships

- **`src/modules/orders/repository.ts`** – `orderRepository.create()` is the sole write path exercised; the tests call it and inspect the returned Mongoose document's `toJSON()` output.
- **`src/modules/products/index.ts`** – imports `resolveTaxRate` to compute the `taxRate` that replaces `taxClass` in the embedded snapshot, mirroring what `freezeOrderLines` does in production.
- **`src/modules/products/tax.ts`** – transitively provides the tax-rate resolution used above.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a real product document so the embedded snapshot is realistic.
- **`src/modules/users/tests/factories.ts`** – `createUser` seeds a real user so `userId` / `email` pass validation.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` boots a real Mongo instance and resets it before the suite runs.

## Notes

- The test deliberately passes `onHand`/`reserved` *into* the payload (they come along on `product.toObject()`) so the assertion proves the schema has no path for them, rather than relying on the payload simply omitting them.
- The embedded `product` in an order line is a snapshot, not a reference: a bare `ObjectId` would fail validation because `title`, `price`, and `taxRate` are `required` on the embedded sub-schema.
- The file's doc comment states it covers "what the schema says and nothing else" — sibling specs in the same folder handle behaviour/transforms.
- The cart-uniqueness section at the end appears to be a stub (comment present, no `describe`/`it` yet); do not assume those assertions exist.
