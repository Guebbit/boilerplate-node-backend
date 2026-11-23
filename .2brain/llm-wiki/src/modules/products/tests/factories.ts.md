---
source: src/modules/products/tests/factories.ts
source_sha256: 6c9484c9fd7c23ed5d0a1de59c0d53ffd33740db773c1f0e7d51c825805a0984
context_sha256: a64da8c451af896eba78c27468dfd8e6150290599672a5843f021aacaa7f9687
generated_at: 2026-11-22T07:15:17.420247+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/factories.ts

## Purpose
Test-database product factories. The pure builder (`makeProduct`) lives one level up in `../factories`; this file persists what it returns and also seeds the matching stock-level row, since stock belongs to `@modules/inventory`, not the product. It gives sibling module tests (cart, checkout, account, addresses) one shared way to create, read, save, delete, and inspect products.

## Key elements
- `makeProduct`, `ProductOverrides` — re-exported from `../factories`.
- `productRepository` — re-exported live repository object, for `jest.spyOn` when a test must intercept the service's internal writes (e.g. failure or retry assertions). Other needs have narrower helpers.
- `StockOverrides` — `onHand` (default 10), `reserved`, `backorderLimit` (`null` means no cap), `backordered`.
- `seedStockLevel` (private) — upserts a row in the raw `stocklevels` collection with `$setOnInsert`. It computes `available` via `availableStock`. `backorderLimit` defaults to 0, and `reserved` and `backordered` default to 0.
- `createProduct(overrides & stockOverrides)` — creates the product through `productRepository.create(makeProduct(...))`, then seeds its stock level and returns the document.
- `readProduct(id)` — reads the stored document via `productRepository.findById`.
- `saveProduct(doc)` — persists an in-memory-mutated document via `productRepository.save`.
- `deleteProduct(doc)` — removes it via `productRepository.deleteOne`.
- `countersOf(productId)` — reads `onHand`, `reserved`, and the computed `available` from the `stocklevels` collection, for asserting that units moved after a mutation.

## Relationships
- Depends on `../factories` (builder), `../repository` (persistence), `../model` (`productModel`, used for its `db` handle), and `../domain/stock` (`availableStock`).
- Used by the cart integration and contract tests, the addresses checkout test, and the account shop contract test listed as neighbors. These cover checkout, backorder, line availability and caps, merging, and idempotent add. They use it to build products with stock and to assert on counters afterwards.
- Reaches `stocklevels` by collection name, with no import of the inventory module. The header comment points to `../../users/tests/factories` for why there is exactly one `makeProduct`.

## Notes
- Stock defaults to 10 `onHand`. A "no stock" test must pin `onHand: 0` explicitly.
- `createProduct` bypasses the production path (`PRODUCT_CREATED` → `receive()`), so no event is fired. Without `seedStockLevel` a fixture would have no stock row.
- Reads deliberately avoid `productService`, so a generic hydrated read does not turn into a generic write path.
- `seedStockLevel` uses `$setOnInsert`, so it never overwrites an existing level row for the product.
