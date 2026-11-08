---
source: src/modules/products/controllers/get-catalog-facets.ts
sha256: c9e285a716161697df009b639bc11e7228735820242522b607f6112491e86948
generated_at: 2026-11-08T07:42:18.898142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-catalog-facets.ts

## Purpose
Thin HTTP adapter that exposes the catalogue's category and tag facet counts (the storefront's filter chips) as a `GET /products/facets` response. It delegates all logic to the product service and only shapes the HTTP reply.

## Key elements
- **`getCatalogFacets(request, response)`** — The sole export. Calls `productService.facets()`, wraps the result in `successResponse<CatalogFacetsResponse>`, and funnels any rejection through `catchAs(response, 'getCatalogFacets')` for a standard error shape.

## Relationships
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the utility that serialises a payload into the project's standard success envelope.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-handler factory that produces the standard error response for a given operation name.
- **`src/modules/products/services/index.ts`** — Source of the `productService` singleton whose `facets()` method performs the actual facet-count query.
- **`src/types/index.ts`** — Exports the `CatalogFacetsResponse` type that parameterises the success payload.
- **`src/modules/products/routes.ts`** — Registers `getCatalogFacets` as the handler for the `GET /products/facets` route.

## Notes
- The doc-comment states the endpoint is **public** and **cache-tagged** with the same products tag that invalidates the catalogue listing; any catalogue mutation busts this response.
- The handler signature accepts an `express` `Request` object but never reads from it — all state is derived from the service call.
- Error handling is entirely delegated to `catchAs`; there is no local `try/catch` or per-error status-code logic in this file.
