---
source: src/modules/products/controllers/get-catalogue-facets.ts
sha256: d1e2092bb2c0cb659759f73e6fcaaaeb922135fcbc840b41d9221d45316c95eb
generated_at: 2026-10-15T11:40:15.279246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-catalogue-facets.ts

## Purpose

Thin HTTP adapter that exposes the product service's facet counts (categories and tags with counts) as a public JSON endpoint. It exists to separate the request/response lifecycle from the domain query logic so the storefront's filter-chip endpoint stays cacheable and the service stays framework-agnostic.

## Key elements

- **`getCatalogueFacets(request, response)`** — Sole export. Express route handler for `GET /products/categories`. Delegates to `productService.facets()`, wraps the result in `successResponse<CatalogueFacetsResponse>`, and forwards any rejection to `catchAs(response, 'getCatalogueFacets')`.

## Relationships

- **`@infrastructure/http/response`** — supplies `successResponse`, the standard `{ status: "ok", data }` envelope.
- **`@infrastructure/http/controller`** — supplies `catchAs`, which serialises errors into the shared error envelope and tags them with the controller name for logging.
- **`../services`** (services index) — re-exports the `productService` singleton whose `facets()` method performs the actual query.
- **`../services/search`** — likely implementation home of the `facets()` method called by the controller.
- **`@types`** — provides the `CatalogueFacetsResponse` type that parameterises the success envelope.
- **`../routes`** — registers this handler on the `GET /products/categories` route.

## Notes

- The JSDoc notes the endpoint is **public and cached** under the products cache tag; any catalogue mutation invalidates the cache automatically.
- The controller contains **no business logic or validation** — it is strictly a `.then`/`.catch` glue layer. If you need to change the response shape, edit `CatalogueFacetsResponse` in `@types` and the `facets()` service method, not this file.
- `catchAs` receives the literal string `'getCatalogueFacets'` (camelCase), which is used as the operation label in error logs.
