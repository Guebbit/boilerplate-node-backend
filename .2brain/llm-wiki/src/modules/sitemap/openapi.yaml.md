---
source: src/modules/sitemap/openapi.yaml
sha256: 72bacd7332c0f19be15c0db6288b6f88abb30589b28f28dae8bbe430ce25a612
generated_at: 2026-11-08T08:22:43.187577+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the sitemap module. It specifies the three public, cacheable XML endpoints that expose the shop's pages and products to search engines, and pins down the shared response shape so the implementation (`module.ts`) and any consumer share a single source of truth.

## Key elements

- **`/sitemap/index.xml` — `getSitemapIndex`** — Returns a `sitemapindex` listing `pages.xml` plus one `products-{page}.xml` per catalogue run. Always the same URL regardless of catalogue size.
- **`/sitemap/pages.xml` — `getSitemapPages`** — Returns a `urlset` of static shop pages (home, about, FAQ, etc.), one entry per active language with `xhtml:link` alternates. No `lastmod`.
- **`/sitemap/products-{page}.xml` — `getSitemapProducts`** — Returns a `urlset` of one "run" of public products (≤ 50 000 URL entries). Path parameter `page` (integer, min 1) selects the run; unknown numbers yield 404. `lastmod` mirrors product `updatedAt`.
- **`components.schemas.SitemapDocument`** — The shared response schema; typed as a plain `string` because the payload is XML (`application/xml`), not JSON.
- **`tags[0].x-family: Catalogue`** — Vendor extension grouping the Sitemap tag under the Catalogue family.
- **Shared 404 response** — `$ref` to `../../../shared/contracts/openapi.root.yaml#/components/responses/NotFound`.

## Relationships

- **`src/modules/sitemap/module.ts`** — The runtime module that implements the three operations defined here. The YAML file is its declarative contract: route paths, parameter schemas, response status codes, content types, and cache headers all originate in this spec.

## Notes

- `SitemapDocument` is intentionally a `string` — OpenAPI cannot natively express an arbitrary XML schema, so the spec documents intent (sitemaps.org 0.9) rather than structure.
- All endpoints declare `security: []` (fully public) and a `Cache-Control: public, max-age=3600` response header; consumers should treat responses as read-only.
- The products path uses a **path parameter embedded in the filename** (`products-{page}.xml`) rather than a query or segment parameter, matching what search engines expect to crawl.
- Page size is bounded by a 50 000-URL cap per file, not by a fixed product count; the index is the authoritative list of valid page numbers.
