# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose

HTTP contract tests for every `/inventory` endpoint. Each test asserts the status code, response envelope, and key field shapes against the registered API spec (via `toSatisfyApiSpec()`), pinning the wire contract independent of internal business-logic rules. Covers both read endpoints (levels, movements) and write transitions (receipts, adjustments, reservations/sweep), including their 401/403/404/409/422 error branches.

## Key elements

- **`MISSING_ID`** — `'f'.repeat(24)`, a syntactically valid ObjectId guaranteed to collide with no seeded fixture; used to exercise the 404 branch specifically (not the 422 validation branch).
- **`describe('GET /inventory/levels')`** — Happy path (onHand/reserved/available trio), `lowOnly=true` filter, pagination (`page`/`pageSize`), and 403 for non-admin.
- **`describe('GET /inventory/movements')`** — Empty ledger, pagination with `totalItems` ≠ page length, `reason` filter, product-scoped view verifying both `onHandDelta` and `reservedDelta`, and 403.
- **`describe('POST /inventory/receipts')`** — 200 (counters update), 404 (unknown product), 422 (invalid body), 401 (unauthenticated).
- **`describe('POST /inventory/adjustments')`** — 200 (negative delta), 409 (`INVENTORY_BELOW_RESERVED`), 422 (zero delta), 403 (non-admin).
- **`describe('POST /inventory/reservations/sweep')`** — 200 with `{ expired: 0 }`, 403 for non-admin.
- **`setupTestDb()`** — Called once at module top; resets the database before the suite runs.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Provides the `toSatisfyApiSpec()` custom matcher registered on `expect`; every test asserts against it. |
| `tests/support/http.ts` | Provides `api()` (supertest request builder) and `authenticateAs(role)` for obtaining a bearer token. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` wipes and reseeds the DB so each test starts from a clean slate. |
| `src/modules/products/tests/fixtures.ts` | `createProduct()` seeds a product row with controlled `onHand`/`reserved` values for each scenario. |

## Notes

- **Contract vs. unit boundary** — This file deliberately tests *shape and status*, not the internal arithmetic. The module docstring explicitly delegates "transitions' own rules" to the unit suite; don't add business-logic assertions here.
- **`MISSING_ID` convention** — All-`f` (not a realistic hex string) so a future seed that happens to generate a plausible-looking unused ID won't silently turn a 404 test into a 200.
- **`toSatisfyApiSpec()` is the load-bearing assertion** — Field-level `toMatchObject` / `toHaveLength` calls are supplementary readability; the spec matcher is what actually pins the contract. If the spec file changes, these tests break even if the manual assertions still pass.
- **401 vs 403 distinction** — Receipts include a 401 (no token at all); every other endpoint uses 403 (token present, role insufficient). Don't "fix" one to match the other without checking the route's auth guard.
