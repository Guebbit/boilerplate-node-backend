---
source: src/modules/sitemap/openapi.yaml
source_sha256: 8d618e3ab0d9a607c41117d8deaea09be8cdea486c15403e0d6722afd043bc7f
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T07:49:05.430393+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (version `0.1.0`) for the sitemap module. It describes three public, unauthenticated XML endpoints that expose the shop's pages and public products to search engines, all grouped under the `Sitemap` tag (family `Catalogue`).

## Key elements
- `GET /sitemap/index.xml` (`getSitemapIndex`): the sitemap index, listing `pages.xml` and one `products-{page}.xml` per run of public products. It is always an index, so the address named in the frontend's `robots.txt` stays stable as the catalogue grows. Built from the live catalogue on each request.
- `GET /sitemap/pages.xml` (`getSitemapPages`): static pages from `staticPages` in `shared/rules/frontend-links.yaml`. It has one `url` per active language, with `xhtml:link` alternates for every language and `x-default`, and no `lastmod`.
- `GET /sitemap/products-{page}.xml` (`getSitemapProducts`): one run of public products (active and not deleted), oldest id first, one `url` per active language with alternates and `x-default`.
  - `lastmod` is the product's `updatedAt`, which a translation edit also moves and a sale does not.
  - A run holds as many products as keep the file at or under 50,000 `url` entries.
  - The `page` path parameter is a required integer ≥ 1, matching the numbering the index lists. A number the index does not list returns `404`.
- `components.schemas.SitemapDocument`: a plain `string` schema for a sitemaps.org 0.9 `urlset` or `sitemapindex`, served as `application/xml` rather than JSON.

## Relationships
- No graph neighbors are recorded for this file, so no dependency-graph interactions are documented.

## Notes
- All operations set `security: []`, so they are public.
- Every `200` response carries `Cache-Control: public, max-age=3600`.
- The responses are XML, so clients should not expect JSON.
- The `404` response on the products endpoint is a `$ref` to the shared `NotFound` response in `shared/contracts/openapi.root.yaml`; the pages endpoint description refers to `staticPages` in `shared/rules/frontend-links.yaml`. Both are textual references in the file, not recorded graph dependencies.
