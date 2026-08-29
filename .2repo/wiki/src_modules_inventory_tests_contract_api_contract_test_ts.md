# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose
HTTP contract-test suite for the `/inventory` routes. It pins the observable API contract — status codes, response shapes, error codes, pagination metadata — as reached over the wire, for both reads (levels, movements) and writes (receipts, adjustments, reservation sweep). Transition logic itself is covered by the unit suite; this file only verifies that each branch is reachable and correctly shaped at the HTTP boundary.

## Key elements
- **`MISSING_ID`** — `'f'.repeat(24)`, a syntactically valid ObjectId guaranteed to collide with no fixture or seed. Used to exercise 404 branches (as opposed to 422).
- **`describe('GET /inventory/levels')`** — 200 happy path (onHand/reserved/available), `lowOnly=true` filter, pagination (`page`/`pageSize`/`totalPages`), 403 for non-admin.
- **`describe('GET /inventory/movements')`** — empty ledger, pagination with `totalItems` reflecting full match count, `reason` filter, `productId` filter (verifies both `onHandDelta` and `reservedDelta`), 403.
- **`describe('POST /inventory/receipts')`** — 200 with updated counters, 404 unknown product, 422 invalid body, 401 unauthenticated.
- **`describe('POST /inventory/adjustments')`** — 200 negative delta, 409 `INVENTORY_BELOW_RESERVED`, 422 zero delta, 403 non-admin.
- **`describe('POST /inventory/reservations/sweep')`** — 200 `{ expired: 0 }`, 403 non-admin.
- Every assertion block ends with `expect(response).toSatisfyApiSpec()` to validate the full response against the API spec.

## Relationships
- **`tests/support/contract.ts`** — imported as `'@tests/contract'`; installs the `toSatisfyApiSpec()` matcher used throughout.
- **`tests/support/http.ts`** — provides `api()` (supertest-style client) and `authenticateAs(role)` which returns a `{ bearer }` token.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to prepare a clean database per test.
- **`src/modules/products/tests/factory.ts`** — `createProduct()` creates fixture products with configurable `onHand`, `reserved`, and `title`.

## Notes
- The contract suite **does not seed** catalogue data. The 404 test therefore relies on `MISSING_ID` being absent *by construction*, not by observation. A previous value (`65dc8a99604c307b702b5ccc`) was silently identical to `SEED_PRODUCT_IDS.panino` and would have broken the test if the suite ever started seeding.
- `toSatisfyApiSpec()` is the single gate that enforces response-shape conformance; the explicit `toMatchObject` / `toHaveLength` assertions on top document *which* fields the test author cares about without re-validating the entire schema.
- The `meta.totalItems` in pagination responses counts all matching rows, not the current page — an intentional contract choice so clients can render "showing X of Y".
