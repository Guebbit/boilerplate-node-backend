---
source: src/modules/products/index.ts
source_sha256: ac407867067f77d23ad07faa9f4ea61a97931dad7a17c49912b1c0bc26aa15f6
context_sha256: e335c92f3a41262737b883dc0757d1909b553314223a98da23da8b284868d1b0
generated_at: 2026-11-22T07:10:01.263701+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/index.ts

## Purpose
Public barrel for the `products` module and the only surface sibling modules may import from it. It re-exports the module's services, events, config helper, tax resolution, and domain types while keeping the repository and model runtime internal.

## Key elements
- `export * from './services'`: the module's service layer (including `productService`, which siblings use to read the `onHand`/`reserved` mirror).
- `export * from './events'`: the module's events.
- `productPagePath` (from `./config`): path of a product's page on the paired frontend; used by the sitemap and the back-in-stock mail link.
- `resolveTaxRate` (from `./tax`): resolves a product's `taxClass` into its decimal VAT rate.
- `TaxClass`, `RateType` (types from `./tax`): type-only exports.
- `export * from './domain'`: domain exports.
- `export type * from './model'`: model types only, with no runtime values.

## Relationships
- The cart module (`module.ts`, the services `items`, `merge`, `preorder`, `shelf` and `view`, and its contract and integration tests) is a sibling that depends on this barrel. Per the file's rules, it can reach product data only through what is exported here, such as `productService`.
- `resolveTaxRate` is published so the `orders` module can freeze the resolved rate onto an order line at checkout.
- `@modules/inventory` is the only module that ever writes the `onHand`/`reserved` mirror.

## Notes
- Deliberately not exported: `productRepository`, `productSchema`, `applyProductTransform` and `productModel`. Siblings must not read the collection directly.
- The model is exported with `export type *`, so sibling modules get types but no runtime access to it.
- See `src/modules/products/model.ts` for the model definitions behind the type-only exports.
