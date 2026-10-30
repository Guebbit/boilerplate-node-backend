---
source: src/modules/api-keys/tests/integration/api-keys.test.ts
sha256: 3165e658a2964d10e1af423db4cf0db75084201ce6268740b2012aef03f045bc
generated_at: 2026-10-29T03:15:56.713776+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/api-keys.test.ts

## Purpose

Integration tests that exercise the full credential lifecycle against a real database to prove two invariants: (1) at **mint** time a key can only hold a subset of the minter's current permissions (never more, never step-up, never session-only), and (2) at every subsequent **use** the credential's effective permissions are re-floored against what the minter holds *now*, so a demotion or deactivation immediately narrows or kills the key without the stored document ever changing.

## Key elements

- **`mockOutbox`** – in-memory array that captures every email the (mocked) mailer would enqueue; used to assert notification side-effects.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a jest.fn that pushes into `mockOutbox`; the module is fully replaced (not spied) because `jest.spyOn` cannot redefine a namespace getter under the swc transform.
- **`setupTestDb()` / `createRealUser`** – provision a real database and persisted users so that role changes, deactivation, and re-resolution actually hit storage.
- **`makeArmedAdmin(userId)`** – seeds a `tenant/admin` membership and arms the authenticator app, the two prerequisites for a caller to hold staff-scoped permissions.
- **`contextFor(userId, permissions)`** – builds a `TenantCallerContext` shaped for mint calls.
- **`describe('mint — the subset boundary')`** – asserts 422 rejection when the requested permission is not held, is step-up (`delete:User`), or is credential-ineligible (`read:Stats`); asserts success and `sk_` secret when all requested permissions are within the caller's set.
- **`describe('an own-rows rule is not a staff rule')`** – verifies `display:Order` is not implied by `read:Order`, and that revoking the minter's staff role immediately strips `display:Order` from the resolved credential.
- **`describe('the credential-resolve path …')`** – the core re-floor tests: demoting the minter (document untouched, permissions shrink), deactivating the minter (key returns `undefined` while `revokedAt` stays unset, unban restores it), and confirming the resolved caller carries a display-shaped credential id for audit rather than the raw secret.

## Relationships

- **`src/modules/api-keys/services/api-keys.ts`** – `mint` (and `revoke`) are the primary functions under test; the `isMintable` guard is exercised implicitly.
- **`src/modules/api-keys/module.ts`** – `apiKeysModule.onRegistered?.()` is called at module scope to register the `CredentialResolver`, making `resolveCredential` answer anything at all.
- **`src/kernel/authentication.ts`** – `resolveCredential` is the re-floor entry point exercised by every "use-time" assertion (via the `credentialOf` test helper).
- **`src/kernel/permissions.ts`** – `keysInScope` generates the full permission sets for admin/tenant/customer roles used in fixtures.
- **`src/modules/access/index.ts`** – `accessService.revokeRole` is the act that demotes the minter between mint and re-resolution.
- **`src/modules/access/tests/factories.ts`** – `seedMembership` provisions the tenant role assignment.
- **`src/modules/api-keys/repository.ts`** – `apiKeyRepository.findById` confirms the stored document is untouched after demotion/deactivation.
- **`src/modules/api-keys/credentials.ts`** – `mintApiKey` imported (used in the audit-trail assertion to inspect the persisted credential shape).
- **`src/kernel/registry.ts`** – `registerModules` imported for module-registration assertions.
- **`src/kernel/events.ts`** – `resetDomainEvents` / `emitDomainEvent` available for event-sourcing assertions.
- **`src/modules/account/index.ts`** – `ACCOUNT_SESSIONS_REVOKED` event constant imported (likely asserted when deactivation fires session revocation).
- **`src/modules.ts`** – `enabledModules` imported to verify module registration state.
- **`src/infrastructure/adapters/logger.ts`** – `logger` imported for potential log-output assertions.

## Notes

- **Real DB is load-bearing.** A mocked repository can prove mint-time rejection but cannot prove that `resolveCredential` re-reads the minter's current role. These tests deliberately use `setupTestDb()` + real user documents for that reason.
- **`apiKeysModule.onRegistered?.()` is a boot shim.** In production the registry calls this during boot; here it is invoked manually so `resolveCredential` has a resolver to dispatch to. Omitting it makes every "use-time" assertion return `undefined` for the wrong reason.
- **Mailer is replaced, not spied.** `jest.spyOn` fails under the project's swc transform on namespace-import getters; the `jest.mock` + `requireActual` spread pattern in `tests/support/ports.ts` is the prescribed workaround.
- **`mockOutbox` naming is mandatory.** `jest.mock` is hoisted above imports and may only close over identifiers whose names start with `mock`; renaming breaks the hoist.
- **`armAuthenticator` is required before role-based permissions exist.** A staff role grants nothing until an authenticator app is armed; without it, `keysInScope('admin', …)` would still appear in the context but the real resolve path would see no active role.
- **The "document never touched" assertion pattern.** After demotion or deactivation, the test re-reads the stored API-key document (`apiKeyRepository.findById`) and asserts `revokedAt` is still `undefined`—proving the narrowing is purely a resolve-time computation, not a write.
