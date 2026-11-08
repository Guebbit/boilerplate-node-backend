---
source: src/modules/api-keys/tests/integration/activity.test.ts
sha256: 371adaedc7bd61881d555cb22ad5d173a013c402313ec45ded0a5c67f21ddbe7
generated_at: 2026-11-08T05:05:11.786699+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/activity.test.ts

## Purpose

Integration test verifying that resolving (using) an API key stamps the minter's account with `lastApiKeyUseAt`. This guarantees a key-only account is never mistaken for idle by the inactivity reaper. The test exercises the full credential-resolution path rather than the write in isolation.

## Key elements

- **`stampOf(id)`** — helper that reads `lastApiKeyUseAt` directly from the user collection via `userRepository.findById`.
- **`apiKeysModule.onRegistered?.()`** — called once after DB setup to install the credential resolver, mirroring what a real boot does when the module is enabled.
- **`describe('an api key in use')` → `it('stamps its minter as active')`** — mints a key for a verified admin user, calls `resolveCredential` with the secret, then asserts `lastApiKeyUseAt` transitions from `undefined` to a `Date` instance.

## Relationships

- **`@modules/api-keys/module`** — triggers `onRegistered` to register the credential resolver into the kernel.
- **`@modules/api-keys/services/api-keys`** — `mint` is the service that creates the key under test.
- **`@kernel/authentication`** — `resolveCredential` is the entry point that simulates a real key use and triggers the stamp write.
- **`@kernel/permissions`** — `permissionsOfRole('admin')` builds the auth context needed to mint.
- **`@kernel/access/tenant`** — supplies `DEPLOYMENT_TENANT_ID` for the test context.
- **`@modules/users/tests/factories`** — provides `createUser` (test fixture) and `userRepository` (read-back verification).
- **`tests/support/eventually.ts`** — polls until the fire-and-forget stamp write lands.
- **`tests/support/setup-test-db.ts`** — initializes a clean in-memory/ephemeral database.
- **`@types`** — `TenantCallerContext` shapes the minting context.

## Notes

- The stamp write is **fire-and-forget**; the test uses `eventually` (polling) rather than awaiting the write directly. Do not add a bare `expect` immediately after `resolveCredential`—the write may not have landed yet.
- `apiKeysModule.onRegistered?.()` uses an optional chain because the hook is only present when the module is actually registered; in test isolation it may be a no-op, but here it is expected to install the resolver.
- The module-level doc comment is the primary rationale for this test's existence: without it, key-only accounts would be reaped as idle.
