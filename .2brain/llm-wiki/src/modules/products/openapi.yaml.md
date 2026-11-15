---
source: src/modules/products/openapi.yaml
sha256: 429375a36eb855cbfea9f588f85fce30694e55d5aa6bec5dbbb73ffc0bfbc92a
generated_at: 2026-11-14T21:25:05.140078+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **Products** module (tag `Products`, family `Catalogue`). It defines the HTTP surface for browsing, filtering, creating, reading, replacing, patching, and soft-deleting products and their catalogue facets. It is the single source of truth that clients, gateway docs, and the bundler middleware all consume.

## Key elements

- **`tags[Products]`** – names the module under `x-family: Catalogue`; every operation in this file files itself under this tag.
- **`x-error-codes.PRODUCT_NOT_DELETED`** – module-level 409 sentinel for the restore/undo path.
- **`GET /products`** – paginated listing. Accepts `sort` (JSON:API grammar), `category`, `tag`, `priceMin/Max`, `title`, `active`, `purchasable`, `deleted`. Cache-Control varies by caller privilege level (public 1 h cache → private no-store for draft preview).
- **`POST /products`** – create with `Idempotency-Key` header; accepts `application/json` *or* `multipart/form-data` (image upload). Requires `create:Product` + `update:Translation`. A new product starts with **zero stock**; units enter only via the inventory module's receive endpoint.
- **`GET /products/facets`** – returns every public category and tag with product counts, sorted by count desc. Fully public, `max-age: 3600`.
- **`GET /products/{id}`** – single-product detail. Body is caller-shaped: `read:Translation` adds the `translations` array; `display:Locale` enables draft-language preview. Equivalent to `GET /products?id={id}`.
- **`PUT /products/{id}`** – full-replace (RFC 9110 §9.3.4). Omitted optional scalars are *cleared*, not preserved. Image is outside the representation.
- **`x-versioned`** on `/products` (POST) and `/products/{id}` (GET/PUT/PATCH/DELETE) – signals the bundler to inject `ETag`/`Content-Location` on responses and `If-Match` + 412 on writes.
- **Shared `$ref`s** – pagination, text search, id, idempotency-key, standard 401/403/404/409/422/429 responses, `NonNegativeDecimalAmount`, `Location` header all resolve from `../../../shared/contracts/openapi.root.yaml`.

## Relationships

- **`src/modules/products/authorization.yaml`** – defines the scope/permission names (`create:Product`, `update:Translation`, `read:Translation`, `display:Locale`, `create:StockMovement`, etc.) that this spec's `security` blocks and per-operation descriptions reference. Changes to scope names in that file must be mirrored here or authorization checks will break.

## Notes

- **Caller-shaped bodies vs. caching.** The spec deliberately ties `Cache-Control` to privilege: a guest-level body is shared-cacheable (`public, max-age=3600`); any caller who sees extra fields (inactive products, stock, translations) gets `private, no-cache`; a draft-language preview gets `private, no-store`. Tooling that assumes a single cache policy per route will be wrong.
- **`deleted` filter is admin-effective.** Passing `deleted=true` without the right to see soft-deleted rows yields an empty page, not a 403.
- **`category` / `tag` appear twice** – as query params on `GET /products` *and* inside `SearchProductsRequest`. The controller merges both sources, so they are intentionally redundant.
- **Sort syntax is JSON:API, not OpenAPI default.** `?sort=-price,title` (comma-separated, `-` prefix = descending). A client that emits OpenAPI-style sort arrays will be rejected.
- **Image is never in the PUT/patch representation.** It is handled exclusively by the multipart create path and (presumably) a dedicated upload endpoint.
- **Stock is out of scope.** This spec does not expose inventory endpoints; it only documents the invariant that a product's stock is always 0 at creation and enters via the inventory module.
