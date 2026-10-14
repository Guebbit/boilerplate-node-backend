---
source: src/modules/api-keys/tests/integration/api-keys.test.ts
sha256: caea2191c720151d752f686e1ef3ecd5d3bf3e7ed32953fb40a4c4deaae07dc7
generated_at: 2026-10-14T15:03:01.665486+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/api-keys.test.ts

## Purpose

Integration test suite that proves the two-phase permission boundary for API keys against a **real database**: (1) at mint time, a key can only carry a subset of the caller's current permissions (never step-up-tier keys); and (2) at every subsequent resolve, the key's effective permissions are re-floored against the minter's *current* state (role, active flag) rather than the snapshot captured at mint. This behavior cannot be demonstrated with mocked repositories, so the suite persists real users, assigns/revokes real roles, and calls the production `resolveCredential` path.

## Key elements

- **`setupTestDb()`** — provisions an in-memory/ephemeral real database for the suite.
- **`apiKeysModule.onRegistered?.()`** — manually invokes the module's registration hook so that `registerCredentialResolver` is wired (mirrors real boot, D15).
- **`createRealUser(id)`** — factory wrapping `userRepository.create` to produce a persisted user whose role can change mid-test.
- **`contextFor(userId, permissions)`** — builds a `TenantCallerContext` (scope `tenant`, level `admin`) for mint/revoke calls.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a recorder that appends to `mockOutbox`; required because `jest.spyOn` cannot redefine a namespace getter under the SWC transform.
- **`describe('mint — the subset boundary')`** — four cases: rejects non-held permissions (422), rejects step-up-tier permissions even if held, accepts a valid subset and returns `sk_…` once, allows a wildcard-holder to name a specific sub-key.
- **`describe('a self key is not an any key')`** — proves `orders.self.read` ≠ `orders.any.read` at both mint and resolve time.
- **`describe('the credential-resolve path — re-floored at every use, not just at mint')`** — core integration cases: demoting the minter from `admin`→`customer` shrinks the key's permissions *and* level without mutating the stored document; deactivating the minter (`active: false`) leaves the key resolvable but at guest floor; `credentialId` is the display-shaped `sk_<publicPrefix>`, never the secret.
- **`describe('revoke')`** — verifies `revoke` makes the credential unresolvable immediately.

## Relationships

- **`src/modules/api-keys/module.ts`** — `apiKeysModule.onRegistered?.()` triggers `registerCredentialResolver`, which is the production path that makes `resolveCredential` return results.
- **`src/modules/api-keys/services/api-keys.ts`** — the `mint` and `revoke` functions under test.
- **`src/modules/api-keys/repository.ts`** — `apiKeyRepository.findById` used to assert the stored document is untouched after demotion/deactivation.
- **`src/kernel/authentication.ts`** — `resolveCredential` is the function whose re-floor behavior the suite exercises end-to-end.
- **`src/kernel/permissions.ts`** — `permissionsOfRole('admin' | 'customer')` supplies the permission sets for context construction and assertions.
- **`src/modules/access/index.ts` / `service.ts`** — `assignRole` changes the minter's role between mint and resolve, driving the re-floor scenarios.
- **`src/modules/users/repository.ts`** — `userRepository.create` / `updateMany` create and deactivate the minter account.
- **`src/modules/account/index.ts`** — `ACCOUNT_SESSIONS_REVOKED` event imported (likely asserted in the truncated revoke/session-revocation case).
- **`src/kernel/events.ts`** — `resetDomainEvents` / `emitDomainEvent` for event isolation between tests.
- **`src/kernel/registry.ts`** + **`src/modules.ts`** — `registerModules` / `enabledModules` used to bootstrap the module graph the same way production does.
- **`src/infrastructure/adapters/logger.ts`** — `logger` imported for log-output assertions (visible in the truncated portion).

## Notes

- **Why a real DB is required:** the "re-floor at every use" guarantee depends on `resolveCredential` re-reading the minter's live role/active state. A mocked repository would return the same snapshot every call, making the test vacuous. This suite is the *only* place that proof exists.
- **`mockOutbox` naming:** `jest.mock` hoisting forces any closed-over variable to carry the `mock`/`Mock` prefix; do not rename.
- **`apiKeysModule.onRegistered?.()`** is called with optional chaining because the hook is an interface obligation (D15) — if the module omits it, the test still runs but `resolveCredential` will return nothing, surfacing the gap as a test failure rather than a crash.
- **Document-untouched invariant:** several assertions explicitly check `stored?.revokedAt` is `undefined` after demotion/deactivation, encoding the design rule that a key's stored record is immutable except by explicit `revoke`.
- **`IN_A_WEEK`** is a one-off ISO string 7 days out; the one-year ceiling is a business rule tested elsewhere.
