---
source: src/modules/sitemap/routes.ts
source_sha256: a87504c31905b35f6299197bf786206c625f77e927fb14a4f4baa0227ee536a4
context_sha256: 59b35e2912af5e075d599269c09cdffa69084e8cde8f99836cf1aaa18c6f47de
generated_at: 2026-11-22T07:49:12.967183+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/routes.ts

## Purpose
Defines the Express route table for the sitemap files. The routes are public and unauthenticated, publishing only addresses that anyone can already open.

## Key elements
- `router` — exported Express `Router` with three GET routes:
  - `/index.xml` → `getSitemapIndex`
  - `/pages.xml` → `getSitemapPages`
  - `/products-:page.xml` → `getSitemapProducts`

The comments in the file label these as `/sitemap/index.xml`, `/sitemap/pages.xml` and `/sitemap/products-1.xml`.

## Relationships
- Imports `getSitemapIndex` from `src/modules/sitemap/controllers/get-sitemap-index.ts`, `getSitemapPages` from `src/modules/sitemap/controllers/get-sitemap-pages.ts` and `getSitemapProducts` from `src/modules/sitemap/controllers/get-sitemap-products.ts`. Each is registered as the handler for one route.
- `src/modules/sitemap/module.ts` is a graph neighbor. The file itself shows no link to it, but the `/sitemap/` prefix in the comments suggests the router is mounted there.

## Notes
- `:page` in `/products-:page.xml` is a route parameter. The file's comment says `getSitemapProducts` refuses anything other than a positive whole number, so that validation is in the controller, not in this route.
- No authentication or other middleware is applied here.
