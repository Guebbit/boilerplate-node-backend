---
source: src/modules/sitemap/tests/contract/api.contract.test.ts
sha256: 441c080edb57a5e0bb22a3b0f75d5291dfa9768f485608ca19a99791c734d2c8
generated_at: 2026-11-08T08:23:10.312763+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the sitemap HTTP endpoints. Verifies only the API-level contract—status code, `content-type`, and `cache-control` headers—for the XML sitemap responses. Deliberately excludes validation of XML *content* (entries, alternates, `lastmod`, file-split boundaries), which belongs to `tests/integration/sitemap.test.ts`.

## Key elements

- **`describe('GET /sitemap/index.xml')`** — asserts 200, `application/xml` content-type, and `public, max-age=3600` cache-control.
- **`describe('GET /sitemap/pages.xml')`** — identical contract assertions for the pages sitemap.
- **`describe('GET /sitemap/products-{page}.xml')`** — two cases:
  - *Valid page:* seeds a product via `createProduct()`, then asserts the same 200/XML/cache contract for `/sitemap/products-1.xml`.
  - *Invalid page:* requests `/sitemap/products-99.xml` and asserts a bare 404 (no content-type or cache headers checked—this is the error contract).
- **`setupTestDb()`** — called at module top-level to provision the test database before any test runs.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported as a side-effect (`import '@tests/contract'`) to register shared contract-test setup/matchers. |
| `tests/support/setup-test-db.ts` | Provides `setupTestDb()` to initialize a clean test database. |
| `tests/support/http.ts` | Provides the `api()` helper used to issue the `GET` requests under test. |
| `src/modules/products/tests/factories.ts` | Provides `createProduct()` to seed a product so the `products-1.xml` endpoint returns 200. |

## Notes

- The 404 case asserts **only** the status code; it does not check `content-type` or `cache-control`. This is intentional—error responses follow a narrower contract.
- `setupTestDb()` is a top-level side-effect, not wrapped in `beforeAll`. Ordering matters if you add more top-level setup calls.
- The module docblock explicitly scopes out content-level assertions. Don't add XML-body parsing here; do it in the integration suite.
