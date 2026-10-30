---
source: src/modules/sitemap/service.ts
sha256: fca7293566ef9bf3fd269ec45935ae50bd4b6b05b6391d4e5a8c4429b2eaf92d
generated_at: 2026-10-29T05:54:06.378402+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/service.ts

## Purpose

Pure read-side logic for generating XML sitemap content. It answers three questions—*which files the index lists, what the pages file contains, and what a given products file contains*—by reading the live product catalogue and the served-locale list on every call. Nothing is persisted here; the HTTP layer is free to cache the results.

## Key elements

- **`sitemapService`** (exported) — the only public surface. Three async methods:
  - `listFiles()` — returns absolute URLs (on the API origin) for `pages.xml` and one `products-N.xml` per page.
  - `listPages()` — expands `STATIC_PAGES` into one `SitemapItemLoose` per served language, each carrying hreflang alternates + `x-default`. No `lastmod`.
  - `listProducts(page)` — fetches a slice of public products from the catalogue, expands each into per-language entries with `lastmod` from the product's `updatedAt`. Returns `null` for an out-of-range page.
- **`servedLanguages()`** (internal) — assembles the sorted locale list and picks the `x-default` tag (the default locale if it is served, otherwise the first served one).
- **`pageAddress(language, path)`** (internal) — builds an absolute frontend URL from `NODE_FRONTEND_URL` + language segment + path. Deliberately *not* `frontendLink`, because a registered language must keep its own URL.
- **`entriesFor(languages, path, lastmod?)`** (internal) — produces the array of `SitemapItemLoose` objects (one per language) with the shared `links` block (all languages + `x-default`).
- **`productsPerFile(languageCount)`** (internal) — derives the per-file product count so that `count × languages` never exceeds `NODE_SITEMAP_URL_LIMIT`.
- **`Languages`** (internal interface) — `{ tags: string[]; fallback: string }` shape used by the helpers above.

## Relationships

- **`src/modules/sitemap/config.ts`** — supplies `STATIC_PAGES` (the list of page paths) and `sitemapConfig().NODE_SITEMAP_URL_LIMIT` (the per-file URL cap).
- **`src/modules/products/index.ts`** — re-exports `productService` (used for `countListed`, `listPublicPage`) and `productPagePath` (URL path for a product).
- **`src/infrastructure/http/config.ts`** — `siteConfig()` provides `NODE_FRONTEND_URL` (frontend origin) and `NODE_URL` (API origin for the index URLs).
- **`src/infrastructure/i18n/catalog.ts`** — `getDefaultLocale()` seeds the `x-default` selection.
- **`src/infrastructure/i18n/served.ts`** — `listServedLocales()` is the single source of truth for which languages appear in the sitemap.
- **Controllers** (`get-sitemap-index`, `get-sitemap-pages`, `get-sitemap-products`) — the only consumers; each calls one `sitemapService` method and serialises the result into XML.
- **`src/modules/sitemap/index.ts`** — barrel re-export so controllers can `import { sitemapService } from '@modules/sitemap'`.

## Notes

- `listProducts` returns `null` (not an empty array) when a page number exceeds the catalogue size; callers must handle that.
- `lastmod` on product entries reflects `updatedAt`, which a translation edit moves but a stock/sale change does not.
- The `x-default` hreflang target is guaranteed to be a URL that also appears as a regular `lang` entry in the same file, satisfying Google's requirement that it point to a listed page.
- `pageAddress` intentionally bypasses the i18n link helper to avoid silently rewriting an un-translated language tag to the default.
