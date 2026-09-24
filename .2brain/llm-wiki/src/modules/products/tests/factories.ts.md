---
source: src/modules/products/tests/factories.ts
sha256: 40680467f7ac01f85250a7641525b3597e6f9b857e5c34931bdb48690adf0629
generated_at: 2026-09-23T19:29:15.627775+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/factories.ts

## Purpose

Test-database persistence helpers for the Products module. The in-memory _builder_ (`makeProduct`) lives one level up in `../factories.ts`; this file wraps that builder with repository calls that actually write to (and read from) the test MongoDB instance, so cross-module tests can fixture, assert against, and tear down products without importing the product service or the inventory module.

## Key elements

- **`makeProduct` / `ProductOverrides`** — re-exported from `../factories`. Single source of truth for constructing a product object in memory; re-exported here so consumers import everything from one path.
- **`createProduct(overrides?)`** — Builds a product via `makeProduct` (defaulting `onHand` to 10), inserts it through `productRepository.create`, then upserts the matching `stocklevels` row via `seedStockLevel`. Returns the hydrated Mongoose document.
- **`seedStockLevel(product)`** _(internal)_ — Raw `updateOne` upsert on the `stocklevels` collection keyed by `productId`. Writes `onHand`, `reserved`, and `available` (computed via `availableStock`). Bypasses the `PRODUCT_CREATED` → `receive()` event path for speed.
- **`readProduct(id)`** — Hydrated read via `productRepository.findById`. Intended as a sibling test's assertion on persisted state; deliberately does not go through `productService`.
- **`saveProduct(document)`** — Persists an already-mutated in-memory document back to the DB.
- **`deleteProduct(document)`** — Removes a product document; used for cleanup and negative-path fixtures.

## Relationships

- **`../factories`** — Source of `makeProduct` and `ProductOverrides`; this file adds persistence on top.
- **`../repository`** — All reads/writes of product documents go through `productRepository`.
- **`../model`** — Imports `ProductDocument` type and `productModel` (used only to reach the raw `db.collection` for `stocklevels`).
- **`../domain/stock`** — Imports `availableStock` to compute the `available` field when seeding.
- **Downstream test files** (account, addresses, cart, delivery, inventory, locales, orders — contract and integration tests) — Import the CRUD helpers here to fixture and clean up products without importing the product service or inventory module directly.

## Notes

- `createProduct` defaults `onHand` to **10**, overriding the schema default of 0. Tests that need "no stock" must explicitly pass `onHand: 0`.
- `seedStockLevel` writes to `stocklevels` by raw collection name (`productModel.db.collection('stocklevels')`), not by importing the inventory model. This is the only way a `products`-owned file can touch a sibling module's collection without a cross-module import.
- The file deliberately does **not** expose a generic write-through-service path; `readProduct` uses the repository, not `productService`, to keep the boundary between "assert persisted state" and "invoke business logic" explicit.
- There is exactly one `makeProduct` (see `../../users/tests/factories` for the rationale); do not add a second builder here.
