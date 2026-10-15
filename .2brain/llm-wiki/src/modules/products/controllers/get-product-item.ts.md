---
source: src/modules/products/controllers/get-product-item.ts
sha256: 5d0cb5a53035bff10b98b8d5e77c588ccbf0e3b51ffd72a3f630b6903575aecb
generated_at: 2026-10-15T11:40:31.370047+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-product-item.ts

## Purpose

Thin controller for `GET /products/:id`. It wires the shared `createItemController` factory to the product service so that a single product can be fetched by path id, with row visibility scoped to the calling user (or API key).

## Key elements

- **`getProductItem`** (export) — the route handler returned by `createItemController`. Accepts an `id` and an `HttpRequuest` inside its `fetch` callback, delegates to `productService.getByIdForCaller`, and passes the caller's scope and context.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — provides the `createItemController` factory that `getProductItem` is built from. The factory supplies the common request-parsing, 404 handling (`notFoundKey`), and response-shaping logic; this file only supplies the `entity`, `notFoundKey`, and `fetch` config.
- **`src/modules/products/services/index.ts`** — imports `productService`, whose `getByIdForCaller(id, scope, callerContext)` performs the actual lookup and whose `callerScope(request.caller)` derives the row-visibility filter for the caller.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf(request)` to extract caller context (e.g. headers, auth metadata) and pass it alongside the id to the service layer.
- **`src/modules/products/routes.ts`** — the route table that mounts `getProductItem` at the `/products/:id` path.

## Notes

- Access control for non-active (inactive/deleted) products is enforced inside `productService.getByIdForCaller` via the `callerScope` argument, not in this file. The controller itself contains no permission logic.
- `notFoundKey: 'products.not-found'` is a translation/i18n key consumed by the factory for the 404 body; ensure that key exists in the locale files.
- The `entity: 'product'` string is a label passed to the factory (used for logging or response naming); it is not a type parameter.
