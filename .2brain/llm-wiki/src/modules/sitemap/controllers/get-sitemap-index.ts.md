---
source: src/modules/sitemap/controllers/get-sitemap-index.ts
source_sha256: 916e44d1e7c2e203fa9cc8393193937f78817e5e118050c7b237c0c998967e58
context_sha256: 15ea135da7acf6996b990d4a2d9a6885e45f565acf1fb7d6ebfb8aa1d3a51c1b
generated_at: 2026-11-22T07:48:14.834826+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/controllers/get-sitemap-index.ts

## Purpose
Express controller for `GET /sitemap/index.xml`. This is the sitemap index that `robots.txt` points to. It lists the other sitemap files: the shop pages file and one file per run of products.

## Key elements
- `getSitemapIndex(_request, response)`: the exported request handler. It calls `sitemapService.listFiles()`, then passes the result to `sendXml` together with a new `SitemapIndexStream` from the `sitemap` package. Any rejection is handled by `catchAs(response, 'getSitemapIndex')`.

## Relationships
- `src/modules/sitemap/service.ts` (`sitemapService`): `listFiles()` supplies the list of sitemap files to include in the index.
- `src/modules/sitemap/controllers/send-xml.ts` (`sendXml`): writes the XML response, given the response object, the file list and the stream.
- `src/infrastructure/http/controller.ts` (`catchAs`): builds the error handler for the promise chain, labelled `'getSitemapIndex'`.
- `src/modules/sitemap/routes.ts`: the file where this handler is wired to a route. The route definition is not visible in this file.

## Notes
- The request argument is unused (`_request`).
- The handler returns a promise chain and does not use `async`/`await`.
- Errors are not handled in this file. They are delegated to `catchAs`.
