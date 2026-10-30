---
source: src/modules/sitemap/routes.ts
sha256: a87504c31905b35f6299197bf786206c625f77e927fb14a4f4baa0227ee536a4
generated_at: 2026-10-29T05:53:53.823917+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/routes.ts

## Purpose

Defines the Express route table for the public, unauthenticated sitemap endpoints. It maps three GET paths to their respective controllers so the module can expose XML sitemaps to crawlers.

## Key elements

- **`router`** (exported `Router`) — The single export. An Express router with three GET routes:
  - `GET /index.xml` → `getSitemapIndex`
  - `GET /pages.xml` → `getSitemapPages`
  - `GET /products-:page.xml` → `getSitemapProducts` (the `:page` param is validated downstream to a positive whole number)

## Relationships

- **`controllers/get-sitemap-index.ts`** — Imports `getSitemapIndex` and binds it to `/index.xml`.
- **`controllers/get-sitemap-pages.ts`** — Imports `getSitemapPages` and binds it to `/pages.xml`.
- **`controllers/get-sitemap-products.ts`** — Imports `getSitemapProducts` and binds it to `/products-:page.xml`.
- **`module.ts`** — Expected consumer that mounts this `router` under a base path (e.g. `/sitemap`) to complete the module's Express app wiring.

## Notes

- No middleware (auth, rate-limit, logging) is applied at this level; the file intentionally exposes only data that is already publicly reachable.
- The `products-:page.xml` param validation lives in the controller, not in a route guard. Adding middleware here would change that contract.
