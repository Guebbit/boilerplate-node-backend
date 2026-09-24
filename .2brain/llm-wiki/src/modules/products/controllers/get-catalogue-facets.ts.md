---
source: src/modules/products/controllers/get-catalogue-facets.ts
sha256: 35f9f3f9b7806acf5246b482992ced4c7e098860a05ff4ca78598f1bb1db5abf
generated_at: 2026-09-23T19:25:46.882756+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-catalogue-facets.ts

## Purpose

Thin Express controller that exposes the catalogue's category and tag facet counts (storefront filter chips) as a public `GET /products/categories` endpoint. It adds no business logic — it simply calls the service and maps the result into the project's standard response shapes.

## Key elements

- **`getCatalogueFacets`** (exported) — Route handler for `GET /products/categories`. Calls `productService.facets()`, sends the result via `successResponse<CatalogueFacetsResponse>`, and delegates any rejection to `catchAs`.

## Relationships

- **`src/modules/products/service.ts`** — Calls `productService.facets()` to obtain the facet data. This is the sole business-logic dependency.
- **`src/modules/products/routes.ts`** — Registers this handler on the `GET /products/categories` route.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to format the payload in the project's standard envelope.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` for uniform error-to-response mapping.
- **`src/types/index.ts`** — Imports the `CatalogueFacetsResponse` type used to type the success payload.

## Notes

- The JSDoc states this endpoint is **public and cached** alongside the product listing; a "products" cache tag invalidates it whenever the catalogue changes. Ensure any cache-invalidation path touches that tag.
- The handler is intentionally stateless and parameter-free — there is no query-string or auth surface in this controller. Any filtering/permissioning must live upstream (route middleware) or in the service.
