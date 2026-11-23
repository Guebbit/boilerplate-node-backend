---
source: src/modules/api-keys/tests/integration/api-keys.test.ts
source_sha256: a166aaf8d04fcf3313adfbbd3cd3fa28db5cc31cdb0e818d7e03fa484a2379d7
context_sha256: 1bb2e79b0f65abeeb7c48a4db81e725929f3862646a001257828ed4a3b895ac4
generated_at: 2026-11-22T04:24:29.226490+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/integration/api-keys.test.ts

## Purpose
Integration suite proving the API-key invariant "a credential holds a subset of the minter's permissions, never more". Mint-time enforcement (`isMintable` in `src/modules/api-keys/services/api-keys.ts`) is checked against the caller's own permissions. The suite also checks that every later use re-reads what the minter holds *now* through the real `resolveCredential` path, a real database and real role changes. A mocked repository could only prove the mint half.

## Key elements
- **`mockOutbox` and the `jest.mock` of `@infrastructure/adapters/mailer`**: replaces `enqueueEmail` (rather than spying on it) with a function that records `{to, template, data}`. The `mock*` prefix is required because `jest.mock` is hoisted above the imports.
- **`setupTestDb()`**: provides the real database.
- **`apiKeysModule.onRegistered?.()`**: called at module load so `registerCredentialResolver` runs and `resolveCredential` can answer, as it would on a real boot.
- **`IN_A_WEEK`**: a valid expiry for mints, one week out and inside the one-year ceiling.
- **`createRealUser(id)`**: persists a user through `userRepository`, so the suite can change that user's role later.
- **`makeArmedAdmin(userId)`**: seeds a tenant `admin` membership and arms an authenticator, since a staff role grants nothing and a key borrows staff rules only while one is armed.
- **`contextFor(userId, permissions)`**: builds a `TenantCallerContext` for `mint`, with the user's id, `TEST_TENANT_ID`, tenant scope, and the given permissions.
- **Test groups visible in this excerpt**:
  - `mint — the subset boundary`: `mint` returns status 422 for:
    - a permission the caller doesn't hold;
    - a permission with a step-up tier (`delete:User`);
    - a permission no credential route uses (`read:Stats`, `credential: false`).

    It succeeds when every requested key is held, returning a plaintext secret starting `sk_` once, and when a wildcard holder names one specific key.
  - `an own-rows rule is not a staff rule`: a holder of only `read:Order` can't mint `display:Order`. A minted `display:Order` stops resolving once its minter loses the staff role.
  - `the credential-resolve path — re-floored at every use`: after the minter is demoted, the key's permissions shrink while the document is untouched. If the minter is deactivated, the key stops resolving, `revokedAt` stays unset, and it resolves again after unban. The group also starts a test on carrying the credential id for the audit trail, which continues past this excerpt.

## Relationships
- **`src/modules/api-keys/module.ts`**: the default import `apiKeysModule`; its `onRegistered` hook registers the `CredentialResolver` that the suite exercises.
- **`src/modules/api-keys/services/api-keys.ts`**: `mint` and `revoke` are imported from here. `mint` is called throughout the visible tests.
- **`src/modules/api-keys/repository.ts`**: `apiKeyRepository` is imported and used to read the stored key back after a ban, confirming it is not revoked.
- **`src/modules/api-keys/credentials.ts`**: `mintApiKey` is imported.
- **`src/kernel/authentication.ts`**: `resolveCredential` is imported. The visible tests resolve through the `credentialOf` helper from `@tests/credentials`.
- **`src/kernel/permissions.ts`**: `keysInScope` builds the permission sets for the roles used in the tests.
- **`src/modules/access/index.ts`**: `accessService` is imported; its `revokeRole` is used to demote the minter.
- **`src/modules/access/services/index.ts`**: a neighbor in the dependency graph; the visible code does not use it directly.
- **`src/modules/access/tests/factories.ts`**: `seedMembership` seeds the admin membership.
- **`src/kernel/registry.ts` and `src/kernel/events.ts`**: `registerModules`, `resetDomainEvents` and `emitDomainEvent` are imported.
- **`src/modules/account/index.ts`**: imports `ACCOUNT_SESSIONS_REVOKED`.
- **`src/modules/account/tests/unit/family-liveness.test.ts`**: a neighbor in the dependency graph; the visible code does not use it directly.
- **`src/modules.ts`**: `enabledModules` is imported.
- **`src/infrastructure/adapters/logger.ts`**: `logger` is imported.
- **Other imports** that I could not match to a graph neighbor: `@modules/users`, `userService`, and the `@tests/*` helpers (`callerContextAs`, `armAuthenticator`, `setupTestDb`).

## Notes
- The mailer is replaced because `jest.spyOn` can't redefine a namespace import's getter under the mutation run's swc transform (see `tests/support/ports.ts`).
- Users are created with `createRealUser`, one unique id per test, and role changes go through `accessService`. This is the way the tests demote a minter without editing the key document.
- `if (!minted.data) throw new Error('setup failed...')` guards are used to narrow types and to fail clearly when setup is wrong.
