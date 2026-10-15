---
source: src/modules/stats/tests/contract/api.contract.test.ts
sha256: f9358b59ef038f9ae7da5ae846c4b5037d3407ed858cb05ba47740e20d55f929
generated_at: 2026-10-15T12:04:56.837416+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `GET /stats/*` read endpoint. The file pins the observable API contract: which roles may read which endpoints, what status codes are returned for invalid periods, malformed IDs, anonymous callers, and unknown query fields, and that sales data is never exposed through a shared cache. It exists so that any change to the stats API surface (routing, authz, validation, caching) is caught immediately.

## Key elements

- **`PERIOD`** – a constant query-string (`from=2026-03-01&to=2026-03-31`) representing a period that all read endpoints accept; used throughout the file.
- **`READS`** – an array of eight fully-qualified `/stats` URL strings (sales, products, products/:id, categories, payments, operations, customers, pipeline). Every parameterized test iterates over this list.
- **`describe('GET /stats/*')`** – the single test suite containing:
  - *Admin reads all endpoints* (`it.each(READS)`) – expects 200.
  - *Manager reads sales* – expects 200 on `/stats/sales` only.
  - *Customer is refused* (`it.each(READS)`) – expects 403 on every endpoint.
  - *Invalid product ID* – `not-an-id` in the path expects 404.
  - *Anonymous caller* – no auth header, expects 401.
  - *Cache-control* – asserts the `Cache-Control` header matches `private|no-store` and does **not** match `public|s-maxage`.
  - *422 rule violations* (`it.each` over four bad-period strings) – out-of-order dates, impossible day, span too long, bucket count too high; all expect 422.
  - *Missing period / unknown field* – no date params or an extraneous `colour=blue` param; both expect 422.

## Relationships

- **`tests/support/contract.ts`** – imported as a bare side-effect (`import '@tests/contract'`); presumably registers global contract-test setup (matchers, reporters, or config) before any test runs.
- **`tests/support/http.ts`** – supplies `api()` (HTTP client factory), `authenticateAs(role)` and `authenticateAsRole(role)` used to obtain bearer tokens per test case.
- **`tests/support/ids.ts`** – exports `MISSING_ID`, a sentinel ID value interpolated into the `/stats/products/:id` URL to exercise the "id is present but unknown" path.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to seed/reset the database so each test runs against a known fixture state.

## Notes

- The file's doc comment promises that a 422 body "names the rule," but the assertions in the file only check the **status code** (422), not the response body. If a future change drops the descriptive message, this suite will still pass.
- `MISSING_ID` from `@tests/ids` is a well-known sentinel; the test that expects 404 uses the literal string `not-an-id` instead. Both verify "id is present but not found," but via different code paths (valid-looking ID vs. non-UUID shape).
- The cache-control assertion applies only to `/stats/sales`; other endpoints in `READS` are not checked for cache headers.
- `setupTestDb()` is called once at import time (not inside `beforeEach`), so the suite assumes a single shared fixture per file run.
