---
source: src/modules/api-keys/tests/integration/activity.test.ts
source_sha256: 371adaedc7bd61881d555cb22ad5d173a013c402313ec45ded0a5c67f21ddbe7
context_sha256: 8aca78bf0741393875d81463d830586508e693cc0798245b1784953c1e68d83a
generated_at: 2026-11-22T04:24:07.515750+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/integration/activity.test.ts

## Purpose
Integration test verifying that using an API key marks the account that minted it as active. The inactivity reaper reads `lastApiKeyUseAt`, so an account that only authenticates via API keys must not be treated as idle. The test checks that resolving a key's credential stamps that field on the minter.

## Key elements
- `setupTestDb()` — sets up the test database for the suite.
- `apiKeysModule.onRegistered?.()` — called at load time to install the credential resolver, mimicking a real boot once the module is enabled.
- `stampOf(id)` — helper that reads `lastApiKeyUseAt` directly from the user repository (`userRepository.findById`).
- `describe('an api key in use')` / `it('stamps its minter as active')` — the single test:
  1. Creates a verified `admin` user with `createUser`.
  2. Builds a `TenantCallerContext` (tenant scope, `DEPLOYMENT_TENANT_ID`, admin permissions via `permissionsOfRole('admin')`, not unrestricted, not system).
  3. Mints a key via `mint` named `ci`, with permission `read:WebhookSubscription` and a 7-day expiry.
  4. Asserts the stamp is initially `undefined`.
  5. Calls `resolveCredential` with the minted secret and expects an `ok` property on the result.
  6. Polls with `eventually` until the stamp is defined, then asserts it is a `Date`.

## Relationships
- `@modules/api-keys/module` — its `onRegistered` hook wires the credential resolver that `resolveCredential` uses.
- `@modules/api-keys/services/api-keys` — `mint` creates the key under test.
- `@kernel/authentication` — `resolveCredential` is the action being exercised.
- `@kernel/permissions` — `permissionsOfRole` supplies the caller's permissions.
- `@kernel/access/tenant` — `DEPLOYMENT_TENANT_ID` is the tenant for the caller context.
- `@modules/users/tests/factories` — `createUser` and `userRepository` (the repository from `src/modules/users/repository.ts`) create the minter and read back the stamp.
- `@types` — provides the `TenantCallerContext` type (auth-context types).
- `@tests/eventually` and `@tests/setup-test-db` — shared test helpers for polling and DB setup.

## Notes
- The stamp write is fire-and-forget, so the test polls with `eventually` instead of asserting immediately.
- The test only asserts that the resolution has an `ok` property, not that it succeeded; the focus is the side effect on the user.
