---
source: src/modules/sitemap/controllers/get-sitemap-index.ts
sha256: 916e44d1e7c2e203fa9cc8393193937f78817e5e118050c7b237c0c998967e58
generated_at: 2026-10-29T05:53:10.343360+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/get-sitemap-index.ts

## Purpose

Express handler for `GET /sitemap/index.xml` — the top-level sitemap index that lists all other sitemap files (shop pages + per-run product sitemaps). It delegates file discovery to the sitemap service and XML serialization to a shared helper.

## Key elements

- **`getSitemapIndex`** (exported const) — The only export. An Express handler that:
  1. Calls `sitemapService.listFiles()` to get the current list of sitemap files.
  2. Passes the result to `sendXml` along with a `SitemapIndexStream` (from the `sitemap` package) to produce the index document.
  3. Catches any rejection via `catchAs(response, 'getSitemapIndex')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, the project-standard error-catch wrapper for Express responses.
- **`src/modules/sitemap/controllers/send-xml.ts`** — Imports `sendXml`, which accepts an Express `Response`, a data array, and a stream, then writes the XML to the HTTP response.
- **`src/modules/sitemap/service.ts`** — Imports `sitemapService`; its `listFiles()` method returns the array of sitemap file descriptors that populate the index.
- **`src/modules/sitemap/routes.ts`** — Registers `getSitemapIndex` as the handler for the `GET /sitemap/index.xml` route.

## Notes

- The request parameter is prefixed with `_` (`_request`) because the endpoint accepts no input; only the service-side file list determines the output.
- Uses `SitemapIndexStream` (not `SitemapStream`), so the response is a `<sitemapindex>` document containing `<sitemap>` entries rather than individual `<url>` entries.
- Error handling follows the project's `catchAs` convention: a failed promise sends a standard error response keyed by the string `'getSitemapIndex'`.
