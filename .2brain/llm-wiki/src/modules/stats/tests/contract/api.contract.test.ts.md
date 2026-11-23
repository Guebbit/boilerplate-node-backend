---
source: src/modules/stats/tests/contract/api.contract.test.ts
source_sha256: 8cea6a8d6080e05ab76602a7d07603483b083b4f47ff78c75c95e7b6414e68b8
context_sha256: b7a6497612e34f9ba69f4cb4fbcddac5f8fe5b65527745b5a9723f5dfd5bdada
generated_at: 2026-11-22T07:52:24.445243+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/stats` HTTP endpoints. They check that every read endpoint answers successfully for an administrator, that a manager can read sales, that shared caches can't store sales figures, and that invalid periods or query fields are rejected with 422.

## Key elements
- `PERIOD` — a valid date range (`from=2026-03-01&to=2026-03-31`) that every read accepts.
- `READS` — the list of read URLs with the query each needs: `/stats/sales` (with `interval=week`), `/stats/products` (with `limit=5`), `/stats/products/:id` (using `MISSING_ID`), `/stats/categories`, `/stats/payments`, `/stats/operations`, `/stats/customers` and `/stats/pipeline`.
- `describe('GET /stats/*')` — contains these cases:
  - Each URL in `READS` returns 200 for an `admin`, via `it.each`.
  - A `manager` gets 200 on `/stats/sales`.
  - `/stats/products/not-an-id` returns 404.
  - The `/stats/sales` `cache-control` header must not match `public|s-maxage` and must match `private|no-store`.
  - Four bad periods return 422: out-of-order, invalid day (`2026-02-30`), too long (from 2020), and too many buckets (`interval=day` over a year-plus range).
  - A missing period, or an unknown query field (`colour=blue`), returns 422.

## Relationships
- `@tests/contract` — imported for its side effects only (`import '@tests/contract'`). Nothing from it is used by name in this file.
- `@tests/setup-test-db` — `setupTestDb()` is called once at module level to prepare the test database.
- `@tests/http` — provides `api()` (the request client), `authenticateAs('admin')` and `authenticateAsRole('manager')`. Each returns a `bearer` value, which the tests send in the `Authorization` header.
- `@tests/ids` — provides `MISSING_ID`, used in the per-product stats URL.

## Notes
- The header comment says a customer must not be able to read, but no test in this file exercises a customer. The comment also says each read "answers its schema", but the tests only assert status 200. Schema checking, if any, would have to come from the `@tests/contract` import, which this file doesn't show.
- The `it.each` for 422 cases receives `[query, label]` rows, but the callback only takes `query`. The labels (`out-of-order`, etc.) are not used, and the `%s` in the test title formats the query string.
- The `/stats/products/${MISSING_ID}` read is expected to return 200, while a malformed id returns 404.
