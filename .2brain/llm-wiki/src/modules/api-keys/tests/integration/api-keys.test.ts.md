---
source: src/modules/api-keys/tests/integration/api-keys.test.ts
sha256: 0ee8e8431a31e64f3c022c2c698d5f5d56957de792dd4b2a131bff7b4270b591
generated_at: 2026-09-27T14:42:18.490674+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/api-keys.test.ts

## Purpose
Integration test suite (real database, no mocked repository) that proves the two enforcement halves of "a credential holds a subset of the minter's permissions, never more": the mint-time subset check in `services/api-keys.ts` and the use-time re-flooring in `module.ts`'s `CredentialResolver`. It also covers revocation, expiry, hard-delete cascading, and the `touchLastUsed` stamp path.

## Key elements
- **Top-level setup** — calls `setupTestDb()` and `apiKeysModule.onRegistered?.()` (the latter installs the `CredentialResolver` so `resolveCredential` returns anything at all).
- **`createRealUser(id)`** — helper that persists a real user via `userRepository.create` so the suite can mutate that user's role between mint and use.
- **`contextFor(userId, permissions)`** — builds a `TenantCallerContext` with the given permissions and `TEST_TENANT_ID`.
- **`describe('mint — the subset boundary')`** — three cases: mint refuses a permission the caller lacks (422); mint succeeds when all requested keys are held and returns the plaintext secret once; a wildcard-holder (admin role) can mint a key naming one specific sub-permission.
- **`describe('the credential-resolve path')`** — proves `resolveCredential` re-reads the minter's *current* role rather than trusting the mint-time snapshot (demote admin → customer, permission vanishes without the document changing); also verifies the resolved `credentialId` is the display-shaped `sk_<publicPrefix>` and never the plaintext secret.
- **`describe('revoke')`** — revocation makes the credential immediately unresolvable; a second revoke is idempotent.
- **`describe('an expired credential')`** — a key past `expiresAt` is unresolvable with no explicit revoke.
- **`describe('a hard-deleted user takes their credentials with them')`** — calls `userService.removeById(id, true)` and asserts all credentials minted by that user are erased from the DB while another user's keys survive. Has its own `beforeEach` that calls `resetDomainEvents()` + `registerModules(enabledModules)` to fire both `subscribe()` and `onRegistered` manifest hooks.
- **`describe('touchLastUsed')`** — verifies the timestamp stamp is written; a second case mocks `touchLastUsed` to reject and asserts `logger.warn` fires while `resolveCredential` still succeeds (fire-and-forget, per B8).

## Relationships
- **`src/kernel/authentication.ts`** — `resolveCredential` is the primary function under test in the resolve, revoke, expiry, and hard-delete blocks.
- **`src/modules/api-keys/services/api-keys.ts`** — `mint` and `revoke` are the service-level actions exercised by most cases.
- **`src/modules/api-keys/module.ts`** — its `onRegistered` hook (D15) is invoked at the top to install the credential resolver; its `CredentialResolver` / `fromBearerToken` path is what the resolve tests drive.
- **`src/modules/api-keys/repository.ts`** — `apiKeyRepository` is used directly for `create`, `findById`, and `touchLastUsed`; the last is also spied on in the failure case.
- **`src/modules/api-keys/credentials.ts`** — `mintApiKey()` generates the `{ plaintext, publicPrefix, hash }` triple for direct-DB insertion in the expiry and touch tests.
- **`src/modules/users/repository.ts`** — `userRepository.create` creates the real users the suite mutates.
- **`src/modules/users/service.ts`** — `userService.removeById(id, true)` triggers the hard-delete cascade.
- **`src/modules/access/index.ts`** — `assignRole` changes a user's role (admin → customer) to drive the re-flooring assertion.
- **`src/kernel/permissions.ts`** — `permissionsOfRole('admin')` supplies the full permission set for wildcard-mint tests.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears event subscriptions between the hard-delete cases.
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` re-runs manifest hooks (subscribe + onRegistered) in the hard-delete `beforeEach`.
- **`src/modules.ts`** — provides `enabledModules`, the list passed to `registerModules`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is spied on to confirm the touch-failure warning is emitted.

## Notes
- This is an **integration** test: it runs against a real database (`setupTestDb`) and exercises the full `resolveCredential` path, not a mocked repository. The file header comment explicitly calls out that only this kind of test can prove the re-floor is a live re-read, not a cached snapshot.
- The hard-delete block needs its own `beforeEach` calling `registerModules` because `subscribe()` (the event listener that cascades the delete) and `onRegistered` (the resolver) are both **manifest hooks** that only fire through the registry—simply importing the module does not install either (same pattern as `wishlist/tests/integration/service.test.ts`).
- The "touch fails" test must first `assignRole(userId, …, 'admin')` because `resolveCredential` re-floors against the minter's *current* membership, not the permissions claimed in the mint context.
- References to D15 (credential-resolver registration), B25 (hard-delete erases credentials), and B8 (fire-and-forget touch) are design-decision IDs from the project's decision log; the tests are the executable specification for those decisions.
