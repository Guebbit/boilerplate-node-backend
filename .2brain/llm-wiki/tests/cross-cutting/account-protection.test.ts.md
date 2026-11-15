---
source: tests/cross-cutting/account-protection.test.ts
sha256: 2f29c9fc18222d463355511be7cea6506546bc30f42bf6fd8adce8b6503fb08b
generated_at: 2026-11-14T23:00:38.346326+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/account-protection.test.ts

## Purpose

Integration test that verifies the "protection of staff accounts" rule through the real HTTP API and a real database: a caller holding a users key may mutate a plain customer's account freely, but may only mutate an account that holds a staff role if they also hold `assign:Role` (administrator-only, never mintable as an API key). Each row in `PROTECTION_ROWS` is exercised as every role that holds the row's key, against five account kinds (customer, staff, admin, platform-only, self). A second suite confirms API keys carry only their minted permissions and cannot impersonate their minter.

## Key elements

- **`TENANT_ROLES`** — `PRESET_ROLES` filtered to assignable tenant-scoped roles; the universe of callers.
- **`holdersOf(key)`** — returns the names of tenant roles whose permissions include `key`.
- **`managesRoles(role)`** — `true` if the role holds `assign:Role`; drives the expected outcome for staff/admin/self targets.
- **`outcomeOf(response)`** — collapses an HTTP response to one of `'passed'`, `'ROLE_MANAGEMENT_REQUIRED'`, or `'refused:<code>'`.
- **`send(bearer, request)`** — dispatches a `ProtectionRequest` via the supertest `api()` helper, attaching a random `Idempotency-Key`.
- **`runRow(row, callerRole)`** — authenticates as `callerRole`, creates all five owner kinds, fires the row's prepared request against each, and asserts the full outcome map.
- **`describe('the protection of staff accounts, row by row')`** — outer loop over `PROTECTION_ROWS`; for each row, tests every holder role and also asserts that a `customer`-role caller is refused by the key (not by the protection rule).
- **`KEY_MINTABLE`** — `{'update:User', 'ban:User'}`; the keys that can appear on an API key (`delete:User` is session-only).
- **`patchAsKey(secret, owner)`** — shorthand for `PATCH /users/:id` with a bearer secret, returning the reduced outcome.
- **`describe('an API key holds exactly the keys it was minted with')`** — verifies a key reaches a customer but is blocked on a staff account; verifies a key cannot be used against its own minter; verifies minting with `assign:Role` is rejected.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top level (import-time side effect) to provision the schema before any test runs.
- **`tests/support/http.ts`** — provides `api()` (supertest app) and `authenticateAsRole()` used by every request and by the customer-refusal check.
- **`tests/support/credentials.ts`** — `credentialHolding()` mints a key with a given permission set; `credentialOf()` resolves a key back to its caller/minter metadata.
- **`tests/support/account-protection-rows.ts`** — supplies `PROTECTION_ROWS`, `createOwner()`, and the `ProtectionRow` / `ProtectionRequest` / `Owner` types that structure the entire first suite.
- **`src/kernel/permissions.ts`** — `PRESET_ROLES` defines the role/permission matrix from which `TENANT_ROLES`, `holdersOf`, and `managesRoles` are derived.
- **`src/modules/users/tests/factories.ts`** — exports `userRepository`; the file calls `userRepository.findById()` to resolve the minter's user record for the impersonation test.

## Notes

- `setupTestDb()` runs as a module-level side effect, so the database is prepared before Jest executes any `describe` block.
- The `system` role is deliberately excluded from `TENANT_ROLES` because it is never assigned to a tenant account; tests that need it use a `platform-only` owner instead.
- The idempotency key (`protect-<random>`) is unique per `send()` call to prevent the server from replaying a prior response within the same test run.
- The "refused its own minter" test guards against a subtle bug: an API key embeds its minter's user ID, and the server must treat that ID as a *credential carrier*, not as the acting principal.
- The customer-refusal test (`refused:FORBIDDEN`) is separate from the protection tests because a `customer`-role caller lacks the key entirely — the rejection is the key check, not the `ROLE_MANAGEMENT_REQUIRED` guard.
