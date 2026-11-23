---
source: src/modules/sitemap/tests/contract/api.contract.test.ts
source_sha256: 441c080edb57a5e0bb22a3b0f75d5291dfa9768f485608ca19a99791c734d2c8
context_sha256: 44eedbbececcbd7727d0b1249280164404f52518d1b16cbaf09f5445a851e065
generated_at: 2026-11-22T07:49:38.671906+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/sitemap` HTTP endpoints. Because the responses are XML, the spec only checks status code, media type, and declared headers. The contents of the files (entries, alternates, `lastmod`, splitting at the file limit) are covered by `src/modules/sitemap/tests/integration/sitemap.test.ts`, not here.

## Key elements
- `setupTestDb()` — called at module level to prepare the test database.
- `GET /sitemap/index.xml` — expects 200, `content-type` starting with `application/xml`, and `cache-control: public, max-age=3600`.
- `GET /sitemap/pages.xml` — same expectations as the index.
- `GET /sitemap/products-{page}.xml`:
  - After `createProduct()`, `products-1.xml` returns 200 with the same XML and cache headers (a run the index lists).
  - `products-99.xml` returns 404 (a run the index does not list).

## Relationships
- `@tests/contract` (`tests/support/contract.ts`) — imported for its side effects to set up the contract-test environment.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`) — provides `setupTestDb()`.
- `@tests/http` (`tests/support/http.ts`) — provides `api()`, the HTTP client used for every request.
- `@modules/products/tests/factories` (`src/modules/products/tests/factories.ts`) — provides `createProduct()`, which seeds a product so that page 1 exists.

## Notes
- The 404 test only asserts the status code, not headers or body.
- The index and pages tests do not seed data. Only the products page test creates a product.
