---
source: src/modules/sitemap/controllers/get-sitemap-products.ts
generated_at: 2026-11-22T07:48:34.556193+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/controllers/get-sitemap-products.ts

## Purpose
Express controller for `GET /sitemap/products-{page}.xml`. It serves one numbered page of the public product catalogue as a sitemap XML file, as listed by the sitemap index. Any file name the index would not list returns 404.

## Key elements
- `getSitemapProducts(request, response)` — the exported handler.
  - Validates `request.params.page`. It must match `PAGE_NUMBER` (`/^[1-9]\d*$/`: positive whole number, no sign, no leading zeros) and convert to a safe integer. Otherwise it responds 404 via `rejectResponse`.
  - Calls `sitemapService.listProducts(page)`. A falsy result produces a 404. Otherwise it calls `sendXml(response, entries, new SitemapStream())`.
  - Rejections from the service are handled by `.catch(catchAs(response, 'getSitemapProducts'))`.
- `PAGE_NUMBER` — module-private regex for the page format.

## Relationships
- `src/modules/sitemap/service.ts` — supplies the entries for the requested page through `sitemapService.listProducts`. A falsy return means the page doesn't exist.
- `src/modules/sitemap/controllers/send-xml.ts` — `sendXml` serializes the entries through a `SitemapStream` and writes the XML response.
- `src/infrastructure/http/response.ts` — `rejectResponse` sends the 404 responses.
- `src/infrastructure/http/controller.ts` — `catchAs` builds the error handler for failed service calls, labelled `'getSitemapProducts'`.
- `src/modules/sitemap/routes.ts` — the route that mounts this handler (only inferred from the neighbor graph and the `:page` route param; the file itself doesn't show the wiring).

## Notes
- The safe-integer check exists because a very long digit string would otherwise reach the database as a huge `skip`.
- On a validation failure the handler returns `undefined` synchronously. On the happy path it returns the promise chain.
- A 404 is used for both malformed page numbers and pages beyond the catalogue. Neither case returns a 400.
