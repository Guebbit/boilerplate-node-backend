---
source: src/modules/audit-logs/tests/contract/audit.test.ts
sha256: 61eb3c048a64fff4eb04c5e8af0f65bfafa0c1e0a56cb6f52e2197b674fbe0c5
generated_at: 2026-10-14T15:06:04.349230+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/contract/audit.test.ts

## Purpose

Contract tests for the `GET /audit` endpoint — the single route owned by the audit-logs module. Verifies authentication, role-based authorization, query-filter semantics (actor, target, outcome, since), and input-validation errors that the endpoint must return.

## Key elements

- **`authenticateInRole(role)`** — local helper that creates a user via `createUser` in the given role and obtains a bearer token through the real `POST /account/login` route. Used because the shared `authenticateAs` helper only covers `owner`/`user`.
- **`describe('GET /audit')` block** — seven `it` cases:
  - 401 on missing credentials
  - 403 for a role without `audit.any.read` (e.g. `editor`)
  - 200 with `actor` + `target` filters returns exactly the seeded row (moderator)
  - 422 when a scalar filter (`since`) is supplied twice
  - 422 when `since` is not a parseable timestamp
  - 422 when `since` is date-only (no time component)
  - 422 when `outcome` is outside `success`/`failure`

## Relationships

- **`tests/support/contract.ts`** — imported for side-effect (registers contract-test globals/conventions before tests run).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to prepare the database.
- **`tests/support/http.ts`** — provides `api` (request builder) and `loginBearer` (login + token extraction).
- **`src/modules/users/tests/factories.ts`** — `createUser({ verifiedAt }, role)` seeds the test user with the required role.
- **`src/modules/audit-logs/repository.ts`** — `auditLogRepository.create` is used to insert known audit rows before asserting filter results.

## Notes

- The file deliberately avoids the shared `authenticateAs` helper; the comment at the top explains that it only spells `owner`/`user`, whereas the audit guard needs a role that *does* hold `audit.any.read` (moderator) and one that does not (editor).
- `createUser` is called with `{ verifiedAt: new Date() }` as a positional options bag before the role string — a factory convention specific to the users test utilities.
- The `@tests/contract` import is a bare side-effect import (no named bindings); it must execute before the `describe` block for globals like `expect` to be available.
