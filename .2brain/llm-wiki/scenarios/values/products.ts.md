---
source: scenarios/values/products.ts
sha256: efc76181a54903966f9ac15cab9878625200fd59c2ab47b07a335bfc73ae6209
generated_at: 2026-11-08T02:36:18.137883+00:00
model: ollama:qwen3.8:27b
---

# scenarios/values/products.ts

## Purpose

Provides the product-specific example values that the generated API client collections use to construct realistic requests. It pins every product reference to a known seed id so that generated test scenarios always target a product that exists in the catalogue.

## Key elements

- **`collectionValues`** (exported `const`, typed as `CollectionValues`) — the single export of this module. Its shape has three members:
  - `byProperty` — maps property names (`id`, `productId`) to `SEED_PRODUCT_IDS.dogFoodStandard`.
  - `pathParam(name, template)` — a resolver function. Returns the dog-food seed id when `name` is `productId`, or when `name` is `id` and the route template begins with `/products`; returns `undefined` otherwise.
  - `tokens` — named placeholders for seed products in distinct lifecycle states: `seedProductId` (active), `seedSoftDeletedProductId`, `seedInactiveProductId`, `seedOffSaleProductId`.

## Relationships

- **`scenarios/collection-values.ts`** — supplies the `CollectionValues` type that `collectionValues` is declared as; defines the contract this object must satisfy.
- **`scenarios/product-ids.ts`** — supplies `SEED_PRODUCT_IDS`, the canonical id constants consumed throughout this file (dog food, heater, bundle, bed).

## Notes

- The `pathParam` function intentionally returns `undefined` for non-product paths so the caller can fall back to a different value strategy; it is not a total resolver.
- All "primary" examples default to the same `dogFoodStandard` id — only the `tokens` block differentiates by product state. When adding a new state, extend `tokens` rather than `byProperty`.
