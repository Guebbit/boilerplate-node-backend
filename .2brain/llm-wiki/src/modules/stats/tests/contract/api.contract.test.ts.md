---
source: src/modules/stats/tests/contract/api.contract.test.ts
sha256: 8cea6a8d6080e05ab76602a7d07603483b083b4f47ff78c75c95e7b6414e68b8
generated_at: 2026-11-08T08:26:22.541442+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/contract/api.contract.test.ts

## Purpose

Contract test that pins down the behavioural contract of every `/stats/*` GET endpoint: each read must return 200 for authorised roles, reject unauthorised roles, return 404 for malformed IDs, never leak data into a shared cache, and answer 422 (with a rule-naming message) when the period or query violates the API's validation rules.

## Key elements

- **`PERIOD`** – constant query-string (`from=2026-03-01&to=2026-03-31`) representing a valid period every read accepts.
- **`READS`** – array of eight `/stats/*` endpoint paths (sales, products list, product by ID, categories, payments, operations, customers, pipeline) each pre-suffixed with the required query params.
- **`it.each(READS)` (admin)** – asserts every endpoint returns 200 for an admin bearer.
- **Manager read test** – asserts `/stats/sales` returns 200 for a `manager` role.
- **404 test** – asserts `/stats/products/not-an-id` returns 404 (ID format validation).
- **Cache-control test** – asserts the sales response header is `private` or `no-store` and does **not** contain `public` or `s-maxage`, preventing shared-cache leakage.
- **`it.each` (422 matrix)** – four invalid-period scenarios (out-of-order, `Feb 30`, period > allowed span, `interval=day` over a long range) each expect 422.
- **Missing / unknown-field test** – asserts 422 both when `from`/`to` are absent and when an unrecognised query key (`colour=blue`) is supplied.

## Relationships

- **`tests/support/contract.ts`** – imported as a side-effect (`import '@tests/contract'`); provides the shared contract-test infrastructure (likely global matchers or setup) that this file relies on before any assertion runs.
- **`tests/support/http.ts`** – supplies `api()` (a pre-configured HTTP client), `authenticateAs`, and `authenticateAsRole` used to build every request in the file.
- **`tests/support/ids.ts`** – supplies `MISSING_ID`, a syntactically valid but non-existent identifier used in the product-by-ID read.
- **`tests/support/setup-test-db.ts`** – supplies `setupTestDb()`, called at module top-level to provision a clean database fixture before the suite executes.

## Notes

- The `@tests/contract` import is intentionally bare (no named binding); it is a side-effect import that configures the test environment, so it must appear before any other test logic.
- `PERIOD` and the 422-matrix strings are raw query strings, not parameter objects — keep them as single strings when adding new cases so the URL interpolation in the `it.each` body continues to work.
- The cache-control assertion uses a negative regex (`not.toMatch(/public|s-maxage/)`) *and* a positive one (`toMatch(/private|no-store/)`); both must hold, so a response that simply omits the header will fail.
- The file does **not** contain an explicit customer-role rejection test despite the header comment mentioning one; the absence (or a shared fixture in `contract.ts`) means the customer check lives elsewhere.
