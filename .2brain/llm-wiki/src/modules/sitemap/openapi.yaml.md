---
source: src/modules/sitemap/openapi.yaml
sha256: 8d618e3ab0d9a607c41117d8deaea09be8cdea486c15403e0d6722afd043bc7f
generated_at: 2026-11-14T21:59:48.006485+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract that defines the three public, unauthenticated XML endpoints the sitemap module must expose: a stable index, a pages file, and paginated products files. It exists so the API surface, caching policy, and response shapes are documented alongside the implementation and can be validated against the shared contract infrastructure.

## Key elements

- **`/sitemap/index.xml` (GET, `getSitemapIndex`)** – Sitemap index listing `pages.xml` plus one `products-{page}.xml` per run. The stable address named in the frontend's `robots.txt`.
- **`/sitemap/pages.xml` (GET, `getSitemapPages`)** – Static shop pages (source: `staticPages` in `shared/rules/frontend-links.yaml`), one URL per active language with `xhtml:link` alternates. No `lastmod`.
- **`/sitemap/products-{page}.xml` (GET, `getSitemapProducts`)** – One run (≤ 50 000 URL entries) of active, non-deleted public products, oldest id first. `lastmod` = product `updatedAt`. Unknown page numbers return 404.
- **Tag `Sitemap`** (`x-family: Catalogue`) – Groups all three operations; no other tags are defined.
- **`components.schemas.SitemapDocument`** – Declared as `type: string`; represents any sitemaps.org 0.9 document (`urlset` or `sitemapindex`) served as `application/xml`. The actual XML element structure is not modeled.
- **Shared references** – 404 response pulled from `shared/contracts/openapi.root.yaml`; static-page list referenced in prose from `shared/rules/frontend-links.yaml`.
- **Cache policy** – Every 200 response carries `Cache-Control: public, max-age=3600`.

## Relationships

- **`src/modules/sitemap/module.ts`** – The implementation module whose routes/handlers are specified here. The `operationId` values (`getSitemapIndex`, `getSitemapPages`, `getSitemapProducts`) are the anchors the module's route registration maps to.

## Notes

- `SitemapDocument` is intentionally opaque (`type: string`); do not expect a detailed XML schema here. Validate structure via tests or the sitemaps.org spec.
- The products path uses a path parameter (`{page}`) rather than a query string, so the URL shape is `/sitemap/products-1.xml`, not `/sitemap/products.xml?page=1`.
- `lastmod` on product URLs tracks `updatedAt` and shifts on translation edits but **not** on price/sale changes—this is a deliberate semantic choice documented in the description.
- The 50 000 URL cap per products file is a hard rule; the index must enumerate exactly as many `products-{page}.xml` entries as exist for the current catalogue.
