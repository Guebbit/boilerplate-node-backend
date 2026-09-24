---
source: src/modules/inventory/tests/contract/api.contract.test.ts
sha256: 347c3529ea5c6acbb1a2e925915fe15931e3a9c850a6116037e46035c3a33a46
generated_at: 2026-09-23T18:46:32.636071+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose

HTTP contract tests for the inventory module. Pins every contract branch reachable over the API surface—the two read endpoints, the two write transitions with their 200/404/409/422 responses, the reservation sweep, and the 401/403 auth guard—by asserting both the status/body and the `toSatisfyApiSpec()` shape. Business-rule logic for transitions is deferred to the unit suite; this file only verifies the wire-level contract.

## Key elements

- **`MISSING_ID`** (`'f'.repeat(24)`) — a syntactically valid ObjectId guaranteed to never match a real fixture, used to exercise the 404 branch without risking a collision with seeded data.
- **`GET /inventory/levels`** (3 tests) — happy path with counter fields, `lowOnly=true` filter, and pagination (`page`/`pageSize` + `meta` shape).
- **`GET /inventory/movements`** (4 tests) — empty ledger, paginated ledger with correct `totalItems`/`totalPages`, filter by `reason`, and filter by `productId` verifying both `onHandDelta` and `reservedDelta` on each row.
- **`POST /inventory/receipts`** (3 tests) — 200 with updated counters, 404 for unknown product, 422 for invalid body.
- **`POST /inventory/adjustments`** (3 tests) — 200 with corrected counters, 409 (`INVENTORY_BELOW_RESERVED`) when delta would drop `onHand` under `reserved`, 422 for zero delta.
- **`POST /inventory/reservations/sweep`** (1 test) — 200 with `{ expired: 0 }` when nothing is due.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — registers the `toSatisfyApiSpec()` custom matcher used in every test to validate the response against the declared API spec.
- **`tests/support/http.ts`** (`@tests/http`) — provides `api()` (supertest-style request builder) and `authenticateAs(role)` for obtaining a bearer token.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — `setupTestDb()` is called once at module scope to reset and seed a test database before any test runs.
- **`src/modules/products/tests/factories.ts`** (`@modules/products/tests/factories`) — `createProduct({ onHand, reserved, title })` seeds product rows so inventory endpoints have valid `productId` references.

## Notes

- Every assertion ends with `expect(response).toSatisfyApiSpec()`; omitting it silently drops spec-shape coverage.
- The 404 test deliberately uses `MISSING_ID` (all `f` chars) rather than a random hex string to eliminate the (small) chance of matching a real seeded ObjectId.
- Auth is always `admin`; the 401/403 guard tests mentioned in the header are not present in this file—check for a separate auth-guard contract test if they are expected here.
- `setupTestDb()` runs at import time (module scope), not inside `beforeAll`, so it executes before Jest collects any `describe` blocks.
