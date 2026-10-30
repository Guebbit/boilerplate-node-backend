---
source: src/modules/inventory/tests/contract/api.contract.test.ts
sha256: 4452a998317f931a50de6bdb8c0cb46d7be95543d2edbb44fb323c1447843872
generated_at: 2026-10-29T04:05:47.642136+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose

Contract tests that pin the HTTP-level behaviour of every `/inventory` endpoint — status codes, response shapes, pagination metadata, and error envelopes — without re-testing the business rules themselves. Each test exercises one reachable branch (200, 403, 404, 409, 422) so that a change to the API surface is caught before it reaches a consumer. The transitions' internal invariants are intentionally left to the unit suite.

## Key elements

- **`describe('GET /inventory/levels')`** — list endpoint: full read, `lowOnly=true` filter, and `page`/`pageSize` pagination (asserts `meta.totalItems` / `meta.totalPages`).
- **`describe('GET /inventory/levels/{productId}')`** — single-product read; 404 for missing *and* malformed IDs; 403 for the `user` role.
- **`describe('GET /inventory/movements')`** — ledger: empty state, pagination, `reason` filter, `productId` filter; asserts `onHandDelta` / `reservedDelta` shape.
- **`describe('POST /inventory/levels/{productId}/receive')`** — delivery: 200 with updated counters, 404 for unknown product, 422 for `quantity: 0`.
- **`describe('POST /inventory/levels/{productId}/adjust')`** — correction: 200 (negative delta), 409 with `INVENTORY_BELOW_RESERVED` when delta would drop below reserved, 422 with `VALIDATION_ERROR` for `delta: 0`.
- **`describe('POST /inventory/reservations/sweep')`** — idempotent no-op returns `{ expired: 0 }`.
- **`describe('GET /inventory/preorders')`** — reads pre-order allowance rows (`backorderLimit`, `left`, `ordered`, etc.).
- **`describe('PATCH /inventory/levels/:productId')`** — sets `backorderLimit`; returns the updated level object.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); likely registers global contract-matchers or response-shape helpers used by `toMatchObject` assertions throughout.
- **`tests/support/http.ts`** — supplies `api()` (supertest-style request helper), `authenticateAs` (role-based bearer token), and `authenticateAsRole` (imported but not exercised in the visible tests).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to seed/reset a test database before any test runs.
- **`tests/support/ids.ts`** — provides `MISSING_ID`, a deterministic non-existent ObjectId used to trigger 404 branches.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product document (with optional `onHand`, `reserved`, `releaseDate`) so inventory tests don't depend on a real product service.

## Notes

- The file is a **contract** test, not a unit test. The header comment explicitly states that transition rules (e.g. "delta can't go below reserved") are covered in the unit suite; here only the *HTTP envelope* (status code, error code string, field names) is asserted.
- `authenticateAsRole` is imported but has no visible usage in the truncated content — it may be used in the omitted tail of the file or imported for future 401-path tests mentioned in the header.
- `setupTestDb()` runs at **module load time**, not inside a `beforeAll`; all tests in the file share the same seeded database state.
- The 403 test uses role `'user'` (customer); the header also mentions 401, but no 401 assertion appears in the visible portion.
- Pagination assertions consistently check that `meta.totalItems` reflects the *filtered* total, not the page slice — a deliberate contract choice to let clients compute "there is more to load."
