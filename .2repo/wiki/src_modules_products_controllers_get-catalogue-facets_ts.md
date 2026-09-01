# src/modules/products/controllers/get-catalogue-facets.ts

## Purpose

A thin HTTP controller that exposes the product service's `facets()` method as a `GET /products/categories` endpoint. It translates the service result into the standard success/error response shapes so the storefront can render its category/tag filter chips.

## Key elements

- **`getCatalogueFacets(request, response)`** (exported) — Calls `productService.facets()`, sends the result via `successResponse`, and funnels any rejection through `catchAs(response, 'getCatalogueFacets')`.

## Relationships

- **`src/modules/products/service.ts`** — Imports `productService` and invokes its `facets()` method; this file contains no domain logic of its own.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to shape the 200 reply.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` to produce the standard error envelope on failure.
- **`src/modules/products/routes.ts`** — Consumes this handler to wire it onto the catalogue routes (public, cached listing).

## Notes

- The JSDoc states the endpoint is **public and cached**; a "products cache tag" invalidates it whenever the catalogue changes. The cache config is not in this file — it lives in the routes/infrastructure layer.
- Error handling is entirely delegated to `catchAs`; the string literal `'getCatalogueFacets'` is the operation label used in the error payload. There is no custom error logic here.
