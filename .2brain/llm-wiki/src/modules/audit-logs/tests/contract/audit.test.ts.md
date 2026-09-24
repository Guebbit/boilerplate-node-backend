---
source: src/modules/audit-logs/tests/contract/audit.test.ts
sha256: 56bd2178733479dbd9ad9f9987a62d94d8b566cfe2b3925a9219089c35993b21
generated_at: 2026-09-23T18:27:52.719118+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/contract/audit.test.ts

## Purpose

Contract tests for the single route this module exposes — `GET /audit`. Covers authentication, role-based authorization, query-parameter filtering, and response-shape validation against the API spec. Exists to lock the observable behavior of the endpoint so refactors inside the module cannot silently change the wire contract.

## Key elements

- **`authenticateInRole(role)`** — local helper that creates a user via the factory in a caller-chosen role (`moderator`, `editor`, …) and logs in through the real `POST /account/login` route. Returns `{ user, bearer }`. Exists because the shared `authenticateAs` helper only spells `owner`/`user`.
- **`describe('GET /audit')` block** — six test cases:
  - 401 on unauthenticated request
  - 403 for a role without `audit.any.read` (uses `editor`)
  - 200 for `moderator` with `actor` + `target` filters; seeds a row via `auditLogRepository.create`
  - 422 for `since=not-a-date`
  - 422 for `since=2026-01-01` (date-only, missing time component)
  - 422 for `outcome=bogus` (must be `success` or `failure`)
- **`toSatisfyApiSpec()`** — called on every response to validate the body against the OpenAPI/contract schema.

## Relationships

- **`tests/support/contract.ts`** — provides the `toSatisfyApiSpec()` matcher used in every assertion.
- **`tests/support/http.ts`** — provides the `api()` supertest-style client for issuing requests.
- **`tests/support/setup-test-db.ts`** — called once at module level to create an isolated test database.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser` (with `verifiedAt` preset) and `PLAIN_PASSWORD` for the login step.
- **`src/modules/audit-logs/repository.ts`** — `auditLogRepository.create` is used to seed audit-log rows directly in the DB so filter tests have known data to assert against.

## Notes

- The `since` filter requires a full timestamp (e.g. `2026-01-01T00:00:00Z`); a date-only string is a 422, not a silent fallback to midnight.
- `outcome` is a closed enum (`success` | `failure`); passing any other value yields 422 rather than returning an empty set.
- Test data is inserted through the repository layer, not the HTTP API — the tests assume the write path is already covered elsewhere.
- Role strings (`moderator`, `editor`) are arbitrary labels here; what matters is whether the role carries the `audit.any.read` permission.
