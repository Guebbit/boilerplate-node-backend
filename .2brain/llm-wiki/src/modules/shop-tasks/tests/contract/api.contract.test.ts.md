---
source: src/modules/shop-tasks/tests/contract/api.contract.test.ts
sha256: 30415aa16256f418a0926b7f478c06a670aa868b5df94076cd2721ead077a21e
generated_at: 2026-11-08T08:17:48.597102+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `GET /shop-tasks/summary` endpoint. Verifies that the response satisfies the shared contract for both an administrator and a restricted role (`warehouse`), and that the response carries a `no-store` cache-control directive so it is never held in a shared cache.

## Key elements

- **`describe('GET /shop-tasks/summary')`** — the single test suite in this file.
- **`import '@tests/contract'`** — side-effect import; registers contract-validation logic globally (no named exports used here).
- **`setupTestDb()`** — called at module scope (not inside a hook) to provision a clean test database before any test runs.
- **Test: "matches the contract for an administrator"** — authenticates as `admin` via `authenticateAs`, issues `GET /shop-tasks/summary`, asserts `200`.
- **Test: "matches the contract for a role that opens fewer screens"** — same request but authenticates via `authenticateAsRole('warehouse')`, asserts `200`.
- **Test: "is never kept by a shared cache"** — asserts `response.headers['cache-control']` matches `/no-store/`.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); presumed to install interceptors or assertions that validate response bodies against a shared schema. No symbols are destructured from it.
- **`tests/support/http.ts`** — supplies the `api()` client factory, `authenticateAs(user)`, and `authenticateAsRole(role)` helpers used by every test.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, invoked once at the top of the module to reset/create the test database.

## Notes

- `setupTestDb()` runs at module import time (outside `describe`/`beforeAll`), so the DB is ready before the test runner attaches hooks. If other test files in the same worker also call it, the side-effect import of `@tests/contract` must be idempotent.
- The actual schema validation is delegated entirely to the `@tests/contract` side-effect import; the explicit `expect(...)` calls here only check status and cache headers. To understand *what* is validated, read `tests/support/contract.ts`.
- The "fewer screens" phrasing in the test name maps to the `warehouse` role; there is no dynamic role parameterisation in this file.
