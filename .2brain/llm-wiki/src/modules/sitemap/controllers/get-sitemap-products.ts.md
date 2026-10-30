---
source: src/modules/sitemap/controllers/get-sitemap-products.ts
sha256: db6cb6700f84681b4ae5d88177a3b826621925bff0dd4e62fbadcea70417ed96
generated_at: 2026-10-29T05:53:25.916938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/get-sitemap-products.ts

## Purpose

Express GET handler for `/sitemap/products-{page}.xml`. Validates the page-number path parameter, fetches that page's product entries from the sitemap service, and streams them back as an XML sitemap response.

## Key elements

- **`PAGE_NUMBER`** (const) — Regex `/^[1-9]\d*$/` used to enforce that the `:page` param is a positive integer with no sign, padding, or leading zeros.
- **`getSitemapProducts(request, response)`** (exported) — The route handler. Returns early with a 404 if the page param fails the regex or the service returns no entries; otherwise delegates to `sendXml` with a fresh `SitemapStream`.

## Relationships

- **`src/modules/sitemap/routes.ts`** — Registers `getSitemapProducts` as the handler for the `GET /sitemap/products-:page.xml` route.
- **`src/modules/sitemap/service.ts`** — Provides `sitemapService.listProducts(page)`, the data source for the entries returned by this handler.
- **`src/modules/sitemap/controllers/send-xml.ts`** — `sendXml(response, entries, stream)` performs the actual XML serialization and writes the response.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the error-boundary wrapper used in the `.catch()` branch.
- **`src/infrastructure/http/response.ts`** — Supplies `rejectResponse`, used to short-circuit with a 404 (invalid page or missing data).

## Notes

- Two distinct 404 paths exist: malformed `:page` (regex fail) and a valid page number for which the service returns a falsy value. Both bypass the service/stream pipeline entirely.
- The handler returns the promise chain directly (no `async/await`), so Express sees the returned promise and will surface unhandled rejections through the `.catch(catchAs(...))` branch.
- `SitemapStream` is instantiated per-request inside the handler rather than reused, so each response gets its own stream.
