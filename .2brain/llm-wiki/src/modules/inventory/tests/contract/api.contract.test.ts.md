---
source: src/modules/inventory/tests/contract/api.contract.test.ts
source_sha256: 81d55275bd9002034cf47a4b59bd93bb2aa09fb874308b26ad3f6248ae9403a3
context_sha256: 5b2426b09e5f1899bb4f10e340dd7217bf488c37f020cf3a6e73f054443820bd
generated_at: 2026-11-22T05:24:45.916822+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose
HTTP-level contract tests for the `/inventory` API. They pin each contract branch reachable over HTTP: the two reads (levels, movements), the two write transitions (receive, adjust) with their 200/404/409/422 responses, the reservation sweep, and the 401/403 checks that keep stock counters away from customers. The rules of the transitions themselves are covered in the unit suite, not here.

## Key elements
- `setupTestDb()` is called at module level to provision the test database.
- `GET /inventory/levels` tests:
  - Reports `onHand`, `reserved` and `available`, plus `meta` (`totalItems`, `totalPages`).
  - A level with no stored `backorderLimit` is shown as `0` (closed), not as "no cap".
  - `lowOnly=true` narrows the list to items needing reorder.
  - `page`/`pageSize` paginate the list.
- `GET /inventory/levels/{productId}` tests: a single product's counters, and `404` for both an unknown id and a malformed id.
- `GET /inventory/movements` tests:
  - Empty ledger.
  - Pagination, where `totalItems` counts all matches rather than the current page.
  - Filtering by `reason` (e.g. `adjust`) and by `productId`.
  - Rows carry `reason`, `onHandDelta` and `reservedDelta`.
- `POST /inventory/levels/{productId}/receive` tests: `200` with the updated counters, `404` for an unknown product, `422` for `quantity: 0`.
- `POST /inventory/levels/{productId}/adjust` tests:
  - `200` for a negative delta.
  - `409` with code `INVENTORY_BELOW_RESERVED` when the correction would drop on-hand below reserved.
  - `422` with `VALIDATION_ERROR` and `details.field: 'delta'` for a zero delta.
- `POST /inventory/reservations/sweep` test: with nothing to expire, returns `200` and `{ expired: 0 }`.
- `GET /inventory/preorders` test: for a product with a future `releaseDate` and a `backorderLimit` set through `PATCH /inventory/levels/{productId}`. The visible part of the file ends partway through this test.

## Relationships
- `src/modules/inventory/model.ts`: imports `stockLevelModel`, whose underlying collection is used with the raw driver to `$unset` `backorderLimit`, because the schema would restore its default.
- `src/modules/products/tests/factories.ts`: `createProduct({ onHand, reserved, title, releaseDate })` seeds the products and stock levels the tests read and mutate.
- `tests/support/http.ts`: provides `api()` (the request client) and `authenticateAs` / `authenticateAsRole`, which return a `bearer` token. The visible tests all use `authenticateAs('admin')`.
- `tests/support/contract.ts`: imported for its side effects only. It presumably sets up the contract checks behind "matches the contract". That is inferred from the import and the test names, not visible in this file.
- `tests/support/ids.ts`: supplies `MISSING_ID` for the unknown-product `404` cases.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`.

## Notes
- Every `receive` and `adjust` request sends a fresh `Idempotency-Key` header from `randomUUID()`. The sweep call sends none.
- The movements tests seed the ledger by calling the receive and adjust endpoints, not by inserting rows directly.
- Malformed ids and unknown ids both produce `404`, not `422`.
