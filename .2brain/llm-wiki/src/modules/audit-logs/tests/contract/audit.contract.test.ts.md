---
source: src/modules/audit-logs/tests/contract/audit.contract.test.ts
source_sha256: 3b9c2542041a1359bd78cd4264ad11f9a4ed8dfcb858b710b6ae264f1e23a2e1
context_sha256: 83b7a1dd8a342fbe36e6e2615b262444346a13fd140cb4bf0a30c4f3dc525c55
generated_at: 2026-11-22T04:28:19.855348+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/tests/contract/audit.contract.test.ts

## Purpose
Contract tests for `GET /audit`, the only route owned by the audit-logs module. They check the endpoint's success shape and its input validation (422 responses) against the real HTTP API and a test database.

## Key elements
- `setupTestDb()` is called at module level to prepare the test database.
- `authenticateInRole(role)` creates a verified user in a preset role with `createUser`, then logs in via the real `POST /account/login` through `loginBearer`. It returns `{ user, bearer }`. It exists because `authenticateAs` only handles `owner` and `user`.
- `describe('GET /audit')` has five cases, all run as an `admin`:
  - **Happy path:** seeds one audit log through `auditLogRepository.create` and requests `/audit?actor=<id>&target=target-9`. It expects a 200, one item in `items`, and `actorRoleName` equal to `'admin'`.
  - **Repeated scalar filter:** two `since` params return 422 rather than silently using one.
  - **Invalid timestamp:** `since=not-a-date` returns 422.
  - **Date-only timestamp:** `since=2026-01-01` returns 422 because the time part is required.
  - **Bad outcome:** `outcome=bogus` returns 422 instead of matching every row. A log is seeded first.

## Relationships
- `@modules/audit-logs/repository` (`auditLogRepository`): seeds audit entries directly into storage before the requests.
- `@modules/users/tests/factories` (`createUser`): creates the test users in a given role.
- `@tests/http` (`api`, `loginBearer`): `api()` makes the HTTP requests, and `loginBearer` produces the `Authorization` bearer token.
- `@tests/setup-test-db` (`setupTestDb`): sets up the test database.
- `@tests/contract`: imported for its side effects only, and presumably sets up the contract-test environment.

## Notes
- The header comment describes two roles the endpoint distinguishes: a holder of `read:AuditLog` and a user who never gets past the guard. All tests here use `admin`, and no test covers the unauthorized case.
- The seeded records set `actorRole: 'user'` and `actorScope: 'tenant'` alongside `actorRoleName: 'admin'`.
