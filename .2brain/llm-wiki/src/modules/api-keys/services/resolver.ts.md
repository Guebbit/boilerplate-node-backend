---
source: src/modules/api-keys/services/resolver.ts
source_sha256: 4329a98f57aa8a182846e51cebf26d80ab5d55d176a9abd9ea4fc7c5c06bb82d
context_sha256: edc5ff2a45e3bde2c907abf0dac97451b975120659c15c1954d27dd1342520aa
generated_at: 2026-11-22T04:23:43.434412+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/services/resolver.ts

## Purpose
Implements the `CredentialResolver` that the api-keys module installs into `src/kernel/authentication.ts`. It turns a presented `sk_...` bearer token into the `Caller` it names. The caller is re-floored against the minter's *current* permissions on every request. `module.ts` only registers the result (from `onRegistered`); the resolution logic lives here.

## Key elements
- **`fromBearerToken(token)`** (exported): the verify path. It runs these steps in order:
  1. Parse the token. If it is malformed, it returns `{ miss: 'malformed' }`.
  2. Look up the active key by public prefix.
  3. Verify the hash.
  4. Re-derive the minter's current caller.
  5. Stamp last-used times.
  6. Intersect the key's stored permissions with the minter's currently held rules.
  7. Return `{ ok: { caller, credentialId } }`.

  Every refusal resolves a `{ miss }` and none throws.
- **`currentCallerOf(apiKey)`** (private): looks up the minter through the users service. It returns `undefined` if the minter is deactivated, soft-deleted or gone. Otherwise it reads the minter's roles through the access service. The staff `roles.tenant` counts only if `authenticatorEnabledAt` is set. It then builds the caller with `keysInScope` and `assembleCaller`.
- **`missFor(token, prefix)`** (private): runs when no *active* key matches. It uses `findAnyByPrefix` and returns `revoked` or `expired` only if the presented secret matches the retired row's hash. Otherwise it returns `invalid_signature`, so a guessed prefix looks the same as a never-minted one.

## Relationships
- **`src/kernel/authentication.ts`**: supplies the `Resolution` and `ResolvedCredential` types. `resolveCredential` there consumes the `{ miss }` / `{ ok }` outcomes.
- **`src/kernel/permissions.ts`**: provides `isRuleId`, `keysInScope` and `assembleCaller`.
- **`src/kernel/ability.ts`**: `heldRules` reads the rules the minter's CASL ability was built from.
- **`src/modules/access/index.ts`**: provides `accessService`, used to read the minter's roles.
- **`src/modules/users/index.ts`**: provides `userService`, used to load the minter and to mark the minter active (which the inactivity reaper reads).
- **`src/modules/api-keys/repository.ts`**: `findActiveByPrefix`, `findAnyByPrefix` and `touchLastUsed`.
- **`src/modules/api-keys/credentials.ts`**: `verifyApiKey`, `parseApiKeyToken` and `displayIdOf`.
- **`src/modules/api-keys/model.ts`**: provides the `ApiKeyDocument` type.
- **`src/infrastructure/adapters/logger.ts`**: logs a warning when a last-used stamp fails.
- **`src/types/index.ts`**: provides the `Caller` type.
- **`src/modules/api-keys/module.ts`**: registers `fromBearerToken` as the resolver.

## Notes
- **Subset rule:** a key never holds more than its minter does. The key's stored permission snapshot is never trusted as-is. It is filtered through `heldRules(currentCaller)`, using the literal rules. For example, a minter who is now only a customer holds `read:Order`, not `display:Order`.
- **Baseline permissions:** the final permission set is the held rules unioned with `keysInScope(null, 'tenant')`, the stranger baseline. This keeps public-storefront read scopes working for keys minted for something else.
- **Minter removal:** a missing minter (banned, soft-deleted, erased) yields `revoked`. It does so before any stamping, and an unban or restore brings the keys back untouched.
- **Fire-and-forget stamps:** the last-used stamp on the key and the minter's activity stamp are not awaited. Rejections are caught and logged as warnings so they never surface as unhandled rejections.
- **Deliberate lookup choice:** the minter is loaded with `findAuthenticatableById` instead of `findById`, so a deactivated minter loses access on their next request rather than at their next login.
- **Mint-time counterpart:** a comment points to the mint-time half of the subset rule in a separate api-keys service file; it is not imported here.
