---
source: src/modules/api-keys/tests/integration/api-keys.test.ts
sha256: 3165e658a2964d10e1af423db4cf0db75084201ce6268740b2012aef03f045bc
generated_at: 2026-11-08T05:05:31.428486+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/api-keys.test.ts

## Purpose

Integration test suite that proves the "credential ⊆ minter" invariant end-to-end against a real database. It validates both halves of the boundary: (1) mint-time refusal when the caller lacks a requested permission, and (2) use-time re-flooring where `resolveCredential` re-reads the minter's *current* permissions rather than trusting the snapshot stored on the key document.

## Key elements

- **`mockOutbox`** — Array that captures every queued email. Named `mock*` because `jest.mock` hoisting only permits closing over identifiers with that prefix.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — Replaces the mailer module (not a spy) because `jest.spyOn` cannot redefine a namespace-import getter under the SWC transform.
- **`setupTestDb()`** — Boots a real test database; required because the re-flooring tests need a persisted user whose role can change between mint and use.
- **`apiKeysModule.onRegistered?.()`** — Invokes the module's registration hook so `resolveCredential` is wired up, mirroring what a real boot does.
- **`createRealUser(id)`** — Persists a real user via `userRepository.create` so the suite can mutate their role/active status between assertions.
- **`makeArmedAdmin(userId)`** — Seeds a `tenant:admin` membership and arms an authenticator app, making the user's staff rules active for key minting.
- **`contextFor(userId, permissions)`** — Builds a `TenantCallerContext` shaped for `mint` calls.
- **`describe('mint — the subset boundary')`** — Four cases: missing permission → 422, step-up permission → 422, `credential: false` permission → 422, valid subset → success with `sk_` secret.
- **`describe('an own-rows rule is not a staff rule')`** — Verifies `display:Order` cannot be minted by a minter holding only `read:Order`, and that a demotion shrinks a previously-minted `display:Order` to nothing.
- **`describe('the credential-resolve path …')`** — Proves that demoting or deactivating the minter instantly narrows or kills the key's resolved permissions *without the key document changing*; also checks the audit-trail credential id is display-shaped.

## Relationships

| Neighbor | Interaction |
|----------|-------------|
| `src/kernel/authentication.ts` | Imports `resolveCredential`; the re-flooring tests exercise this real path. |
| `src/kernel/permissions.ts` | Imports `keysInScope` to derive the full admin permission set for context building. |
| `src/kernel/registry.ts` | Imports `registerModules` (module registration lifecycle). |
| `src/kernel/events.ts` | Imports `resetDomainEvents` / `emitDomainEvent` for event-driven assertions. |
| `src/modules/api-keys/module.ts` | Imports `apiKeysModule`; calls `onRegistered` to activate the `CredentialResolver`. |
| `src/modules/api-keys/services/api-keys.ts` | Imports `mint` and `revoke`; the primary SUT. |
| `src/modules/api-keys/repository.ts` | Imports `apiKeyRepository`; used to assert the stored document is *unchanged* after a demotion. |
| `src/modules/api-keys/credentials.ts` | Imports `mintApiKey` (credential helper). |
| `src/modules/access/index.ts` | Imports `accessService` for role revocation mid-test. |
| `src/modules/access/tests/factories.ts` | Imports `seedMembership` to grant `tenant:admin`. |
| `src/modules/account/index.ts` | Imports `ACCOUNT_SESSIONS_REVOKED` (event name for deactivation assertions). |
| `src/modules.ts` | Imports `enabledModules` for module-list assertions. |
| `src/infrastructure/adapters/logger.ts` | Imported as `logger` (test observability / suppression). |

## Notes

- **Real DB is mandatory for the USE-time tests.** A mocked repository can prove mint-time refusal, but only a real database + real role mutation + the real `resolveCredential` path can prove the re-read (vs. trusting a stored snapshot).
- **Mailer replacement, not spy.** `jest.spyOn` on a namespace import's getter breaks under the SWC transform used in the mutation test run (see `tests/support/ports.ts`). The module-level `jest.mock` + `requireActual` spread pattern is the workaround.
- **`mockOutbox` naming is not cosmetic.** `jest.mock` is hoisted above imports; the factory may only reference identifiers prefixed with `mock`.
- **Step-up and `credential: false` permissions are hard-denied at mint time.** They are filtered by `isMintable` in the service regardless of whether the caller holds them.
- **The key document is never mutated by a demotion or ban.** Tests explicitly assert `stored?.revokedAt` is `undefined` after a minter deactivation, confirming the "re-floor at read" design.
