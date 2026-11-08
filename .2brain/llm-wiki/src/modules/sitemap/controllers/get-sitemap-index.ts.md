---
source: src/modules/sitemap/controllers/get-sitemap-index.ts
sha256: 916e44d1e7c2e203fa9cc8393193937f78817e5e118050c7b237c0c998967e58
generated_at: 2026-11-08T08:21:53.427897+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/get-sitemap-index.ts

## Purpose

Express handler for `GET /sitemap/index.xml`. It retrieves the list of sitemap files from the sitemap service and streams a Sitemap Index XML document back to the client — the top-level file that `robots.txt` points to and that references the individual per-page sitemaps.

## Key elements

- **`getSitemapIndex`** (exported) — Express route handler `(req, res)`. Calls `sitemapService.listFiles()`, then passes the resulting file list to `sendXml` wrapped in a `SitemapIndexStream`. Errors are forwarded to `catchAs(response, 'getSitemapIndex')`.
- **`SitemapIndexStream`** (imported from `sitemap`) — a writable stream that emits the `<sitemapindex>` XML envelope. It receives the array of file descriptors produced by the service.

## Relationships

- **`src/modules/sitemap/service.ts`** — `getSitemapIndex` calls `sitemapService.listFiles()` to obtain the array of sitemap file descriptors that populate the index.
- **`src/modules/sitemap/controllers/send-xml.ts`** — `getSitemapIndex` delegates actual XML serialisation and the HTTP response write to the shared `sendXml` helper, passing the `SitemapIndexStream` as the stream argument.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, which the handler uses to convert a rejected Promise into a standardised error response.
- **`src/modules/sitemap/routes.ts`** — registers `getSitemapIndex` as the handler for the `GET /sitemap/index.xml` route.

## Notes

- The request parameter is intentionally unused (`_request`); the route carries no query or path params.
- The file is a `@module` (no default export) — consumers import the named `getSitemapIndex` symbol.
- The handler is a Promise chain, not an `async` function; `catchAs` is attached as the `.catch` continuation rather than wrapped in a `try/catch`.
