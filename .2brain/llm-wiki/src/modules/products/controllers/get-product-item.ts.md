---
source: src/modules/products/controllers/get-product-item.ts
sha256: 050c131f46b0f1079962d4e9e25de4260c61038c5e42b6118b6bc1fc9f6738c3
generated_at: 2026-09-23T19:26:03.928938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-product-item.ts

## Purpose

Thin controller for `GET /products/:id`. It delegates all real work to the shared `createItemController` factory and the product service, wiring together the caller's auth scope so that row visibility (active vs. inactive/deleted) is enforced per role.

## Key elements

- **`getProductItem`** (export) — The route handler produced by `createItemController({ entity: 'product', notFoundKey: 'products.not-found', fetch: … })`. Its `fetch` callback calls `productService.getByIdViewed(id, callerScope, callerContext)` to retrieve one product row with the caller's visibility filter applied.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — Supplies the `createItemController` factory that shapes this file's export into a standard HTTP handler (status codes, 404 via `notFoundKey`, etc.).
- **`src/modules/products/service.ts`** — Provides `productService.getByIdViewed()` (the actual data fetch) and `productService.callerScope()` (maps `request.authContext` into a visibility predicate).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, extracted and forwarded to the service as a third argument.
- **`src/modules/products/routes.ts`** — The route file that mounts `getProductItem` and attaches `getAuth`, which is what populates `request.authContext` before this handler runs.

## Notes

- The comment explicitly ties correctness to the route-level `getAuth` middleware: without it, `request.authContext` is undefined and role-based scoping (admin sees inactive/deleted rows) will not function. This file contains no fallback.
- The 404 message key is `products.not-found`; the lookup is by the route's `:id` path parameter, not a query string.
