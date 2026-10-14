---
source: src/modules/api-keys/services/resolver.ts
sha256: e2e73546bc2c4144f047d04944aab9381a5e183a04309965255dd17b84a47595
generated_at: 2026-10-14T15:01:42.373330+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/resolver.ts

## Purpose

Implements the `sk_...` API-key credential resolution path that the kernel's authentication system calls on every request. It parses a bearer token, verifies it against the repository, then **re-derives** the minter's current permissions from the authoritative source (rather than trusting the key's stored snapshot) and returns a `Caller` whose key set is the intersection of what the key was minted with and what the minter holds *right now*. Registered into `kernel/authentication.ts` by `module.ts` at import time.

## Key elements

- **`fromBearerToken(token)`** *(exported)* — Entry point. Parses the token, looks up the active key by public prefix, hash-verifies the secret, re-floors permissions, and returns a `Resolution<ResolvedCredential>` (`{ ok }` or `{ miss }`). Never throws; every refusal is a resolved miss.
- **`currentCallerOf(apiKey)`** *(internal)* — Re-derives the minter's live caller via `userService.findAuthenticatableById` → `rolesOf` → `keysInScope` → `assembleCaller`. Returns `undefined` if the minter is deactivated/deleted, which causes the key to hold zero permissions.
- **`missFor(token, publicPrefix)`** *(internal)* — Distinguishes `invalid_signature` (no matching row or wrong secret) from `revoked`/`expired` (matching secret on a retired row) so a guessed prefix is indistinguishable from a never-minted key.

## Relationships

- **`src/kernel/authentication.ts`** — Provides the `Resolution` / `ResolvedCredential` contract this file satisfies; `module.ts` wires `fromBearerToken` in as a registered credential source.
- **`src/kernel/permissions.ts`** — Supplies `keysInScope` (the authoritative permission derivation), `assembleCaller`, and `levelOfRoles`, all used to build the returned `Caller`.
- **`src/kernel/ability.ts`** — Supplies `heldKeys`, which reads the raw key set a CASL ability was built from (needed to distinguish `self` vs `any` keys that CASL's collapsed `can()` would conflate).
- **`src/modules/access/index.ts` / `service.ts`** — Provides `rolesOf`, the tenant-level role lookup used to derive current permissions.
- **`src/modules/users/index.ts` / `services/index.ts`** — Provides `userService.findAuthenticatableById` (liveness check) and `userService.touchApiKeyUse` (inactivity-reaper stamp).
- **`src/modules/api-keys/repository.ts`** — `findActiveByPrefix`, `findAnyByPrefix`, and `touchLastUsed` for the lookup and bookkeeping.
- **`src/modules/api-keys/credentials.ts`** — `parseApiKeyToken`, `verifyApiKey` (hash compare), and `displayIdOf` (credential ID for audit).
- **`src/modules/api-keys/model.ts`** — `ApiKeyDocument` shape consumed throughout.
- **`src/infrastructure/adapters/logger.ts`** — Logs the fire-and-forget `touchLastUsed` / `touchApiKeyUse` rejections.
- **`src/types/auth-context.ts` / `index.ts`** — `Caller` type used in return values.

## Notes

- **Re-floor, don't cache.** Permissions are re-derived from the minter's current role/ability on *every* request. A key can only shrink over time, never grow. This mirrors the same defensive pattern `keysInScope` uses internally.
- **`heldKeys` over `can()`.** The intersection of minted permissions with the minter's current keys uses the raw key set (`heldKeys`), not CASL's collapsed action/subject answer, because `orders.self.read` and `orders.any.read` collapse to the same `read` on `Order`.
- **`findAuthenticatableById`, not `findById`.** A deactivated or soft-deleted minter loses all key access on the very next request, not at their next login.
- **Floor is never below a stranger.** The resolved permission set is always unioned with `keysInScope(null, 'tenant')` so a key minted for a narrow purpose can't accidentally hide public catalogue data.
- **Two fire-and-forget side effects.** `touchLastUsed` and `touchApiKeyUse` are `void`-ed; their rejections are caught and logged locally to avoid unhandled-rejection noise. A lost stamp costs at most a stale inactivity reading.
- **Miss-reason ordering is intentional.** `malformed` → `invalid_signature` → `revoked`/`expired` ensures an attacker can never distinguish "this prefix was never minted" from "this prefix exists but I got the secret wrong."
