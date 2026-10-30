---
source: scenarios/values/products.ts
sha256: efc76181a54903966f9ac15cab9878625200fd59c2ab47b07a335bfc73ae6209
generated_at: 2026-10-29T01:28:10.499586+00:00
model: ollama:qwen3.8:27b
---

# scenarios/values/products.ts

## Purpose

Provides the product-related example values consumed by a generated API client's collection helpers. It pins concrete seed product IDs so that generated requests always reference a product that exists in the test environment.

## Key elements

- **`collectionValues`** (exported `const`, type `CollectionValues`) — the single public export; supplies product values for three sub-sections:
  - **`byProperty`** — maps the property names `id` and `productId` to `SEED_PRODUCT_IDS.dogFoodStandard`.
  - **`pathParam(name, template)`** — returns `SEED_PRODUCT_IDS.dogFoodStandard` when the path-param name is `productId` *or* when it is `id` and the route template begins with `/products`; otherwise returns `undefined`.
  - **`tokens`** — named references to products in specific lifecycle states: `seedProductId`, `seedSoftDeletedProductId` (heater), `seedInactiveProductId` (bundle), `seedOffSaleProductId` (bed).

## Relationships

- **`scenarios/collection-values.ts`** — defines the `CollectionValues` type that `collectionValues` structurally implements; this file is one of its concrete instantiations (the product slice).
- **`scenarios/product-ids.ts`** — exports the `SEED_PRODUCT_IDS` constants that supply every concrete ID used in this file.

## Notes

- The `pathParam` function treats `id` and `productId` asymmetrically: `id` only resolves when the template starts with `/products`, while `productId` resolves unconditionally. This avoids false-positive matches on unrelated `:id` segments (e.g., in a customer or order route).
- Every value in `byProperty` and the default `pathParam` branch points to the *same* product (`dogFoodStandard`); the variety of states is only expressed through the `tokens` map.
