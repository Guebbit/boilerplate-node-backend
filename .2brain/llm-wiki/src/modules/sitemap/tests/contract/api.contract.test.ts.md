---
source: src/modules/sitemap/tests/contract/api.contract.test.ts
sha256: 441c080edb57a5e0bb22a3b0f75d5291dfa9768f485608ca19a99791c734d2c8
generated_at: 2026-10-29T05:54:15.799464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/tests/contract/api.contract.test.ts

## Purpose

Contract tests that assert the HTTP-level guarantees of every `/sitemap/*` endpoint: status code, `Content-Type`, and `Cache-Control`. They deliberately do **not** inspect XML body content (entries, alternates, `lastmod`, pagination split)—that responsibility belongs to the integration test in `tests/integration/sitemap.test.ts`.

## Key elements

- **`describe('GET /sitemap/index.xml')`** — single test asserting `200`, `Content-Type` matching `^application/xml`, and `Cache-Control: public, max-age=3600`.
- **`describe('GET /sitemap/pages.xml')`** — same three assertions as above.
- **`describe('GET /sitemap/products-{page}.xml')`** — two tests:
  - *Valid page*: seeds a product via `createProduct()`, requests `products-1.xml`, expects the same 200/XML/cacheable contract.
  - *Unlisted page*: requests `products-99.xml` with no seed, expects `404`.
- **`setupTestDb()`** — called once at module scope to reset the test database before any test runs.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — imported as a side-effect; provides global contract-test configuration or matchers.
- **`tests/support/http.ts`** (`@tests/http`) — supplies the `api()` helper used to issue the HTTP requests under test.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — exports `setupTestDb()`, invoked at module level to prepare a clean database state.
- **`src/modules/products/tests/factories.ts`** (`@modules/products/tests/factories`) — exports `createProduct()`, used to seed a single product so the `products-1.xml` endpoint returns a valid run.

## Notes

- The module doc-comment explicitly scopes out content validation; do not add body-structure assertions here—belong in the integration suite.
- Only the `products-*` valid-page test requires DB seeding; the `index.xml` and `pages.xml` tests run against an empty database and still expect `200`.
- The `404` case (`products-99.xml`) is the only negative assertion in the file and carries no header checks—just the status code.
