---
source: src/modules/inventory/tests/contract/api.contract.test.ts
sha256: a20354a5de517f36330d118d0aa4328a1a57ffdad7887ff0385c8ad7f77bcee5
generated_at: 2026-10-15T10:36:54.620944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/inventory` HTTP endpoint. Each test pins the response shape, status code, and error body for a specific branch (200, 401, 403, 404, 409, 422) so that API changes that break the documented contract fail loudly in CI. Business-rule logic (e.g. reservation expiry math) is intentionally left to the unit suite; this file only asserts what a client can observe over HTTP.

## Key elements

- **`describe('GET /inventory/levels')`** — asserts the paginated board response shape (`data.items[]` with `onHand`/`reserved`/`available`, `data.meta` with `totalItems`/`totalPages`), the `lowOnly=true` filter, and paging.
- **`describe('GET /inventory/movements')`** — asserts the ledger response (empty and populated), filtering by `productId` and `reason`, and that `meta.totalItems` reflects all matching rows rather than the current page.
- **`describe('POST /inventory/receipts')`** — asserts the 200 response echoes updated counters, plus 404 (unknown product) and 422 (invalid body) error shapes.
- **`describe('POST /inventory/adjustments')`** — asserts 200 (both directions), 409 with `INVENTORY_BELOW_RESERVED` error code, and 422 for a zero delta with `VALIDATION_ERROR` + field detail.
- **`describe('POST /inventory/reservations/sweep')`** — asserts the 200 response body is exactly `{ expired: 0 }` when nothing is due.
- **`describe('GET /inventory/preorders')`** — asserts the preorder-allowance listing shape and that a non-admin caller receives 403.
- **`describe('PUT /inventory/levels/:productId/preorder-limit')`** — asserts 200, 404, 422 (parametrised over three bad bodies), and 403 for a user without the warehouse role.

## Relationships

- **`tests/support/contract.ts`** — imported for side effects (`import '@tests/contract'`); provides the shared contract-assertion helpers that give the `toMatchObject` / error-code checks their meaning.
- **`tests/support/http.ts`** — supplies `api()` (the HTTP client wrapper) and `authenticateAs(role)` used by every test to obtain a bearer token.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top to (re)initialise an isolated test database before the suite runs.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds a product row with configurable `onHand`, `reserved`, `title`, and `releaseDate` so each test starts from a known state.
- **`tests/support/ids.ts`** — exports `MISSING_ID`, a well-known non-existent identifier used to exercise 404 branches without hard-coding a magic string.

## Notes

- The file is a `@module` (no named exports); it is meant to be run as a side-effecting test file, not imported elsewhere.
- `setupTestDb()` is called synchronously at the top of the file, before any `describe` block, so the database is ready before the first test executes.
- The 403 tests use `authenticateAs('user')` to verify role gating; the 401/403 "keep counters off a customer's screen" behaviour mentioned in the header is exercised here via the `preorders` and `preorder-limit` endpoints.
- `it.each` is used for the preorder-limit 422 cases; the three bad bodies are `preorderLimit: -1`, `preorderLimit: 1.5`, and an empty object.
