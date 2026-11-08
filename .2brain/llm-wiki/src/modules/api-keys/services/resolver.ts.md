---
source: src/modules/api-keys/services/resolver.ts
sha256: 11cc02568d30a368780881f6a6b1dceaf64210bfd9f6cd3a6738d61086d19964
generated_at: 2026-11-08T05:04:45.039997+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/resolver.ts

## Purpose

The credential-resolution path for `sk_...` API key bearer tokens. It turns a presented token into a `Caller` by verifying the key against the repository and re-deriving the minter's **current** permissions on every request. Registered into `kernel/authentication.ts` by `module.ts` at import time; this file contains the actual resolution logic.

## Key elements

- **`fromBearerToken(token)`** *(exported)* — Entry point. Parses the token, looks up the active key by public prefix, verifies the hash, re-floors permissions against the minter's live state, and returns `Resolution<ResolvedCredential>`. Every failure mode (malformed, unknown prefix, wrong secret, revoked, expired, minter gone) resolves to a `{ miss }` object; it never throws.
- **`currentCallerOf(apiKey)`** *(internal)* — Re-derives the minter's current `Caller` by calling `userService.findAuthenticatableById` → `accessService.rolesOf` → `keysInScope` → `assembleCaller`. Returns `undefined` if the minter no longer exists in an authenticatable state.
- **`missFor(token, publicPrefix)`** *(internal)* — Distinguishes `invalid_signature` (no row or wrong hash) from `revoked`/`expired` (a matching secret on a retired row), so an unknown prefix is indistinguishable from a never-minted one.

## Relationships

- **`src/kernel/authentication.ts`** — This file is the resolver that module invokes; it imports `Resolution` and `ResolvedCredential` types from it.
- **`src/kernel/permissions.ts`** — Uses `keysInScope` (permission derivation), `isRuleId` (filtering stored permission strings), and `assembleCaller` (building the final `Caller`).
- **`src/kernel/ability.ts`** — Uses `heldRules` to read the rule set the CASL ability was constructed from, then intersects it with the key's stored permissions.
- **`src/modules/api-keys/repository.ts`** — Calls `apiKeyRepository.findActiveByPrefix`, `findAnyByPrefix`, and `touchLastUsed`.
- **`src/modules/api-keys/credentials.ts`** — Calls `parseApiKeyToken`, `verifyApiKey`, and `displayIdOf`.
- **`src/modules/api-keys/model.ts`** — Imports `ApiKeyDocument` type.
- **`src/modules/users/index.ts` / `src/modules/users/services/index.ts`** — Calls `userService.findAuthenticatableById` and `touchApiKeyUse`.
- **`src/modules/access/index.ts` / `src/modules/access/services/index.ts`** — Calls `accessService.rolesOf` to get the minter's current roles.
- **`src/infrastructure/adapters/logger.ts`** — Logs warnings for fire-and-forget stamp failures.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Imports the `Caller` type.

## Notes

- **Never trusts the key's stored permission snapshot.** Permissions are re-derived from the minter's live roles on every request; a demoted minter immediately loses the delta on the next call.
- **`findAuthenticatableById`, not `findById`.** A deactivated or soft-deleted minter stops granting access on their very next request, not at next login. An unban/restore revives the key without touching the document.
- **Staff role is conditional.** The minter's tenant staff permissions only apply if `authenticatorEnabledAt` is set — a key never exceeds what the person holds in their own session.
- **Floor against stranger baseline.** The final permission set is unioned with `keysInScope(null, 'tenant')` so a key can never see *less* than the public storefront.
- **Fire-and-forget stamps.** `touchLastUsed` and `touchApiKeyUse` are `void`-ed with a `.catch` that logs via `logger.warn`; a lost stamp costs only a stale reading, never a failed request.
- **No thrown errors.** All refusal paths resolve to a discriminated `{ miss }` union member, matching the contract `kernel/authentication.ts#resolveCredential` expects.
