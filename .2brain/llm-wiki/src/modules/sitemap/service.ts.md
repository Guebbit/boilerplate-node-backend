---
source: src/modules/sitemap/service.ts
source_sha256: 2decb3a0002e365f4d17ba52c2a8b0351b99984ee28733435870f560d5881c70
context_sha256: 6030c1190c1494c27d988b8dd6e1cf39096a5e8126d5a584d390cc46d9a2252b
generated_at: 2026-11-22T07:49:29.956537+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/service.ts

## Purpose
Implements the sitemap's read side: which sitemap files exist and what each one lists. For every page it emits one `<url>` per served language, each carrying `hreflang` alternates for all languages plus `x-default`, so crawlers learn the translations from the sitemap alone. Nothing is stored. Every call reads the live catalogue, which is why the HTTP layer may cache responses.

## Key elements
- `sitemapService` (the only export), an object with three methods:
  - `listFiles()` returns absolute URLs on the API's own origin (`NODE_URL` with trailing slashes stripped). It returns `/sitemap/pages.xml` followed by `/sitemap/products-N.xml` (1-based). The number of product files is `ceil(listed products / productsPerFile)`.
  - `listPages()` returns the `STATIC_PAGES` entries, once per language, with no `lastmod`.
  - `listProducts(page)` returns one run of public products, once per language, dated by the product's `updatedAt`. It returns `null` if the page is past the last file or the page query comes back empty.
- `servedLanguages()` (internal) builds the language list: the served locales sorted alphabetically, plus a `fallback` tag. The fallback is the default locale if it is served, otherwise the first served locale.
- `pageAddress(language, path)` (internal) builds `${NODE_FRONTEND_URL}/${language}[/path]`. An empty path is the home page.
- `entriesFor(languages, path, lastmod?)` (internal) builds the `SitemapItemLoose[]` for one page. It creates one entry per language, each sharing the same `links` array (every language plus `x-default`). `lastmod` is added as an ISO string only when given.
- `productsPerFile(languageCount)` (internal) computes `max(1, floor(NODE_SITEMAP_URL_LIMIT / languageCount))`, so a file never exceeds the URL ceiling however many languages are served.

## Relationships
- `@infrastructure/http/config` (`siteConfig`) supplies `NODE_FRONTEND_URL` for page addresses and `NODE_URL` for file addresses.
- `@infrastructure/i18n` supplies `listServedLocales` and `getDefaultLocale`. This is the same list language negotiation uses.
- `@modules/products` supplies the product count and paged public product queries via `productService`, plus `productPagePath(id)` for each product's path.
- `./config` supplies `STATIC_PAGES` and `sitemapConfig()` (`NODE_SITEMAP_URL_LIMIT`).
- The sitemap controllers (`get-sitemap-index`, `get-sitemap-pages`, `get-sitemap-products`) and `src/modules/sitemap/index.ts` sit on the consuming side of this service.

## Notes
- It deliberately does not use `frontendLink`. That helper swaps a language the API doesn't serve for the fallback, but here a registered language must keep its own address.
- `x-default` falls back to the first served language when the default isn't served. A `hreflang` target must be a page the same sitemap lists.
- Requires no `locales` module. A deployment without one serves the deployed dictionaries plus the fallback language.
- `listProducts` checks the page number against the listed-product count before querying, so the query's `skip` is bounded by the catalogue size and not by what the caller typed.
- `updatedAt` moves on a translation edit but not on a sale, because stock lives in `inventory`.
- Because the URL limit is divided across languages, adding a language shrinks the products per file and can increase the number of files.
