---
source: src/modules/inventory/tests/contract/api.contract.test.ts
sha256: 5a6421bd56abcbb82767058128508360849b53f331bbf122ac03b8580b7b838f
generated_at: 2026-09-27T14:56:55.186198+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/inventory` HTTP surface. Each test drives a real request through the app and asserts both the business-level response (status, body shape, counters) and that the entire payload conforms to the published API spec via `toSatisfyApiSpec()`. The file covers the two read endpoints, the two write transitions (receipts, adjustments) with their success and error branches (404, 409, 422), and the reservations sweep. Transition *rules* (e.g. how `onHand` is computed) are delegated to the unit suite; this file only pins the wire contract.

## Key elements

- **`setupTestDb()`** — called once at module top; resets the test database before the suite runs.
- **`describe('GET /inventory/levels')`** — 3 cases: full read with all three counters, `lowOnly=true` filter, and pagination (`page`/`pageSize`).
- **`describe('GET /inventory/movements')`** — 4 cases: empty ledger, paginated ledger with `totalItems` reflecting the full filtered set, `reason` filter, and product-scoped read exposing `onHandDelta`/`reservedDelta`.
- **`describe('POST /inventory/receipts')`** — 3 cases: 200 success returning updated counters, 404 for an unknown `productId` (uses `MISSING_ID`), 422 for an invalid body.
- **`describe('POST /inventory/adjustments')`** — 3 cases: 200 for a negative delta, 409 with error code `INVENTORY_BELOW_RESERVED`, 422 for a zero delta.
- **`describe('POST /inventory/reservations/sweep')`** — 1 case: 200 returning `{ expired: 0 }`.

## Relationships

- **`tests/support/contract.ts`** — provides the `toSatisfyApiSpec()` matcher (imported as a side-effect module) that every assertion block relies on for spec conformance.
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb()`, used to initialise a clean database for the run.
- **`tests/support/http.ts`** — exports `api()` (the HTTP client) and `authenticateAs()` (returns a bearer token for a given role).
- **`src/modules/products/tests/factories.ts`** — exports `createProduct()`, used to seed inventory rows with specific `onHand`/`reserved` values before each assertion.
- **`tests/support/ids.ts`** — exports `MISSING_ID`, a sentinel ID that is guaranteed not to exist, used to exercise 404 paths.

## Notes

- The file docstring mentions 401/403 coverage ("keep the counters off a customer's screen"), but no such tests are present in the file body — only admin-authenticated requests are exercised here.
- Every test's final assertion is `expect(response).toSatisfyApiSpec()`; omitting it would mean the response shape is unchecked against the spec.
- The 409 test on adjustments asserts a *specific* error code (`INVENTORY_BELOW_RESERVED`) in `body.errors[0].code`, not just the status — other 4xx tests only assert status + spec.
- The sweep endpoint is tested only for the no-op case; there is no test that seeds expired reservations and asserts a non-zero `expired` count.
