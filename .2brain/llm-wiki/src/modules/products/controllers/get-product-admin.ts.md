---
source: src/modules/products/controllers/get-product-admin.ts
sha256: 36f7a9c79fa6cc790714695099b7948e907c9750b4f097d3fb6074fb79df65cd
generated_at: 2026-10-15T11:40:22.654889+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-product-admin.ts

## Purpose

Admin-only read controller that returns a product together with every language row it has, intended to populate the editor's language tabs. It is a thin wrapper over the shared `createItemController` factory, configured with an explicit handler suffix to avoid a name collision with the customer-facing `get-product-item` controller.

## Key elements

- **`getProductAdmin`** (exported const) — the controller for `GET /products/:id/admin`. Built via `createItemController` with:
  - `entity: 'product'`
  - `notFoundKey: 'products.not-found'` — i18n key returned when the product is missing.
  - `handlerSuffix: 'Admin'` — disambiguates the generated handler name from the default (`getProductItem`).
  - `fetch(id, request)` — delegates to `productService.getAdmin(id, request.caller)`.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — supplies the `createItemController` factory that produces this controller (validation, 404 handling, response shaping).
- **`src/modules/products/services/index.ts`** — exports `productService`; this controller calls its `getAdmin` method to retrieve the multi-language product.
- **`src/modules/products/routes.ts`** — registers this handler on the `GET /products/:id/admin` route (admin-only surface).

## Notes

- `handlerSuffix: 'Admin'` is required, not optional: the factory's default naming would produce the same handler identifier as `get-product-item.ts`, causing a collision on the same entity.
- Malformed IDs (non-numeric) and unknown IDs both yield the same 404 response — this is the factory's built-in behaviour; no extra guard is needed here.
- The controller passes `request.caller` into the service call, implying the service can apply caller-scoped filtering (e.g., tenant or role checks).
