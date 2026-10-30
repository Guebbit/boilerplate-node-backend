---
source: src/modules/sitemap/controllers/get-sitemap-pages.ts
sha256: d084ed572ff900a463457bec1678d816b83fdb5c11cd8a00206f726202aa6b47
generated_at: 2026-10-29T05:53:17.426322+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/get-sitemap-pages.ts

## Purpose

Express controller that serves `GET /sitemap/pages.xml`. It fetches the shop's static pages from the sitemap service, serializes them into an XML sitemap via a `SitemapStream`, and writes the XML to the HTTP response.

## Key elements

- **`getSitemapPages`** (exported) — Request handler for the pages sitemap endpoint. Calls `sitemapService.listPages()`, then hands the entries to `sendXml` with a fresh `SitemapStream`. Catches errors through `catchAs(response, 'getSitemapPages')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — imports `catchAs`, which converts a rejected promise into an HTTP error response tagged with the controller name.
- **`src/modules/sitemap/service.ts`** — imports `sitemapService` and calls `.listPages()` to obtain the page entries (URL + locale) that make up this sitemap.
- **`src/modules/sitemap/controllers/send-xml.ts`** — imports `sendXml`, which pipes the entries into the provided `SitemapStream`, serializes to XML, and sends the response.
- **`src/modules/sitemap/routes.ts`** — registers `getSitemapPages` as the handler for the `/sitemap/pages.xml` route.

## Notes

- The `request` parameter is intentionally unused (prefixed `_`); this endpoint takes no query params or body.
- Error handling is a single `.catch(catchAs(...))` at the tail of the promise chain rather than try/catch — the tag `'getSitemapPages'` will appear in the error payload for client-side correlation.
- A new `SitemapStream` instance is created on every request; nothing is cached or reused across calls.
