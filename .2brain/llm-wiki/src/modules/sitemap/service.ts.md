---
source: src/modules/sitemap/service.ts
sha256: ff474da917217e1c1a20a33340d08072654517187ddfaa60ca9dc198afc186ec
generated_at: 2026-11-14T22:00:14.003639+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/service.ts

## Purpose

The read layer for the sitemap module. It produces the list of sitemap XML files, the per-language page entries, and the per-page product entries — each entry carrying full `hreflang` alternates so a crawler learns every translation from the sitemap alone. It reads live data (product catalogue, static page list) on every call and performs no persistence, which is what lets the HTTP layer cache freely.

## Key elements

- **`sitemapService`** (exported) — the single public object consumed by the controllers.
  - `listFiles()` — returns absolute URLs of every sitemap file the index should list: one static-page file plus one file per product "run" (count derived from `productService.countListed()` ÷ `productsPerFile`).
  - `listPages()` — returns `SitemapItemLoose[]` for every entry in `STATIC_PAGES`, one per served language. No `lastmod` (pages are undated).
  - `listProducts(page)` — returns `SitemapItemLoose[]` for one product file (1-based), or `null` if the page number exceeds the catalogue. Uses `updatedAt` as `lastmod`.
- **`servedLanguages()`** (internal) — builds the `{ tags, fallback }` pair from the i18n infrastructure; `fallback` is the default locale if it is served, otherwise the first alphabetically sorted tag.
- **`pageAddress(language, path)`** (internal) — constructs an absolute frontend URL (`NODE_FRONTEND_URL` + language segment + path). Intentionally does **not** swap an unserved language to the fallback (unlike `frontendLink`).
- **`entriesFor(languages, path, lastmod?)`** (internal) — builds one `SitemapItemLoose` per language, each embedding the full alternates list plus an `x-default` entry.
- **`productsPerFile(languageCount)`** (internal) — computes the max products per XML file as `⌊NODE_SITEMAP_URL_LIMIT / languageCount⌋` (minimum 1), so the file never exceeds the URL ceiling regardless of language count.

## Relationships

- **`src/infrastructure/http/config.ts`** — imports `siteConfig` for `NODE_FRONTEND_URL` (page addresses) and `NODE_URL` (sitemap file URLs).
- **`src/infrastructure/i18n/index.ts`** — imports `listServedLocales` and `getDefaultLocale` to determine which languages appear in the sitemap and which tag `x-default` points at. (The index re-exports the helpers backed by `catalog.ts` and `served.ts`.)
- **`src/modules/products/index.ts`** — imports `productService` (count, list) and `productPagePath` to build product entries; these are re-exported from the products module barrel (backed by `services/index.ts` and `config.ts`).
- **`src/modules/sitemap/config.ts`** — imports `STATIC_PAGES` (the page list) and `sitemapConfig` (for `NODE_SITEMAP_URL_LIMIT`).
- **`src/modules/sitemap/controllers/get-sitemap-index.ts`** — calls `sitemapService.listFiles()`.
- **`src/modules/sitemap/controllers/get-sitemap-pages.ts`** — calls `sitemapService.listPages()`.
- **`src/modules/sitemap/controllers/get-sitemap-products.ts`** — calls `sitemapService.listProducts(page)`.
- **`src/modules/sitemap/index.ts`** — re-exports `sitemapService` for external consumers.

## Notes

- `pageAddress` deliberately does **not** fall back an unserved language (unlike the frontend-link helper); a registered language always keeps its own address in the sitemap.
- The `lastmod` on product entries reflects `updatedAt`, which a translation edit moves but a stock/sale change does not (stock lives in `inventory`).
- `listProducts` guards against out-of-range page numbers *before* issuing the page query, keeping `skip` bounded by the catalogue size rather than trusting the caller.
- `productsPerFile` floors to at least 1, so a deployment with more languages than the URL limit still emits one product per file.
