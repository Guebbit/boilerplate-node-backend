---
source: src/modules/products/index.ts
sha256: 9e6ad060292d3da1b9479a088425feb2b41cb07bcfe3b061ebb46eeb6ea205a5
generated_at: 2026-10-29T05:26:34.373062+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/index.ts

## Purpose

Public barrel (module facade) for the products domain. It is the **only** entry point sibling modules may import from, enforcing the strategic-DDD boundary rule (`docs/theory/strategic-ddd.md` §5). Internal implementation details—`productRepository`, `productSchema`, `applyProductTransform`, `productModel`—are deliberately kept out of this surface.

## Key elements

- **`export * from './services'`** — re-exports the product service layer (e.g. `productService`) that siblings use to read `onHand` / `reserved` mirrors.
- **`export * from './events'`** — re-exports product domain events.
- **`productPagePath`** (from `./config`) — builds the frontend URL path for a product's page; consumed by the sitemap generator and back-in-stock email links.
- **`resolveTaxRate`** (from `./tax`) — maps a product's `taxClass` to its decimal VAT rate. Published so the `orders` module can freeze the resolved rate onto an order line at checkout (`services/snapshot.ts`).
- **`TaxClass`, `RateType`** (type-only, from `./tax`) — supporting types for tax resolution.
- **`export * from './domain'`** — re-exports product domain primitives.
- **`export type * from './model'`** — type-only re-export of the product model shape (runtime model internals are *not* exposed).

## Relationships

- **`src/modules/cart/module.ts`** and the cart service files (`items.ts`, `merge.ts`, `preorder.ts`, `shelf.ts`, `view.ts`) import product services and types through this barrel to check stock availability, resolve pricing, and build line items.
- **Cart integration & contract tests** (`api.contract.test.ts`, `checkout-*.test.ts`, `line-availability.test.ts`, `merge.test.ts`, `preorder.test.ts`, `product-removal-protects-orders.test.ts`, `product-restored-meanwhile.test.ts`) exercise the product surface indirectly via the cart services that consume it.

## Notes

- **Never import internal paths** (e.g. `../model`, `../services/productRepository`) from a sibling module; only this barrel is a legal entry point. Violating the rule breaks the module boundary and the DDD layering contract.
- Siblings must read stock state via `productService`; direct collection access is reserved for `@modules/inventory` (write) and is never exposed here.
- The model export is **type-only** (`export type *`). Importing runtime symbols from `./model` will fail at build time by design.
