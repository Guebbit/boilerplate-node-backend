---
source: src/modules/products/controllers/get-catalog-facets.ts
source_sha256: c9e285a716161697df009b639bc11e7228735820242522b607f6112491e86948
context_sha256: 99ef81aa2bc0fbc9f5b884366ee5347d8cdb4fd59b5eecd1f61a3e94545113e6
generated_at: 2026-11-22T07:07:43.744883+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/controllers/get-catalog-facets.ts

## Purpose
Express controller for `GET /products/facets`. It returns the category and tag facet counts for the public catalogue, which the storefront uses as filter chips. It is a thin adapter from the product service's `facets()` to the standard success and error response shapes.

## Key elements
- `getCatalogFacets(request, response)`: the only export. It calls `productService.facets()`. On success it sends the result with `successResponse<CatalogFacetsResponse>`. On failure it passes the error to `catchAs(response, 'getCatalogFacets')`.

## Relationships
- `../services` (`productService`): supplies `facets()`, which does the actual work. The search service file is a sibling in the same services module, but this controller only uses the `productService` exported from the index.
- `@infrastructure/http/response` (`successResponse`): formats the success payload.
- `@infrastructure/http/controller` (`catchAs`): builds the error handler. The label `'getCatalogFacets'` identifies this controller.
- `@types` (`CatalogFacetsResponse`): types the response payload.
- `../routes`: the route layer that wires this handler to `/products/facets`.

## Notes
- The doc comment says the endpoint is public and cached like the product listing. It also says the products cache tag invalidates it when the catalogue changes. No caching logic appears in this file, so it is handled elsewhere.
- The handler returns a promise chain rather than using `async/await`. Errors are not caught in the handler itself. They are routed through `catchAs`.
