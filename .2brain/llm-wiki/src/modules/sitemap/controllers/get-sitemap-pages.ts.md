---
source: src/modules/sitemap/controllers/get-sitemap-pages.ts
source_sha256: d084ed572ff900a463457bec1678d816b83fdb5c11cd8a00206f726202aa6b47
context_sha256: 15ea135da7acf6996b990d4a2d9a6885e45f565acf1fb7d6ebfb8aa1d3a51c1b
generated_at: 2026-11-22T07:48:23.435430+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/controllers/get-sitemap-pages.ts

## Purpose
Express controller that serves the shop's static pages as a sitemap XML document, with each page listed once per language. Its doc comment describes it as `GET /sitemap/pages.xml`.

## Key elements
- `getSitemapPages(_request, response)` — the only export. It calls `sitemapService.listPages()`, then passes the resulting entries and a new `SitemapStream` to `sendXml` to write the response. Rejections are handled by `catchAs(response, 'getSitemapPages')`.

## Relationships
- `src/modules/sitemap/service.ts` — exports `sitemapService`, whose `listPages()` supplies the sitemap entries.
- `src/modules/sitemap/controllers/send-xml.ts` — exports `sendXml`, which receives the response, the entries and the `SitemapStream`.
- `src/infrastructure/http/controller.ts` — exports `catchAs`, which provides the error handler. It receives the response and the label `'getSitemapPages'`.
- `src/modules/sitemap/routes.ts` — not imported by this file. The route registration is presumably there, but that is not visible in this file.

## Notes
- The handler uses a promise chain with `.then`/`.catch` instead of `async`/`await`.
- The request argument is unused, so the output does not depend on query parameters or headers.
- Each call creates a new `SitemapStream`.
