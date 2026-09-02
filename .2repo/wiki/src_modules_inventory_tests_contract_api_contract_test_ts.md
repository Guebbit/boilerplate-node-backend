# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/inventory` HTTP API. Each test pins a specific response branch (status code, body shape, pagination metadata) and validates it against the API spec via `toSatisfyApiSpec()`. The file covers the two read endpoints (`/levels`, `/movements`), two write transitions (`/receipts`, `/adjustments`) with their 200/404/409/422 responses, and the `/reservations/sweep` endpoint. Business-rule assertions on the transitions themselves are delegated to the unit suite.

## Key elements

- **`MISSING_ID`** (`'f'.repeat(24)`) — a syntactically valid ObjectId chosen to guarantee a 404 (not 422) without risking collision with seeded IDs.
- **`describe('GET /inventory/levels')`** — 3 tests: full response shape, `lowOnly=true` filter, and pagination (`page`/`pageSize`).
- **`describe('GET /inventory/movements')`** — 4 tests: empty ledger, pagination with `totalItems` reflecting the full filtered set, `reason` filter, and single-product narrowing with `onHandDelta`/`reservedDelta` fields.
- **`describe('POST /inventory/receipts')`** — 3 tests: 200 success (returns updated counters), 404 for unknown product, 422 for invalid body.
- **`describe('POST /inventory/adjustments')`** — 3 tests: 200 (negative delta), 409 `INVENTORY_BELOW_RESERVED`, 422 for zero delta.
- **`describe('POST /inventory/reservations/sweep')`** — 1 test: 200 with `{ expired: 0 }`.
- **`setupTestDb()`** — called once at module level before any test runs.
- **`toSatisfyApiSpec()`** — appended to every assertion; validates the response against the shared OpenAPI/contract spec.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`@tests/contract`); registers the `toSatisfyApiSpec` matcher used in every test.
- **`tests/support/http.ts`** — provides the `api()` request helper and `authenticateAs()` used to obtain a Bearer token.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` for database isolation before the suite runs.
- **`src/modules/products/tests/fixtures.ts`** — provides `createProduct()`, the fixture used to seed inventory rows for every test.

## Notes

- All tests authenticate as `'admin'`. The module docstring references 401/403 "customer screen" guards, but no such tests appear in this file—those branches are either covered elsewhere or not yet exercised.
- `MISSING_ID` is deliberately all-`f` (not a random hex string) to make accidental collision with a real seeded ObjectId impossible.
- Pagination tests assert `meta.totalItems` reflects the *full* filtered count, not just the current page—this is the invariant that lets an audit UI know more history exists.
- The file imports `@tests/contract` (no binding) purely for its side-effect of attaching the spec matcher; forgetting that import would make `toSatisfyApiSpec` undefined.
