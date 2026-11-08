---
source: src/modules/api-keys/tests/contract/api-keys.contract.test.ts
sha256: 0819a7fe05ae1fef908ede2990b24236e9de3fc5212f84b882be7964a3d9035d
generated_at: 2026-11-08T05:05:01.626941+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/contract/api-keys.contract.test.ts

## Purpose

Contract tests for the `/api-keys` admin surface (list, read, mint, revoke) validated against the bundled `openapi.yaml`. Every route requires a human session (`bearerAuth`). The credentials minted here are exercised against other routes in `tests/cross-cutting/`, not within this file.

## Key elements

- **`setupTestDb()`** (top-level call) — provisions an isolated test database before any suite runs.
- **`beforeEach` / `afterEach`** — ensures the deployment tenant exists (`accessService.ensureTenant`) so `tenantId` resolves; restores real timers after each test.
- **`ahead(days)` / `IN_A_WEEK()`** — helpers that produce ISO-8601 expiry strings (N days out / 7 days out).
- **`mintOne(bearer)`** — convenience that POSTs a credential and returns its `id` string, used by the GET and DELETE suites.
- **`describe('GET /api-keys')`** — asserts: no `secret` field in list items; `status`, `actions.revoke`, and `maxExpiresAt` (≈ 1-year ceiling) are present; comma-separated `sort` param is accepted, unknown sort fields return 422.
- **`describe('GET /api-keys/:id')`** — asserts: read-back shows `status` but never `secret`; `actions.revoke` flips from `true` to `false` after DELETE; unknown and malformed ids both yield 404; a caller lacking `read:ApiKey` gets 403.
- **`describe('POST /api-keys')`** — asserts: 201 with one-time `secret` prefixed `sk_`; `Cache-Control: no-store` header; 422 for over-reaching permissions, empty permissions list, missing `expiresAt`, or expiry > 366 days; 401 `REAUTH_REQUIRED` when the session exceeds the reauth window.
- **`describe('DELETE /api-keys/:id')`** — asserts: 204 on successful revoke; 404 for an id outside the caller's reach.

## Relationships

- **`tests/support/contract.ts`** — imported side-effect only (`import '@tests/contract'`); wires up OpenAPI schema validation for every request/response in the suite.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` creates and seeds a throwaway database for the tests.
- **`tests/support/http.ts`** — provides `api()` (Supertest-style request builder) and `authenticateAsRole(role)` (returns a valid bearer token for the given role).
- **`src/modules/access/index.ts`** — exports `accessService.ensureTenant()` and `DEPLOYMENT_TENANT_SLUG`, used in `beforeEach` to guarantee a resolvable tenant context.
- **`tests/support/clock.ts`** — `freezeDate()` / `advanceDate()` simulate time passing for the reauth-window test.
- **`src/kernel/config.ts`** — `reauthWindowSeconds('critical')` supplies the threshold used to advance the clock past the reauth window.

## Notes

- The one-time `secret` is **only** returned on `POST /api-keys` (201). Every `GET` response must have `secret` absent — this is a repeated, explicit assertion.
- The 422 test for `read:ObservabilitySnapshot` deliberately exercises a *platform-scope* permission the admin role does not hold, to confirm the scope floor; the inline comment distinguishes this from a plain missing-permission check.
- The reauth test depends on `freezeDate`/`advanceDate` from the clock helper; `afterEach(() => jest.useRealTimers())` ensures no timer leakage between tests.
- `maxExpiresAt` in the list response is asserted to be > 364 days out, encoding the one-year mint ceiling as a contract guarantee.
