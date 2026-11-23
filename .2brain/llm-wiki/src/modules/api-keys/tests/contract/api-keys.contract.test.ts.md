---
source: src/modules/api-keys/tests/contract/api-keys.contract.test.ts
source_sha256: 6f1184c9959962f3202c922b5cd15f31fc82edbb132e61345f06ef060711f762
context_sha256: 5131f0cf6d35070947c1403ff55302c1cf1101ae066d2c174ddc90f0006d206f
generated_at: 2026-11-22T04:24:01.249241+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/contract/api-keys.contract.test.ts

## Purpose
Contract tests for the `/api-keys` admin HTTP surface (list, read, mint, revoke), checked against the bundled `openapi.yaml`. Every route requires a human session (`bearerAuth`). Credentials minted here are exercised against other routes in `tests/cross-cutting/`, not in this file.

## Key elements
- **`setupTestDb()` and `beforeEach`**: set up the test database. Before each test, `accessService.ensureTenant(DEPLOYMENT_TENANT_SLUG, ...)` creates the deployment's shop, because a credential's `tenant` comes from `context.caller.tenantId` and a real login only resolves it once that shop exists. The same setup is needed in the `webhooks` contract suite.
- **`afterEach(() => jest.useRealTimers())`**: undoes the fake clock used by the reauth test.
- **`ahead(days)` / `IN_A_WEEK()`**: helpers that produce ISO expiry timestamps relative to now.
- **`mintOne(bearer)`**: mints a credential with `POST /api-keys` and returns its id as a string.
- **`describe('GET /api-keys')`**:
  - Lists include no `secret`.
  - Each item has `status: 'active'` and `actions: { revoke: true }`.
  - `maxExpiresAt` is more than 364 days out.
  - A comma-separated `sort` (e.g. `-lastUsedAt,expiresAt`) returns 200. A field outside the enum (`name`) returns 422.
- **`describe('GET /api-keys/:id')`**:
  - Returns the credential with its status and no secret.
  - `actions.revoke` is `true` while live and `false` after revocation.
  - An unknown id and a malformed id both return 404.
- **`describe('POST /api-keys')`**:
  - A mint returns 201 with a one-time `secret` starting with `sk_` and echoes the permissions.
  - The response carries `Cache-Control: no-store`.
  - Several cases return 422:
    - a permission the caller lacks (a platform-scope permission, `read:ObservabilitySnapshot`, which admin does not hold), with a `VALIDATION_ERROR` pointing at the `permissions` field;
    - an empty permissions list;
    - a missing expiry;
    - an expiry more than a year out (367 days), with `details.field: 'expiresAt'`. 360 days is accepted with 201.
  - A session past `reauthWindowSeconds('critical')` returns 401 `REAUTH_REQUIRED`.
- **`describe('DELETE /api-keys/:id')`**: a revoke returns 204. An id outside the admin's reach (an all-zero id) returns 404.

## Relationships
- `@tests/contract` (`tests/support/contract.ts`): imported for its side effects, and it gives the suite its contract-test setup.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): provides `setupTestDb`.
- `@tests/http` (`tests/support/http.ts`): provides `api()` for requests and `authenticateAsRole('admin')`, which returns the `bearer` header value.
- `@tests/clock` (`tests/support/clock.ts`): provides `freezeDate` and `advanceDate`, used to age a session past the reauth window.
- `@modules/access` (`src/modules/access/index.ts`, and `src/modules/access/services/index.ts`): the file imports `accessService` and `DEPLOYMENT_TENANT_SLUG` from this module. It calls `ensureTenant` on `accessService` in the `beforeEach` hook.
- `@kernel/config` (`src/kernel/config.ts`): provides `reauthWindowSeconds`, so the reauth test follows the configured window instead of a hardcoded one.

## Notes
- All tests authenticate as `admin`. Admin is unrestricted in tenant scope but not platform scope, so asking for a platform-scoped permission is how the suite triggers the "permission the caller does not hold" 422.
- Reauth is enforced on mint (`REAUTH_REQUIRED`) because a key outlives the session that minted it.
- A malformed id and an unknown id return the same 404, so the API does not reveal which ids exist.
