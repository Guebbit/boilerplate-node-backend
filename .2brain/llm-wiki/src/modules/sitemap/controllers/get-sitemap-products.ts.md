---
source: src/modules/sitemap/controllers/get-sitemap-products.ts
sha256: db6cb6700f84681b4ae5d88177a3b826621925bff0dd4e62fbadcea70417ed96
generated_at: 2026-11-08T08:22:09.329443+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/get-sitemap-products.ts

## Purpose

HTTP handler for `GET /sitemap/products-{page}.xml`. Validates the page number, fetches the corresponding product entries from the sitemap service, and streams them back as an XML sitemap document. Returns 404 for invalid page numbers or pages the index does not contain.

## Key elements

- **`PAGE_NUMBER`** (regex) — `^[1-9]\d*$`; enforces a positive whole number with no sign, no leading zeros, no padding. Used as a gate before any service call.
- **`getSitemapProducts`** (exported function) — Express route handler. Accepts `{ page: string }` in `request.params`. On a valid page it calls `sitemapService.listProducts(page)`; if the result is falsy it sends 404; otherwise it pipes the entries through `sendXml` using a `SitemapStream`. Errors are funneled into `catchAs`.

## Relationships

- **`src/modules/sitemap/service.ts`** — `sitemapService.listProducts(n)` is the sole data source for the entries this controller serializes.
- **`src/modules/sitemap/controllers/send-xml.ts`** — `sendXml(response, entries, stream)` performs the actual XML write to the HTTP response.
- **`src/infrastructure/http/controller.ts`** — `catchAs` wraps the promise rejection path into a structured error response.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` sends the 404 (and any error-status) HTTP responses.
- **`src/modules/sitemap/routes.ts`** — registers this handler on the `/sitemap/products-:page.xml` route.

## Notes

- Page `"0"` is **not** valid; the regex requires the first digit to be `1–9`, so the lowest addressable page is `1`.
- A `null`/`undefined` return from `listProducts` is indistinguishable from a missing page and yields the same 404 — there is no separate "empty page" vs. "no page" branch.
- The handler returns `void` on the early-404 paths but returns the promise chain on the success path; callers in Express do not rely on the return value, but it means the function is not a uniform `Promise`-returning handler.
