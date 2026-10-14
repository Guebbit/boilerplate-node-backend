---
source: src/modules/api-keys/tests/integration/activity.test.ts
sha256: 760b43af70982c51cd22cad6982db11bc51c4b8c635727d02e52e0ae3008a8a4
generated_at: 2026-10-14T15:02:27.129294+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/activity.test.ts

## Purpose

Integration test that verifies resolving (i.e. "using") an API key stamps the minting account's `lastApiKeyUseAt` field. This matters because the inactivity reaper reads that timestamp; without the stamp, an account that only uses API keys would be falsely reaped as idle.

## Key elements

- **`setupTestDb()`** — initialises a fresh test database before any test runs.
- **`apiKeysModule.onRegistered?.()`** — manually triggers the module's registration hook so the credential resolver is installed, mimicking a real application boot.
- **`stampOf(id)`** *(local helper)* — reads `lastApiKeyUseAt` directly from the user collection via `userRepository.findById`.
- **`describe('an api key in use')`** — single test case:
  1. Creates a verified admin user via `createUser`.
  2. Builds a `TenantCallerContext` with `DEPLOYMENT_TENANT_ID` and admin permissions.
  3. Mints a 7-day API key with `mint`.
  4. Asserts the stamp is initially `undefined`.
  5. Calls `resolveCredential` with the minted secret (the simulated "use").
  6. Polls with `eventually` until the fire-and-forget write lands, then asserts the stamp is a `Date`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | Provides `setupTestDb` for DB lifecycle. |
| `tests/support/eventually.ts` | Provides `eventually` to poll the async fire-and-forget write. |
| `src/modules/api-keys/module.ts` | `onRegistered()` is called to install the credential resolver. |
| `src/modules/api-keys/services/api-keys.ts` | `mint` creates the test API key. |
| `src/kernel/authentication.ts` | `resolveCredential` is the unit under test (the "use" step). |
| `src/kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` seeds the caller context. |
| `src/kernel/permissions.ts` | `permissionsOfRole('admin')` builds the context's permission set. |
| `src/modules/users/tests/factories.ts` | `createUser` and `userRepository` supply the test account and direct DB reads. |
| `src/types/index.ts` / `src/types/auth-context.ts` | `TenantCallerContext` type for the caller object. |

## Notes

- The `lastApiKeyUseAt` write is **fire-and-forget** inside `resolveCredential`; the test cannot simply `await` it. The `eventually` poller is the intended pattern here.
- `apiKeysModule.onRegistered?.()` is called **outside** any test (at module scope). Forgetting this means `resolveCredential` is never registered and the test fails with an unrecognised credential.
- The test uses the real `mint` service and the real credential resolver — only the DB is a test fixture. There is no mocking of the API-key pipeline.
