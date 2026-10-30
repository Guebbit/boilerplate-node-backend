---
source: src/modules/products/services/index.ts
sha256: 6f95142b94612d1765ae3f8b73ffb38f25e61d0d81e96f09d9eea49b4cac0a5f
generated_at: 2026-10-29T05:28:56.587529+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/index.ts

## Purpose

The barrel (public surface) of the product service. It aggregates every flow — search, read, write, translate, remove, and lookups — behind a single `productService` object so that controllers and sibling modules have exactly one import path into product business logic. It also exposes the Zod validation schemas and the `toProduct` wire-shaping helper, which siblings need but cannot reach through the presenter barrel.

## Key elements

- **`productService`** — the sole exported object. Controllers and cross-module callers import *only* this. Groups re-exported functions (`search`, `getById`, `create`, `updateById`, `removeById`, `restoreById`, lookup helpers, etc.) plus the local `toProduct` and the three Zod schemas.
- **`toProduct(document, caller?)`** — local (non-re-exported-from-subfile) helper. Runs `presentProduct` then `redactStock` gated by `canSeeStock(caller)`. Exposed via the service so siblings can shape a `ProductDocument` into the `Product` wire type without importing the presenter directly.
- **`canSeeStock`** — re-exported from `./stock-view`; determines whether a caller may see exact stock counters. Published at the barrel level so a sibling's own refusal logic can use the same predicate.
- **Zod schemas** (`zodProductCreateSchema`, `zodProductReplaceSchema`, `zodProductUpdateSchema`) — re-exported from `../model` through the service so the update controller's factory can validate PUT/PATCH bodies without reaching into `../model` directly.
- **Lookup helpers** (`findByIdRaw`, `isLive`, `findPublicById`, `findManyByIds`, `titlesOf`, `titlesById`, `syncStockCache`, etc.) — re-exported from `./lookups`; these are the "door" sibling modules read and cache through.

## Relationships

- **`src/modules/cart/services/shelf.ts`, `items.ts`, `view.ts`, `merge.ts`** — consume the lookup helpers (`findByIdRaw`, `isLive`, `findPublicById`, `findManyByIds`, `titlesOf`, `titlesById`, `syncStockCache`) exposed by this barrel to resolve product state during cart operations.
- **`src/modules/cart/module.ts`** — registers controllers that import `productService` (and its Zod schemas) for request validation and cross-module product access.
- **Cart integration/contract tests** (`line-availability`, `checkout-*`, `product-removal-protects-orders`, `product-restored-meanwhile`, `merge`, `preorder`, `service.test`) — exercise the product lookups and removal/restore flows as seen through the cart's dependency on this service.

## Notes

- This file is a **barrel, not a flow**. All actual logic lives in the sibling files (`search.ts`, `read.ts`, `translated-write.ts`, `remove.ts`, `lookups.ts`, `stock-view.ts`); this file only re-exports and adds `toProduct`.
- The JSDoc explicitly forbids controllers from importing sub-files directly; the service object is the only sanctioned entry point.
- `toProduct` and the Zod schemas exist on the service *because* the presenter barrel and `../model` are not in the sibling's allowed import graph — the barrel is deliberately over-exposed to close that gap.
- `caller` is optional in `toProduct`; when `undefined` (no request context) the caller sees no stock counters, only the `inStock`/`lowStock` flags.
