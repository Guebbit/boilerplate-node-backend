---
source: src/modules/sitemap/tests/integration/sitemap.test.ts
sha256: e281472b56324611343346da472088f4919962e70051347e836f7dcab9717c53
generated_at: 2026-11-08T08:23:25.104453+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/tests/integration/sitemap.test.ts

## Purpose

Integration test that exercises the full sitemap HTTP surface (`/sitemap/index.xml`, `/sitemap/pages.xml`, `/sitemap/products-{n}.xml`) with real modules registered against a test database. It verifies URL enumeration per active language, hreflang alternates and `x-default`, `lastmod` semantics for products, file splitting at the configured limit, and 404 handling for unlisted files.

## Key elements

- **`givenServedLocale`** – Wraps `givenLocale` with a `refreshLocaleOverrides()` call so the in-process served-language list reflects the newly written row.
- **`FRONTEND`** (`'http://localhost:8080'`) – The origin that page/product URLs should point at.
- **`entriesOf(path)`** – GETs a sitemap file, asserts 200, parses the XML with `sitemap`'s `parseSitemap`, and returns typed entries.
- **`filesOf()`** – GETs `/sitemap/index.xml`, parses it as a sitemap index, and returns the list of child URLs.
- **`lastmodOf()`** – Shorthand to read the first entry's `lastmod` from `products-1.xml` as a millisecond timestamp.
- **`describe('GET /sitemap/index.xml')`** – Asserts content-type, cache-control header, file ordering (pages first, then numbered product files), and empty-catalogue case.
- **`describe('GET /sitemap/pages.xml')`** – Verifies per-language entries, hreflang links (including `x-default`), absence of `lastmod` on prose pages, deactivation of languages, and that newly active languages appear while inactive ones do not.
- **`describe('GET /sitemap/products-{page}.xml')`** – Covers per-language product URLs, `lastmod` tied to `updatedAt`, `lastmod` changing on translation edits but not on stock changes, exclusion of hidden/deleted products, file splitting honouring `NODE_SITEMAP_URL_LIMIT` per language, and 404 for non-listed page numbers.

## Relationships

- **`src/modules/locales/tests/factories.ts`** – Provides `givenLocale` (writes a language row) used by the `givenServedLocale` helper.
- **`src/modules/locales/index.ts`** – Exports `localeService` used to create languages and update entity translations.
- **`src/modules/products/tests/factories.ts`** – Exports `createProduct` / `readProduct` for seeding and asserting product state.
- **`src/modules/inventory/index.ts`** – Exports `inventoryService.receive` to verify that stock changes do not alter `lastmod`.
- **`src/infrastructure/i18n/index.ts`** – Exports `refreshLocaleOverrides`, called after each locale write to sync the served list.
- **`src/infrastructure/i18n/served.ts`** – Exports `resetServedLanguages`, called in `beforeEach` to clear process-memory state between tests.
- **`src/kernel/registry.ts`** – Exports `registerModules`, invoked in `beforeEach` to wire the real module graph.
- **`src/kernel/events.ts`** – Exports `resetDomainEvents` for per-test isolation.
- **`src/modules.ts`** – Exports `enabledModules`, the array passed to `registerModules`.
- **`tests/support/http.ts`** – Exports the `api()` test HTTP client.
- **`tests/support/environment.ts`** – Exports `withEnvironmentOverrides` to temporarily change `NODE_DEFAULT_LOCALE` / `NODE_SITEMAP_URL_LIMIT`.
- **`tests/support/callers.ts`** – Exports `testCallerContext` for the inventory `receive` call.

## Notes

- `givenServedLocale` exists because `givenLocale` only writes the DB row; the served-language list lives in process memory and is only updated by the overlay refresh that a real language-write handler would trigger. Forgetting this call would leave the sitemap unaware of the new language.
- The `lastmod` "translation edit" test inserts a 20 ms sleep to guarantee the millisecond-resolution `updatedAt` advances; without it the assertion is flaky.
- File-splitting math counts URLs **per language**: with 2 languages and a limit of 4, each file holds at most 2 products (2 × 2 = 4 URLs).
- The 404 test uses `it.each` with edge-case page numbers (`'01'`, `'abc'`, `'-1'`) to confirm the handler rejects any file not present in the index, not just out-of-range integers.
