---
source: src/modules/stats/tests/contract/api.contract.test.ts
sha256: 5a5ed87678891409d840fee389cd41c540b3a7d8254e27315bc8da438f1bbf68
generated_at: 2026-10-29T05:56:49.775371+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/contract/api.contract.test.ts

## Purpose
Contract tests that lock down the observable API behavior of every `GET /stats/*` endpoint: response status, authorization boundaries (admin vs. manager vs. unauthenticated customer), validation errors (422 with rule-specific messages), and cache-control guarantees. They exist to catch regressions in the public contract without depending on internal implementation.

## Key elements
- **`PERIOD`** – a valid `from`/`to` query string used as the baseline period across tests.
- **`READS`** – array of every stats read endpoint (sales, products, products/:id, categories, payments, operations, customers, pipeline, limits) with their required query params.
- **`describe('GET /stats/*', …)`** – the test suite. Contains:
  - `it.each(READS)` – asserts 200 for an admin on every endpoint.
  - Manager read of `/stats/sales` – 200.
  - `/stats/limits` body – exact `{ maxRangeDays: 731, maxBuckets: 400 }`.
  - Non-UUID product id (`not-an-id`) – 404.
  - Cache-control header – must match `private|no-store`, must **not** match `public|s-maxage`.
  - `it.each` of four invalid-period queries – each 422 (out-of-order, invalid-day, too-long, too-many-buckets).
  - Missing period **and** unknown query field (`colour=blue`) – both 422.

## Relationships
- **`tests/support/contract.ts`** – imported as a side-effect (`import '@tests/contract'`); presumably registers shared contract-test helpers or global expectations.
- **`tests/support/http.ts`** – provides `api()` (HTTP client), `authenticateAs`, and `authenticateAsRole` used for every request.
- **`tests/support/ids.ts`** – exports `MISSING_ID`, a placeholder id used in the `/stats/products/:id` read.
- **`tests/support/setup-test-db.ts`** – exports `setupTestDb()`, called once at module scope to provision the test database before any test runs.

## Notes
- The `@tests/...` imports are path aliases; the actual files live under `tests/support/` at the project root.
- `setupTestDb()` is invoked at module load (outside `beforeAll`), so it runs before Jest collects the suite.
- The cache-control test asserts **both** a positive match (`private|no-store`) and a negative match (`/public|s-maxage/`), making it a two-sided contract.
- The 422 tests check only the status code, not the message body; the file header comment states the message "names the rule," but that assertion is not enforced in this file.
- `READS` includes `/stats/pipeline` and `/stats/limits` with **no** period query, confirming those endpoints do not require one.
