---
source: src/modules/sitemap/tests/integration/sitemap.test.ts
source_sha256: d1eb90428567aa05e0e492f784b7e496ed2433036f7692abda8b73dbfd9ed289
context_sha256: 9e210a7994b8e818954e0051fdb1fa69c73fffdab72160ce7185a92b9dee196f
generated_at: 2026-11-22T07:49:55.219066+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/tests/integration/sitemap.test.ts

## Purpose
Integration tests for the sitemap HTTP endpoints, run against the real registered modules and a test database. They cover the index and the files it names, which products are listed, one entry per language with alternates, `lastmod`, splitting at the file limit, and the 404 for files the index does not list. The file's header points to the "the-files" section of the sitemap module's docs.

## Key elements
- **`beforeEach` setup**: calls `setupTestDb()` at module level. Before each case it runs `resetServedLanguages()` and `resetDomainEvents()`, then `registerModules(enabledModules)`.
- **`FRONTEND`**: `http://localhost:8080`, the origin used in page and product URLs. Index entries point at `http://localhost:3000`.
- **`entriesOf(path)`**: GETs a sitemap file, asserts 200, and parses it with `parseSitemap`. Malformed XML makes it fail.
- **`filesOf()`**: GETs `/sitemap/index.xml`, asserts 200, and returns the listed URLs via `parseSitemapIndex`.
- **`lastmodOf()`**: returns the first `lastmod` of `products-1.xml` as a timestamp.
- **`GET /sitemap/index.xml` tests**:
  - Lists `pages.xml` first, then `products-1.xml`, with `application/xml` and `cache-control: public, max-age=3600`.
  - Lists only `pages.xml` when the catalogue is empty.
- **`GET /sitemap/pages.xml` test**:
  - Each static page appears once per active language (`en`, `it`) with alternates and `x-default`.
  - The file has 16 URLs in total.
  - No `lastmod` is set on any entry.
- **`GET /sitemap/products-{page}.xml` tests**:
  - A public product gets one entry per language, with alternates and its `updatedAt` as `lastmod`.
  - A stock change (a receive through the inventory service) does not change `lastmod`.
  - Inactive products and soft-deleted products are left out.
  - With `NODE_SITEMAP_URL_LIMIT=4`, five products split into three files. The index lists four files, and the product files hold 4, 4 and 2 entries. The limit counts each language's URL.
  - Pages `2`, `0`, `01`, `abc`, `-1` and `99999999999999999999` return 404 when the index does not list them.

## Relationships
- `tests/support/setup-test-db.ts`, `tests/support/http.ts` (`api()`), `tests/support/environment.ts` (`withEnvironmentOverrides`) and `tests/support/callers.ts` (`testCallerContext`) supply the DB, the HTTP client, env overrides and the caller context.
- `src/modules/products/tests/factories.ts` provides `createProduct` and `readProduct` to seed and read products.
- `src/modules/inventory/index.ts` provides `inventoryService`, used to receive stock without touching `updatedAt`.
- `src/infrastructure/i18n/index.ts` provides `resetServedLanguages`.
- `src/kernel/events.ts` provides `resetDomainEvents`.
- `src/kernel/registry.ts` provides `registerModules`.
- `src/modules.ts` provides `enabledModules`, imported by relative path.

## Notes
- The served-language list lives in process memory, so it is reset before every case to stop languages leaking between tests.
- The `lastmod` stock test waits 20 ms before receiving stock. That way a changed `updatedAt` would show up as a different timestamp.
- The split test is wrapped in `withEnvironmentOverrides`, so the lowered limit applies only to that case.
