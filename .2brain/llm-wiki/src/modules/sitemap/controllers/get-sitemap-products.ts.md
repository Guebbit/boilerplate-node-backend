---
source: src/modules/sitemap/controllers/get-sitemap-products.ts
sha256: 6202541f03a256bf35ee3d3253cf313c9b3e5b8d00b2069e1961538eeab6a043
generated_at: 2026-11-14T21:59:36.559079+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/get-sitemap-products.ts

## Purpose

HTTP controller that handles `GET /sitemap/products-{page}.xml`. It validates the page number, fetches the corresponding catalogue slice from the sitemap service, and streams the result as an XML sitemap response. It exists to isolate the request-parsing/validation logic from the service and the XML serialization.

## Key elements

- **`PAGE_NUMBER`** — Module-level regex (`/^[1-9]\d*$/`) enforcing a positive integer with no sign, leading zeros, or padding. Used before numeric conversion.
- **`getSitemapProducts`** *(exported)* — Express handler. Validates `request.params.page` against `PAGE_NUMBER` and `Number.isSafeInteger`; calls the service to list products for that page; on a successful non-null result delegates to `sendXml`; on missing data or invalid input sends a 404 via `rejectResponse`; on thrown errors delegates to `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, which wraps `.catch` to log and emit a standard error response.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse`, used to short-circuit with a 404 (invalid page or no entries).
- **`src/modules/sitemap/service.ts`** — Source of product data; the controller imports `sitemapService` and calls its `listProducts` method to retrieve entries for the given page.
- **`src/modules/sitemap/controllers/send-xml.ts`** — `sendXml(response, entries, stream)` serializes the entries into an XML sitemap and writes them to the response.
- **`src/modules/sitemap/routes.ts`** — Registers this handler as the GET controller for the products-sitemap route.

## Notes

- Validation is deliberately strict: `"01"`, `"-1"`, `"1.0"`, and empty strings all produce a 404 before any DB call. The `Number.isSafeInteger` guard prevents a digit-string exceeding 2⁵³ from reaching the database as an absurd `skip` offset.
- The handler uses a promise chain (`.then`/`.catch`) rather than `async/await`; the 404 branches return `undefined`, which Express ignores.
- The `SitemapStream` instance is created inline per request rather than shared, so each response builds its own stream.
