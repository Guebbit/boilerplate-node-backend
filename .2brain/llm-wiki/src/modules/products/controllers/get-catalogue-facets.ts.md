---
source: src/modules/products/controllers/get-catalogue-facets.ts
sha256: ae3e193e8f0915b083e473a5780ed86b5067489f2fb2c8b4086b4611f15b99ee
generated_at: 2026-10-29T05:24:57.805924+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-catalogue-facets.ts

## Purpose

A thin HTTP adapter that exposes catalogue facet counts (categories and tags with their usage counts) at `GET /products/facets`. It exists to bridge the `productService.facets()` call onto the project's standard success/error response envelope so the storefront can render filter chips.

## Key elements

- **`getCatalogueFacets(request, response)`** — The sole export. Express route handler that calls `productService.facets()`, sends the result through `successResponse<CatalogueFacetsResponse>`, and delegates any rejection to `catchAs`.

## Relationships

- **`src/modules/products/services/index.ts`** — Imports `productService`; the source of the `facets()` call this handler delegates to.
- **`src/modules/products/services/search.ts`** — Likely implements the `facets()` method on the service (the actual query logic lives here, not in this controller).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which wraps the facets payload into the standard `{ data }` envelope.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-catching utility that formats and sends the error response.
- **`src/modules/products/routes.ts`** — Registers the `GET /products/facets` route and binds it to this handler.
- **`src/types/index.ts`** — Supplies the `CatalogueFacetsResponse` type used to constrain the response shape.

## Notes

- The handler is intentionally logic-free: no validation, no transformation. All behaviour is delegated to the service layer.
- Per the module docstring, the endpoint is **public** (no auth guard) and **cached** via the products cache tag — invalidation happens when the catalogue changes, not per-request.
- Uses the promise `.then/.catch` style rather than `async/await`, consistent with the project's controller convention.
