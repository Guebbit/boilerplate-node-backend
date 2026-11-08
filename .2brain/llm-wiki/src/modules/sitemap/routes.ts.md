---
source: src/modules/sitemap/routes.ts
sha256: a87504c31905b35f6299197bf786206c625f77e927fb14a4f4baa0227ee536a4
generated_at: 2026-11-08T08:22:49.847685+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/routes.ts

## Purpose

Defines the Express route table for the public sitemap endpoints. It wires URL paths to their respective controllers and is intentionally unauthenticated—the sitemap only exposes URLs any anonymous visitor can already reach.

## Key elements

- **`router`** (exported) — An Express `Router` instance. This is the sole export of the file; the parent module mounts it.
- **`GET /index.xml`** — Delegates to `getSitemapIndex`.
- **`GET /pages.xml`** — Delegates to `getSitemapPages`.
- **`GET /products-:page.xml`** — Delegates to `getSitemapProducts`. The `:page` param is expected to be a positive whole number; the controller itself rejects anything else.

## Relationships

- **`controllers/get-sitemap-index.ts`** — Provides the `getSitemapIndex` handler bound to `/index.xml`.
- **`controllers/get-sitemap-pages.ts`** — Provides the `getSitemapPages` handler bound to `/pages.xml`.
- **`controllers/get-sitemap-products.ts`** — Provides the `getSitemapProducts` handler bound to `/products-:page.xml`; performs the positive-integer validation on the `:page` param.
- **`module.ts`** — Registers this file's `router` (likely under a `/sitemap` prefix) so the three routes become reachable on the application.

## Notes

- The `:page` segment is a **path parameter**, not a query string. The XML extension is part of the literal path segment, so a request must end in `.xml` to match.
- No auth middleware is applied here or imported; security is by convention (the doc comment) rather than by a guard.
- The file contains no business logic—only path-to-handler mapping. Validation, XML generation, and error responses all live in the controllers.
