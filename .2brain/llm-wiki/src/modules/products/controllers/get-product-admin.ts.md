---
source: src/modules/products/controllers/get-product-admin.ts
sha256: 2c64a2ebbaeef6c256e7ec59aa1127c676942f8021a52cf720ba8ec3dd2a8a6f
generated_at: 2026-09-27T15:31:01.244023+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-product-admin.ts

## Purpose

Admin-only read controller that returns a product together with every language row it has, used by the editor's form to populate its language tabs. It is a thin wrapper around the `createItemController` factory, differing from the public `get-product-item` controller only in its fetch method and handler name.

## Key elements

- **`getProductAdmin`** (exported const) — the single handler exported from this file. Created via `createItemController` with:
  - `entity: 'product'`
  - `notFoundKey: 'products.not-found'` — i18n key for the 404 response.
  - `handlerSuffix: 'Admin'` — overrides the factory's default suffix so the generated handler name doesn't collide with `get-product-item.ts`.
  - `fetch: (id) => productService.getAdmin(id)` — delegates the actual data retrieval to the product service's admin variant.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — provides the `createItemController` factory. This file passes configuration and a fetch function to it; the factory handles route param extraction, CastError → 404 mapping, and handler naming.
- **`src/modules/products/service.ts`** — provides `productService.getAdmin(id)`, the data-fetching call invoked when the handler runs.
- **`src/modules/products/routes.ts`** — wires `GET /products/:id/admin` to the handler exported here (and presumably guards it behind an admin role check).

## Notes

- The `handlerSuffix: 'Admin'` override exists solely to avoid a name collision with `get-product-item.ts`, which targets the same `product` entity. Omitting it would cause the factory to generate the same handler identifier.
- CastError-to-404 mapping (malformed id vs. genuinely missing id are indistinguishable to the caller) is handled by the factory's built-in defaults — no extra try/catch is present in this file.
