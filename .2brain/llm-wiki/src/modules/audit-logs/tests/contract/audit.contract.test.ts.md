---
source: src/modules/audit-logs/tests/contract/audit.contract.test.ts
sha256: 3b9c2542041a1359bd78cd4264ad11f9a4ed8dfcb858b710b6ae264f1e23a2e1
generated_at: 2026-11-08T05:09:35.038031+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/contract/audit.contract.test.ts

## Purpose

Contract tests for the single route this module owns — `GET /audit`. They verify that an authenticated `read:AuditLog` holder can query logs with filters, and that malformed or repeated query parameters are rejected with `422` rather than silently degrading to broader results.

## Key elements

- **`authenticateInRole(role)`** — Local helper that creates a user via the users factory (verified), logs them in through the real `POST /account/login` route, and returns the user plus a bearer token. Exists because the shared `authenticateAs` helper only spells `owner`/`user`.
- **`describe('GET /audit')`** — Five cases:
  - Admin filtered by `actor` + `target` → 200, one item, correct `actorRoleName`.
  - Repeated scalar `since` param → 422 (rejects ambiguity).
  - `since` not a parseable timestamp → 422.
  - `since` date-only without time component → 422.
  - `outcome` value outside `success`/`failure` → 422 (rejects instead of matching all rows).

## Relationships

- **`tests/support/contract.ts`** — Imported side-effect-only (`import '@tests/contract'`); provides shared contract-test setup/matchers.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top level to provision a clean database before any test runs.
- **`tests/support/http.ts`** — Supplies `api()` (the request client) and `loginBearer(email)` (performs the real login call and returns the bearer token).
- **`src/modules/users/tests/factories.ts`** — `createUser({ verifiedAt }, role)` creates the fixture user with a specific role.
- **`src/modules/audit-logs/repository.ts`** — `auditLogRepository.create(...)` seeds a known audit-log row directly in the database so the test can assert on filtered results.

## Notes

- The 422 tests are intentionally "fail-closed" assertions: the contract is that invalid or ambiguous input must be rejected, not that the server picks a default or returns the full set.
- `setupTestDb()` runs at import time (outside any `describe`/`beforeEach`), so it executes exactly once when the test file is loaded.
- The file's header comment documents *why* `authenticateInRole` exists here instead of in the shared support layer: the shared `authenticateAs` only supports two role names that this endpoint's guard does not distinguish.
