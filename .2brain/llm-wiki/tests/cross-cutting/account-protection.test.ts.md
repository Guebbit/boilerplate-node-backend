---
source: tests/cross-cutting/account-protection.test.ts
sha256: 6762f6609d14c824e2bf90ab4a51a9c8be98a361ef545eea27f2abedaabf68f3
generated_at: 2026-10-29T06:42:10.133260+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/account-protection.test.ts

## Purpose

Integration test that verifies the staff-account protection rule end-to-end: a caller holding a users permission key may modify a plain customer's account, but may modify an account that holds a staff role **only** if that caller also holds `assign:Role` (which, among preset roles, only the administrator does, and no API key can hold). Every row in the shared protection table is exercised against every account kind and every role that holds the row's key, plus a dedicated API-key suite.

## Key elements

- **`TENANT_ROLES`** – `PRESET_ROLES` filtered to tenant-scoped, assignable roles (excludes `system`).
- **`holdersOf(key)`** – returns the names of tenant roles whose permission list includes `key`.
- **`managesRoles(role)`** – boolean: does the role carry `assign:Role`?
- **`outcomeOf(response)`** – collapses an HTTP response to one of `'passed'`, `'ROLE_MANAGEMENT_REQUIRED'`, or `'refused:<code>'`.
- **`send(bearer, request)`** – issues a prepared `ProtectionRequest` with `Authorization` and a random `Idempotency-Key`.
- **`runRow(row, callerRole)`** – authenticates as the caller, creates five owner accounts (customer, staff, admin, platform-only, self), fires the row's request against each, and asserts the expected outcome map.
- **`describe('the protection of staff accounts…')`** – iterates `PROTECTION_ROWS`; for each row asserts at least one role holds the key, runs `runRow` per holder, and confirms a customer (without the key) is refused with `FORBIDDEN` (not `ROLE_MANAGEMENT_REQUIRED`).
- **`describe('an API key holds exactly…')`** – mints a key with `update:User`, patches a customer (passes) and an admin (refused with `ROLE_MANAGEMENT_REQUIRED`); also asserts that minting a key with `assign:Role` is rejected.
- **`patchAsKey(secret, owner)`** – helper that issues `PATCH /users/:id` with a raw API-key bearer and reduces the response via `outcomeOf`.

## Relationships

- **`src/kernel/permissions.ts`** – source of `PRESET_ROLES`; the test reads role names, scopes, assignability flags, and permission lists to decide which roles are callers and which can manage roles.
- **`tests/support/account-protection-rows.ts`** – supplies `PROTECTION_ROWS` (the table of routes/keys), `createOwner` (seeds an account with a given role/scope), and the `Owner`, `ProtectionRequest`, `ProtectionRow` types.
- **`tests/support/credentials.ts`** – `credentialHolding(keys)` mints a real API key carrying exactly the listed permissions; used in the key-specific suite.
- **`tests/support/http.ts`** – `api()` (supertest instance) and `authenticateAsRole(role)` (returns a bearer token + user object for a named preset role).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` boots a real database so every request hits live queries and constraints.

## Notes

- Runs against a **real** database (`setupTestDb()`), not mocks; each test is stateful in that sense.
- The `self` owner (the caller modifying their own account) always expects `'passed'` regardless of role or target kind — the protection rule does not gate self-modification.
- `Idempotency-Key` is a random string per call; this is purely to satisfy middleware, not to test idempotency.
- The customer-without-key case asserts `refused:FORBIDDEN` specifically, distinguishing "doesn't hold the key" from "holds the key but lacks role management" (`ROLE_MANAGEMENT_REQUIRED`).
- The API-key suite proves a **negative** capability: minting a key with `assign:Role` must fail, so no key can ever reach a staff account.
- The prose rule is referenced at `docs/theory/authorization.md#protecting-people`.
