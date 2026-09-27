---
source: src/modules/orders/tests/integration/schema-contract.test.ts
sha256: 736344f90346e776f328d68a935a6c5a849d37c181cb68331093752609bbde25
generated_at: 2026-09-27T15:19:21.296185+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/schema-contract.test.ts

## Purpose

Verifies the Mongoose schema *declarations* for the order document (defaults, `required` fields, `select: false` on credentials) rather than runtime transform logic. Sibling specs in the same folder cover behaviour; this file asserts only what the schema itself guarantees. It runs against a real MongoDB instance because the properties under test (`default`, `required`, `select`) are Mongoose semantics, not application code.

## Key elements

- **`makeOrderPayload`** – builds a complete valid order document: creates a real user and product via factories, resolves `taxClass` → `taxRate` (mirroring `freezeOrderLines`), and returns the shape expected by `orderRepository.create`.
- **`describe('order schema')`** – two assertions:
  - *serialises to id, never `_id` or `__v`* – confirms the `toJSON` transform exposes `id` and strips Mongoose internals.
  - *drops `onHand`/`reserved`* – proves `orderLineProductSchema` has no path for inventory fields, even though the full live product document (obtained via `product.toObject()`) carries them.
- **Trailing cart comment** – a block comment above a (presumably still-to-be-written) `describe('cart schema', …)` block, documenting that `userId` is `unique` on the cart collection and that all cart mutations are single upserts.

## Relationships

- **`src/modules/orders/repository.ts`** – `orderRepository.create` is the single write path exercised here; every assertion inspects the document it returns.
- **`src/modules/products/index.ts`** – source of the `resolveTaxRate` import (re-exported from `products/tax.ts`); used to replace `taxClass` with a concrete `taxRate` in the embedded snapshot.
- **`src/modules/products/tax.ts`** – implementation of the tax-rate resolution logic that the test depends on indirectly.
- **`src/modules/products/tests/factories.ts`** – provides `createProduct`, seeding a real product document whose `toObject()` output deliberately includes `onHand`/`reserved` to stress-test the embedded schema's path list.
- **`src/modules/users/tests/factories.ts`** – provides `createUser`, seeding a real buyer referenced by `userId` in the order payload.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top level to spin up a real in-memory (or temp) MongoDB instance for the Mongoose schema behaviours under test.

## Notes

- The test intentionally passes the **full** live product object (including `onHand`, `reserved`) into the embedded `product` field. If `orderLineProductSchema` ever gains a path for those fields, the second test will fail — it guards against schema drift, not just the happy path.
- `taxClass` is destructured out of the product snapshot and replaced with `resolveTaxRate(taxClass)` before insertion, matching the contract that `orderLineProductSchema` expects a resolved rate, not a class name.
- The file is structured as a *living* spec: the trailing cart comment signals that cart-schema assertions are planned but not yet written.
