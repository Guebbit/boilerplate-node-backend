---
source: tests/cross-cutting/account-protection.test.ts
sha256: 6762f6609d14c824e2bf90ab4a51a9c8be98a361ef545eea27f2abedaabf68f3
generated_at: 2026-11-08T09:22:32.989992+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/account-protection.test.ts

## Purpose

Integration test that verifies staff-account protection through the real HTTP app and a real database. For every protection row (a user-mutating endpoint), it asserts that any caller can modify a plain customer, but can only modify an account that holds a staff role (staff, admin, platform-only) if that caller also holds `assign:Role`. It also confirms that API keys can never be minted with `assign:Role`, so no key path can reach a staff account.

## Key elements

- **`TENANT_ROLES`** – `PRESET_ROLES` filtered to tenant-scoped, assignable roles (excludes `system`).
- **`holdersOf(key)`** – returns the role names that include `key` in their permissions; used to enumerate callers per row.
- **`managesRoles(role)`** – `true` iff the role's permissions include `assign:Role`.
- **`outcomeOf(response)`** – collapses an HTTP response into one of three strings: `'passed'`, `'ROLE_MANAGEMENT_REQUIRED'`, or `'refused:<code>'`.
- **`send(bearer, request)`** – fires a `ProtectionRequest` via the test HTTP client, attaching the bearer token and a random Idempotency-Key.
- **`runRow(row, callerRole)`** – authenticates as `callerRole`, creates five owner accounts (customer, staff, admin, platform-only, self), fires the row's prepared request against each, and asserts the expected outcome per kind.
- **`patchAsKey(secret, owner)`** – convenience wrapper that issues `PATCH /users/:id` with a raw API-key bearer and returns the reduced outcome.
- **`describe` block 1** – iterates `PROTECTION_ROWS`; for each row runs `runRow` as every holder role, and adds a check that a plain `customer` is refused by the key itself (`FORBIDDEN`).
- **`describe` block 2** – verifies an API key minted with `['update:User']` passes on a customer but gets `ROLE_MANAGEMENT_REQUIRED` on an admin, and that minting with `['update:User','assign:Role']` rejects.

## Relationships

- **`src/kernel/permissions.ts`** – imports `PRESET_ROLES` to build `TENANT_ROLES` and to look up which roles hold which permission keys.
- **`tests/support/account-protection-rows.ts`** – imports `PROTECTION_ROWS` (the data-driven list of endpoints to test), `createOwner` (spins up a user+role pair in the test DB), and the `Owner` / `ProtectionRow` / `ProtectionRequest` types that shape every test case.
- **`tests/support/credentials.ts`** – imports `credentialHolding` to mint an API key with an arbitrary permission set; used in the API-key describe block.
- **`tests/support/http.ts`** – imports `api` (the supertest-style client) and `authenticateAsRole` (returns bearer + user for a role).
- **`tests/support/setup-test-db.ts`** – calls `setupTestDb()` at module load to provision a fresh database before any test runs.

## Notes

- The test is **data-driven**: adding a new protected endpoint means appending a row to `PROTECTION_ROWS`; no new test code is needed here.
- `setupTestDb()` runs at import time (top-level), so the database is ready before Jest's `describe`/`it` blocks execute.
- The `self` owner case always expects `'passed'` regardless of role, because modifying one's own account is outside the staff-protection rule.
- `Idempotency-Key` is set on every mutating request to avoid the server rejecting repeated calls in a single test run.
- The `customer`-refusal test asserts the specific code `FORBIDDEN` (key-level denial), distinguishing it from `ROLE_MANAGEMENT_REQUIRED` (staff-protection denial).
