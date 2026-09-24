---
source: src/modules/api-keys/tests/integration/api-keys.test.ts
sha256: 5158b9abaa9e4980c5ee6d2845ccf2c72b5e3fd06634140735815da98e060d55
generated_at: 2026-09-23T18:25:56.733820+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/api-keys.test.ts

## Purpose

Integration test suite that exercises the full API-key credential lifecycle (mint → resolve → revoke → expire) against a real database. Its central job is proving the **re-floor** guarantee: a credential's effective permissions are re-checked against the minter's *current* role at every `resolveCredential` call, not just validated once at mint time. A mocked repository can only prove the mint-time subset check; this suite proves the resolve-time check with a real role change and the real resolver path.

## Key elements

- **`setupTestDb()`** — called at module level; provisions a real database for every test in the file.
- **`createRealUser(id)`** — inserts a persisted user via `userRepository` so role assignments and permission lookups have a real row to act on.
- **`contextFor(userId, permissions)`** — builds a `TenantCallerContext` for the mint/revoke service calls.
- **`describe('mint — the subset boundary')`** — asserts `mint` rejects a permission the caller lacks (422), succeeds when all requested keys are held, and allows a wildcard-holder to name a specific key beneath it.
- **`describe('the credential-resolve path')`** — the critical "demotion" test: mints as admin, demotes to `customer`, and asserts `resolveCredential` now returns the credential with *no* api-keys permissions (document untouched, only the floor changed). Also verifies `credentialId` is the display-shaped `sk_<prefix>`, never the secret.
- **`describe('revoke')`** — asserts immediate unresolvability and idempotency of double-revoke.
- **`describe('an expired credential')`** — creates a row with a past `expiresAt` directly via `apiKeyRepository`; asserts `resolveCredential` returns `undefined` without any revoke.
- **`describe('touchLastUsed')`** — verifies `lastUsedAt` is stamped on the correct row, and (B8) that a failed fire-and-forget write logs a `logger.warn` containing `apiKeyId` while still resolving the credential.

## Relationships

- **`@modules/api-keys/module`** — imported for its *side effect* (`registerCredentialResolver`); without this import `resolveCredential` would answer nothing, mirroring real boot.
- **`@kernel/authentication` → `resolveCredential`** — the function under test in every "use" scenario.
- **`@kernel/permissions` → `permissionsOfRole`** — supplies the admin permission set used as the mint-time context.
- **`@modules/access` → `assignRole`** — performs the real role change (admin → customer) that the demotion test depends on.
- **`@modules/api-keys/services/api-keys` → `mint`, `revoke`** — the service functions whose contracts are asserted.
- **`@modules/api-keys/repository` → `apiKeyRepository`** — used directly to seed expired rows and to spy on `touchLastUsed`.
- **`@modules/api-keys/credentials` → `mintApiKey`** — generates raw `{ plaintext, publicPrefix, hash }` material for rows created outside the service layer.
- **`@modules/users/tests/factories` → `userRepository`** — creates the real user rows that role assignment and permission re-flooring operate on.
- **`@infrastructure/adapters/logger`** — spied (`logger.warn`) to assert the B8 fire-and-forget failure path is observable.
- **`@tests/callers` → `TEST_TENANT_ID`** — the shared tenant identifier for all fixtures.
- **`@tests/setup-test-db` → `setupTestDb`** — database provisioning.
- **`@types` / `@types/auth-context`** — `TenantCallerContext` type used by `contextFor`.

## Notes

- The import of `@modules/api-keys/module` is **load-bearing**: it has no named export the test uses. Removing it silently breaks every `resolveCredential` assertion.
- Two tests (expired, touchLastUsed) create repository rows directly with `as never` casts because the service-layer `mint` doesn't expose an `expiresAt` parameter; this is intentional and scoped to those edge-case setups.
- The touchLastUsed-failure test inserts `await Promise.resolve()` after `resolveCredential` to let the fire-and-forget microtask (the rejected `touchLastUsed`) execute before asserting on the `logger.warn` spy — removing that tick will make the assertion flaky.
- The demotion test requires the user to have a **real membership row** (via `assignRole`) before mint; `contextFor`'s `permissions` array alone is insufficient because `resolveCredential` re-reads the user's current role rather than trusting the mint context's claimed permissions.
