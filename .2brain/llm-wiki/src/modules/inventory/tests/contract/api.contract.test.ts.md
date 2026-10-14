---
source: src/modules/inventory/tests/contract/api.contract.test.ts
sha256: 378b522d3c29f82400b4b3b5127407aa38de571852f70603555a87f5d46eb508
generated_at: 2026-10-14T16:00:43.092350+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose
HTTP contract tests for every `/inventory` endpoint. Pins the observable wire format — status codes, response envelope shape, pagination meta, and error codes — for both happy paths and the 404 / 409 / 422 / 401 / 403 branches. Business-rule assertions (e.g. *why* an adjustment is rejected) are intentionally left to the unit suite; this file only verifies what a client sees on the wire.

## Key elements
- **`GET /inventory/levels`** — three tests: full counter set (`onHand`, `reserved`, `available`), `lowOnly=true` filter, and `page`/`pageSize` pagination with `meta.totalItems` / `meta.totalPages`.
- **`GET /inventory/movements`** — four tests: empty ledger, paginated ledger (verifies `meta.page`, `meta.pageSize`, `totalItems` counts *all* matches not just the page), `reason` filter, and per-product filter showing `onHandDelta` / `reservedDelta`.
- **`POST /inventory/receipts`** — success returns updated counters; 404 for unknown product; 422 for invalid body (missing `productId` or zero quantity).
- **`POST /inventory/adjustments`** — success with positive and negative `delta`; 409 with error code `INVENTORY_BELOW_RESERVED` when delta would push `onHand` below `reserved`; 422 for zero delta.
- **`POST /inventory/reservations/sweep`** — returns `{ expired: 0 }` when nothing to expire.
- **`GET /inventory/preorders`** — full allowance fields (`preorderLimit`, `preordered`, `held`, `paid`, `left`, `ordered`); 403 for non-admin (`user` role).
- **`PUT /inventory/levels/:productId/preorder-limit`** — success returns the updated level; 404 for unknown product; 422 for negative, fractional, or missing `preorderLimit` (parameterised via `it.each`); 403 for non-admin.

## Relationships
- **`tests/support/http.ts`** — supplies the `api()` HTTP client and `authenticateAs(role)` used in every test to obtain a bearer token.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds a product (with optional `onHand`, `reserved`, `releaseDate`) so each test can exercise a known inventory state.
- **`tests/support/ids.ts`** — exports `MISSING_ID`, a guaranteed-nonexistent ID used in the 404 tests.
- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); likely registers shared matchers or contract-level Jest setup.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to provision an isolated test database before any test runs.

## Notes
- `setupTestDb()` is invoked at the **module top level**, not inside `beforeAll`; it must complete before the first `describe` block executes.
- All non-permission tests authenticate as `admin`; the 403 tests authenticate as `user`. There is no 401 test in this file despite the module doc-comment mentioning it — the 401 branch is presumably covered elsewhere or by the `@tests/contract` side-effect setup.
- `meta.totalItems` is asserted to count **all** rows matching the filter, not just the current page — the tests call this out explicitly as the mechanism that lets an audit client know more history exists.
- The 409 response is asserted to carry `errors[0].code === 'INVENTORY_BELOW_RESERVED'`; other error codes (422) are not pinned to a specific string in this file.
