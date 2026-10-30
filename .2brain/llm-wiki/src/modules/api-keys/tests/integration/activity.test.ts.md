---
source: src/modules/api-keys/tests/integration/activity.test.ts
sha256: 371adaedc7bd61881d555cb22ad5d173a013c402313ec45ded0a5c67f21ddbe7
generated_at: 2026-10-29T03:15:35.035236+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/activity.test.ts

## Purpose

Integration test verifying that resolving (using) an API key stamps the minter's `lastApiKeyUseAt` timestamp. This exists to prove the inactivity reaper will not treat a key-only account as idle, since that stamp is the sole "proof of life" signal for such accounts.

## Key elements

- **`stampOf(id)`** – Small helper that reads `lastApiKeyUseAt` directly from the user collection via `userRepository.findById`, bypassing any service-layer caching.
- **`describe('an api key in use')` / `it('stamps its minter as active')`** – The single test case: creates an admin user, mints a key with a 7-day expiry, asserts the stamp is initially `undefined`, resolves the key's secret via `resolveCredential`, then polls for the stamp to appear.
- **`apiKeysModule.onRegistered?.()`** – Called once at module scope to install the credential resolver exactly as a real boot would when the module is enabled.

## Relationships

- **`@kernel/authentication`** (`resolveCredential`) – The function under test's trigger; calling it is what causes the fire-and-forget write to `lastApiKeyUseAt`.
- **`@kernel/access/tenant`** (`DEPLOYMENT_TENANT_ID`) – Supplies the tenant identifier for the `TenantCallerContext` passed to `mint`.
- **`@kernel/permissions`** (`permissionsOfRole`) – Builds the admin permission set for the mint context.
- **`@modules/api-keys/module`** – Its `onRegistered` hook wires the credential resolver into the kernel.
- **`@modules/api-keys/services/api-keys`** (`mint`) – Creates the key whose secret is then resolved.
- **`@modules/users/repository`** (`userRepository`) – Backs `stampOf` for reading the timestamp assertion.
- **`@modules/users/tests/factories`** (`createUser`, `userRepository`) – Test fixtures for user creation and direct collection access.
- **`@types`** (`TenantCallerContext`) – Typed shape for the caller context passed to `mint`.
- **`tests/support/eventually`** – Polling helper used because the stamp write is fire-and-forget and not awaited by `resolveCredential`.
- **`tests/support/setup-test-db`** – Initialises the in-memory test database before any test runs.

## Notes

- The stamp write is **fire-and-forget**: `resolveCredential` does not await it, so the test must use `eventually` to poll rather than asserting synchronously.
- `apiKeysModule.onRegistered?.()` is guarded with optional chaining; if the module's registration path changes, this line silently no-ops and the test will fail with a missing resolver rather than an import error.
- The test mints with `permissions: ['read:WebhookSubscription']` — a minimal, specific scope — so the assertion is not weakened by broad admin permissions on the key itself.
