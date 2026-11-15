---
source: src/modules/sitemap/tests/integration/sitemap.test.ts
sha256: 0fe97ad3b0edeec7c07ce80a29f5dc8a10582e7239072fa5d7df4930de5e25ad
generated_at: 2026-11-14T22:00:48.576598+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/tests/integration/sitemap.test.ts

## Purpose

Integration test that exercises the full sitemap HTTP surface with real modules registered. It verifies the sitemap index, the pages file, and the products files: correct entries per language, `x-default` alternates, `lastmod` semantics, the URL-limit file split, and 404 for unlisted pages.

## Key elements

- **`givenServedLocale`** — wraps `givenLocale` (from locales test factories) and then calls `refreshLocaleOverrides()` so the in-memory served-language list reflects the newly created row.
- **`entriesOf(path)`** — GETs a sitemap file, asserts 200, and parses the body with `parseSitemap` (fails on malformed XML). Returns the parsed entries.
- **`filesOf()`** — GETs `/sitemap/index.xml`, asserts 200, parses with `parseSitemapIndex`, and returns the list of child URLs.
- **`lastmodOf()`** — convenience: reads the first entry of `products-1.xml` and returns its `lastmod` as a millisecond timestamp.
- **`beforeEach`** — resets served languages, domain events, and re-registers `enabledModules` before every test.
- **`describe('GET /sitemap/index.xml')`** — checks content-type, cache-control headers, file ordering (pages first, then products runs), and empty-catalogue case.
- **`describe('GET /sitemap/pages.xml')`** — verifies per-language entries, alternates, x-default resolution (including when the default locale is inactive), exclusion of deactivated languages, and inclusion of newly activated ones.
- **`describe('GET /sitemap/products-{page}.xml')`** — verifies per-language product entries, `lastmod` tracking `updatedAt`, `lastmod` update on translation edit, `lastmod` stability on stock change, exclusion of hidden/deleted products, file splitting at `NODE_SITEMAP_URL_LIMIT`, and 404 for unlisted page numbers (parameterized with invalid values).

## Relationships

- **`src/modules.ts`** — provides `enabledModules`, the array passed to `registerModules` in `beforeEach`.
- **`src/kernel/registry.ts`** — `registerModules` is called to wire the sitemap module (and others) into the running kernel for each test.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears accumulated domain events between tests.
- **`src/infrastructure/i18n/index.ts`** — re-exports `refreshLocaleOverrides` and `resetServedLanguages`, both used to set up/clean the served-language state.
- **`src/modules/locales/index.ts`** — exports `localeService`, used to create languages and update entity translations mid-test.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` inserts a locale row; wrapped by the local `givenServedLocale` helper.
- **`src/modules/inventory/services/index.ts`** — defines `inventoryService`, whose stock-receipt method is called to assert that a stock change does not alter `lastmod`; accessed via the barrel at `src/modules/inventory/index.ts`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` and `readProduct` seed and inspect catalogue rows.
- **`tests/support/http.ts`** — `api` provides the HTTP client used by `entriesOf`, `filesOf`, and direct status assertions.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` temporarily sets `NODE_DEFAULT_LOCALE` and `NODE_SITEMAP_URL_LIMIT` for specific tests.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the actor context required by the inventory service call.

## Notes

- The served-language list lives in process memory, so `resetServedLanguages()` must run in `beforeEach` or prior tests leak languages into later ones.
- `givenLocale` only writes the database row; the in-memory served list is updated separately by `refreshLocaleOverrides`. Forgetting that step produces a locale row that the sitemap does not see.
- The `lastmod` "moves on translation edit" test inserts a 20 ms sleep because `updatedAt` has millisecond resolution; without it the before/after values can be identical.
- The file-split test overrides `NODE_SITEMAP_URL_LIMIT` to 4 and creates 5 products × 2 languages = 10 URLs, expecting 3 product files (4 + 4 + 2).
- The 404 test is parameterized over a mix of out-of-range and non-numeric page numbers (`'0'`, `'01'`, `'abc'`, `'99999999999999999999'`) to guard against accidental parsing.
