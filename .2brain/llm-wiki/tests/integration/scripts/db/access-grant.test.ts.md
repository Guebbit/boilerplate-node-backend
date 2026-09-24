---
source: tests/integration/scripts/db/access-grant.test.ts
sha256: 31b4086e2f0a397ce418535ca8c49216e879cf196f9bb9bcea4ac92dfa26a562
generated_at: 2026-09-23T20:06:54.930829+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scripts/db/access-grant.test.ts

## Purpose

Integration test for the `grantAccess` function — the core logic behind the `access:grant` console command used to create the first owner in a fresh deployment. It exercises the function directly (not the CLI wrapper) because the wrapper parses `process.argv` and connects on import, making it undrivable per test case.

## Key elements

- **`describe('grantAccess', …)`** — suite with four cases covering the full contract of `grantAccess(email, role, scope)`:
  - Grants a shop/tenant role (`'admin'`, scope `'tenant'`) and verifies the membership via `membershipIn`.
  - Grants a platform role (`'operator'`, scope `'platform'`) with `shopId = null`.
  - Rejects an unknown email with `GrantAccessError`.
  - Rejects a role string not declared by any module (asserts the regex `/is not a role/` thrown by `assignRole`).
- **`setupTestDb()`** — top-level call that prepares a fresh test database before any case runs.

## Relationships

- **`scripts/db/access-grant.ts`** — the module under test; provides `grantAccess` and `GrantAccessError`.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory to seed a user before granting.
- **`src/modules/access/index.ts`** — exports `membershipIn`, used to assert the resulting membership row.
- **`src/kernel/access/tenant.ts`** — provides `DEPLOYMENT_TENANT_ID` constant for the tenant-scope assertion.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` to reset/prepare the integration database.

## Notes

- The test deliberately avoids importing the CLI entry point (`grant-access.ts`); see the header comment and the parallel convention in `tests/integration/scripts/db/index-sync.test.ts`.
- The "invalid role" case is an `assignRole` invariant, not a check owned by this script — the assertion is a regex match on the error message rather than a specific error class.
