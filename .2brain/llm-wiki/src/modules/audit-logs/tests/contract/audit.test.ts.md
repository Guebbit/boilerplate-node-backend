---
source: src/modules/audit-logs/tests/contract/audit.test.ts
sha256: 3b9c2542041a1359bd78cd4264ad11f9a4ed8dfcb858b710b6ae264f1e23a2e1
generated_at: 2026-10-29T03:18:38.973912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/contract/audit.test.ts

## Purpose

Contract tests for the `GET /audit` endpoint — the single route owned by the audit-logs module. They verify that an authorized caller (holder of `read:AuditLog`) can filter and retrieve entries, while several invalid filter inputs are rejected with `422` rather than silently returning partial or unfiltered results.

## Key elements

- **`authenticateInRole(role: string)`** — Creates a verified user in the given role via `createUser`, then authenticates through the real `POST /account/login` route. Returns `{ user, bearer }`. Exists because the shared `authenticateAs` helper only spells `owner`/`user`, not the `admin` role this endpoint requires.
- **`describe('GET /audit')`** — Five test cases:
  - *admin filtered by actor + target* — seeds one entry via the repository, asserts `200` and correct `actorRoleName` in the response.
  - *repeated scalar `since` filter* — two `since` query params → expects `422`.
  - *invalid `since` value* (`not-a-date`) → expects `422`.
  - *date-only `since`* (no time component) → expects `422`.
  - *invalid `outcome` value* (`bogus`) → expects `422` instead of matching every row.

## Relationships

- **`tests/support/contract.ts`** — Imported as a side-effect module (likely registers OpenAPI/schema assertions used by the test runner).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to provision a clean test database before any test runs.
- **`tests/support/http.ts`** — Provides the `api()` request helper and `loginBearer()` used for every HTTP call in the suite.
- **`src/modules/users/tests/factories.ts`** — `createUser` is the factory used to seed users in the desired role.
- **`src/modules/audit-logs/repository.ts`** — `auditLogRepository.create` is called directly to insert known audit entries so filter assertions are deterministic.

## Notes

- The `since` filter requires a full ISO timestamp (date **and** time). A date-only string is intentionally rejected with `422`, not coerced to midnight.
- Tests authenticate through the real login route rather than a mock token; this means the suite exercises the auth middleware as part of the contract.
- The `authenticateAs` helper from `tests/support/contract.ts` is deliberately **not** used here — the module-level comment explains that it does not cover the `read:AuditLog` role distinction this endpoint makes.
