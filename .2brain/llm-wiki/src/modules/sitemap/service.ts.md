---
source: src/modules/sitemap/service.ts
sha256: fca7293566ef9bf3fd269ec45935ae50bd4b6b05b6391d4e5a8c4429b2eaf92d
generated_at: 2026-11-08T08:23:00.747566+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/service.ts

## Purpose

Read-only service that produces the three kinds of data a sitemap needs: the list of XML files the index references, the per-language entries for static pages, and the per-language entries for paginated product listings. Every call reads the live catalogue and served-locale list at invocation time, so the HTTP layer is free to cache the result.

## Key elements

- **`sitemapService`** (exported) — the sole public API object with three methods:
  - **`listFiles()`** — returns absolute URLs for `pages.xml` and each `products-N.xml` file, computed from the product count divided by `productsPerFile`.
  - **`listPages()`** — returns `SitemapItemLoose[]` for every entry in `STATIC_PAGES`, one item per served language, with full `links` alternates. No `lastmod` (nothing dates static pages).
  - **`listProducts(page)`** — returns `SitemapItemLoose[]` for one page of public products (1-based), using each product's `updatedAt` as `lastmod`. Returns `null` when the catalogue has no such page.
- **`servedLanguages()`** (internal) — resolves the current served-locale tags (sorted) and the `x-default` fallback tag.
- **`pageAddress(language, path)`** (internal) — builds an absolute frontend URL from `NODE_FRONTEND_URL` + language + path. Deliberately *not* `frontendLink`, because a registered language must keep its own address.
- **`entriesFor(languages, path, lastmod?)`** (internal) — emits one `SitemapItemLoose` per language, each carrying the full `links` array (all languages + `x-default`).
- **`productsPerFile(languageCount)`** (internal) — derives the per-file URL ceiling so that `productCount × languageCount` never exceeds `NODE_SITEMAP_URL_LIMIT`.
- **`Languages`** interface (internal) — `{ tags: string[]; fallback: string }`.

## Relationships

- **`src/modules/sitemap/config.ts`** — supplies `STATIC_PAGES` (the page paths to enumerate) and `sitemapConfig()` (the URL limit used to size product files).
- **`src/modules/products/index.ts`** → **`src/modules/products/services/index.ts`** — provides `productService` (`countListed`, `listPublicPage`) and `productPagePath` for building product URLs.
- **`src/infrastructure/i18n/served.ts`** — `listServedLocales()` gives the live set of languages to emit entries for.
- **`src/infrastructure/i18n/catalog.ts`** — `getDefaultLocale()` seeds the `x-default` fallback tag.
- **`src/infrastructure/http/config.ts`** — `siteConfig()` provides `NODE_FRONTEND_URL` (frontend origin) and `NODE_URL` (API origin for file URLs).
- **`src/modules/sitemap/controllers/*`** — the three controllers (`get-sitemap-index`, `get-sitemap-pages`, `get-sitemap-products`) are the only consumers of `sitemapService`.
- **`src/modules/sitemap/index.ts`** — re-exports `sitemapService` to the rest of the module.

## Notes

- `listPages` and `listProducts` are async (return `Promise`) even though the core logic is synchronous; this keeps the call-site signature uniform and allows the product path to `await` the catalogue.
- The `links` array on every entry always includes an explicit `x-default` entry whose URL points at the fallback language — a valid hreflang target that the same sitemap must also list.
- `productsPerFile` floors to a minimum of 1, so a single-language deployment still paginates by the raw URL limit.
- `lastmod` on products reflects `updatedAt` (content/translation changes); inventory/sale changes intentionally do *not* bump it.
