---
source: scenarios/values/products.ts
source_sha256: efc76181a54903966f9ac15cab9878625200fd59c2ab47b07a335bfc73ae6209
context_sha256: 39a5958bca39bcaf9dd4099ea1922a7d5a326b1173a06e274ef5e402357b9b50
generated_at: 2026-11-22T01:50:17.820145+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/values/products.ts

## Purpose
Supplies example values for the `products` generated API client collections. It pins request parameters to a known seeded catalogue row (by id), so generated requests reference a product that actually exists.

## Key elements
- `collectionValues: CollectionValues` — the sole export, with three parts:
  - `byProperty` — maps both `id` and `productId` properties to `SEED_PRODUCT_IDS.dogFoodStandard`.
  - `pathParam(name, template)` — returns `dogFoodStandard` when `name` is `productId`, or when `name` is `id` and the path `template` starts with `/products`. Otherwise it returns `undefined`.
  - `tokens` — named placeholders for seeded products in different states:
    - `seedProductId` → `dogFoodStandard`
    - `seedSoftDeletedProductId` → `heaterSoftDeleted`
    - `seedInactiveProductId` → `bundleInactive`
    - `seedOffSaleProductId` → `bedOffSale`

## Relationships
- `scenarios/collection-values.ts` — provides the `CollectionValues` type (imported type-only) that `collectionValues` conforms to.
- `scenarios/product-ids.ts` — provides `SEED_PRODUCT_IDS`, the source of every id used here. No literal ids are defined in this file.

## Notes
- The `id` path param is matched only for templates starting with `/products`. This keeps `id` from resolving to a product id on unrelated routes.
- The default product is always `dogFoodStandard`. The soft-deleted, inactive and off-sale products are available only through the `tokens` entries.
