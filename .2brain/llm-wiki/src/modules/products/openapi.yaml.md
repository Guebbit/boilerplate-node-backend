---
source: src/modules/products/openapi.yaml
sha256: 9d1c67815c72881c85323c847c0aabee0fbd72646814e7dd13eb82adc246c487
generated_at: 2026-11-08T07:45:49.865742+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the products module. It defines the REST surface for browsing, filtering, creating, updating, and deleting catalogue products, including facets, pagination, i18n translation handling, and image upload. Serves as the single source of truth that both the server implementation and the client SDKs/code-generation derive from.

## Key elements

- **`tags` / `x-family`** — Tags operations under `Products` (family `Catalogue`); consumed by the API gateway for grouping and routing.
- **`x-error-codes`** — Module-level custom error: `PRODUCT_NOT_DELETED` (409) returned when a restore targets a product that isn't soft-deleted.
- **`paths./products` GET (`listProducts`)** — Paginated listing. Accepts JSON:API-style `sort`, plus filters: `category`, `tag`, `priceMin`, `priceMax`, `title`, `active`, `purchasable` (public), `deleted` (admin-gated). Shared-cacheable for guests; `private, no-cache` or `no-store` for staff / draft-locale previews.
- **`paths./products` POST (`createProduct`)** — Create with optional image (JSON or `multipart/form-data`). Fallback-locale translation is mandatory. Product starts at zero stock; stock enters only via the inventory receive endpoint. `uploadLimiter` guards this route (429).
- **`paths./products/facets` GET (`getCatalogFacets`)** — Public count of every visible category and tag, sorted by count desc then name. Fully cacheable (`public, max-age=3600`).
- **`paths./products/{id}` GET / PUT / PATCH / DELETE** — `x-versioned` (bundler adds `ETag` / `If-Match` / 412). GET resolves `title`/`description` to one language; `read:Translation` callers additionally receive the full `translations` object. PUT is full replacement (RFC 9110 §9.3.4): omitted writable scalars are cleared (except `taxClass`, `rateType`, `sku`, `weight`, `releaseDate`); `imageUrl` is out-of-band. PATCH is the partial / per-locale update path.
- **Shared `$ref`s** — Pagination, validation, and response schemas are pulled from `../../../shared/contracts/openapi.root.yaml`; module-local schemas (`Product`, `ProductsResponse`, `CreateProductRequest`, `CatalogFacetsResponse`, `ProductSort`) live in this file's `components` section (truncated here but referenced throughout).

## Relationships

- **`src/modules/products/authorization.yaml`** — Defines the bearer/API-key scopes and role-to-permission mappings referenced in this spec's security blocks and descriptions (`bearerAuth`, `apiKeyAuth`, and permission strings such as `display:Locale`, `read:Translation`, `create:StockMovement`). The authorization file determines which caller tier each endpoint admits and what the response body expands to; this spec documents the resulting per-tier cache and field-visibility behaviour.

## Notes

- **Filter duplication by design.** `category` and `tag` appear both as GET query params and inside the `SearchProductsRequest` body. The controller merges them, so `GET /products?category=x` and `POST /products/search {category: x}` are the same filter reached two ways — do not remove one side.
- **Caller-dependent caching.** The same endpoint returns different `Cache-Control` values depending on the caller's privileges (guest vs. staff vs. draft-locale preview). Any cache-aside or CDN configuration must key on the response headers, not just the URL.
- **`x-versioned` is a bundler directive.** It is not standard OpenAPI; a build step injects `ETag`, `If-Match`, and 412 responses into the listed methods. Editing those headers by hand in this file will be overwritten.
- **PUT semantics differ from a naive "full update."** Because image and `translations` are handled specially (image is out-of-band; translations omit-and-delete), a PUT that leaves out a locale row *deletes* that locale. Use PATCH for single-locale edits.
- **Stock is not part of this contract.** No product endpoint sets stock. The only stock-creation path is `POST /inventory/levels/{productId}/receive` (defined in the inventory module); this file's `createProduct` description cross-references it for client guidance.
