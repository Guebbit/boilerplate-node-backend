---
source: src/modules/api-keys/tests/contract/api-keys.test.ts
sha256: 0819a7fe05ae1fef908ede2990b24236e9de3fc5212f84b882be7964a3d9035d
generated_at: 2026-10-29T03:15:23.557528+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/contract/api-keys.test.ts

## Purpose

Contract tests for the `/api-keys` admin surface (list, get-by-id, mint, revoke), validating responses against the bundled `openapi.yaml`. Verifies auth requirements, response shapes, validation errors, and security invariants (one-time secret never re-exposed, `no-store` caching, expiry ceilings). Credentials minted here are *not* exercised against other routes — that happens in `tests/cross-cutting/`.

## Key elements

- **`describe('GET /api-keys')`** — Lists credentials; asserts `secret` is absent, `status`/`actions` are present, `maxExpiresAt` is near one year, and `sort` param enforces its enum (comma-separated, 422 on unknown field).
- **`describe('GET /api-keys/:id')`** — Reads one credential back (no secret), checks `actions.revoke` flips to `false` after DELETE, returns 404 for unknown/malformed ids, and 403 for a caller lacking `read:ApiKey`.
- **`describe('POST /api-keys')`** — Mints a credential (201, `sk_` prefix, `no-store` header), rejects over-reaching permissions (422), empty permissions (422), stale sessions past the reauth window (401 `REAUTH_REQUIRED`), missing expiry (422), and expiry > 365 days (422 vs. 360 days accepted).
- **`describe('DELETE /api-keys/:id')`** — Revokes a credential (204); 404 for an id outside the caller's tenant.
- **`mintOne(bearer)`** — Helper that POSTs one credential and returns its `id` string.
- **`ahead(days)` / `IN_A_WEEK()`** — Date helpers producing ISO strings for expiry assertions.
- **`beforeEach`** — Calls `accessService.ensureTenant(DEPLOYMENT_TENANT_SLUG, …)` so the tenant context resolves before any request.

## Relationships

- **`@tests/contract`** — Side-effect import; wires OpenAPI spec assertions into the test runner.
- **`@tests/setup-test-db`** — `setupTestDb()` seeds an isolated database for the suite.
- **`@tests/http`** — Provides `api()` (HTTP client) and `authenticateAsRole()` (role-scoped bearer tokens).
- **`@modules/access`** — Exports `accessService` (used in `beforeEach` to create the tenant) and `DEPLOYMENT_TENANT_SLUG` (the fixed tenant identifier for tests).
- **`@tests/clock`** — `freezeDate()` / `advanceDate()` manipulate the clock for the reauth-window test.
- **`@kernel/config`** — `reauthWindowSeconds('critical')` supplies the window length so the test advances time just past it.

## Notes

- The "over-reaching" 422 test deliberately uses `read:ObservabilitySnapshot`, a *platform*-scope permission, because admin holds tenant scope — this floors the same validation path as a genuinely missing permission.
- `afterEach` restores real timers (`jest.useRealTimers()`) after any test that calls `freezeDate()`.
- The expiry ceiling is asserted as "more than 364 days" for `maxExpiresAt` and "367 days → 422 / 360 days → 201" for the mint boundary; the exact server-side limit sits between those two values.
- All routes require `bearerAuth`; there is no anonymous access tested here.
