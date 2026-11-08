---
source: src/modules/sitemap/controllers/get-sitemap-pages.ts
sha256: d084ed572ff900a463457bec1678d816b83fdb5c11cd8a00206f726202aa6b47
generated_at: 2026-11-08T08:22:00.405496+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/get-sitemap-pages.ts

## Purpose

Controller handler for `GET /sitemap/pages.xml`. It fetches the shop's static pages (one entry per language) from the sitemap service and sends them back as an XML sitemap. It exists to isolate the HTTP-level concerns (request/response, error formatting) from the business logic in the service layer.

## Key elements

- **`getSitemapPages(request, response)`** — The sole export. Calls `sitemapService.listPages()`, pipes the resulting entries through `sendXml` with a `SitemapStream` instance, and delegates any rejection to `catchAs(response, 'getSitemapPages')`.

## Relationships

- **`src/modules/sitemap/service.ts`** — Provides `sitemapService.listPages()`, the data source for the page entries.
- **`src/modules/sitemap/controllers/send-xml.ts`** — Provides `sendXml(response, entries, stream)`, which serializes entries into XML and writes the response.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, a shared error-catch wrapper that formats HTTP error responses with a labelled tag.
- **`src/modules/sitemap/routes.ts`** — Consumes `getSitemapPages` and binds it to the `GET /sitemap/pages.xml` route.

## Notes

- The `request` parameter is intentionally unused (prefixed `_`); only `response` is needed.
- A **new** `SitemapStream()` is instantiated per request and handed to `sendXml`; the stream is not managed or closed here.
- Follows the project's controller convention: a single `.then/.catch` chain with `catchAs` as the error handler rather than a `try/catch` or Express async-wrapper.
