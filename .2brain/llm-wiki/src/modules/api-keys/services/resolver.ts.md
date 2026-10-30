---
source: src/modules/api-keys/services/resolver.ts
sha256: 905156cc645922a3a8cca7649ae5be782000aa6264c7fd3eddb3df108e3a9117
generated_at: 2026-10-29T03:15:08.308018+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/resolver.ts

## Purpose

Implements the `sk_...` bearer-token resolution path for the API-keys module. Given a raw token, it parses, looks up, verifies, and re-floors the credential against the minter's **current** permissions on every request, returning a `Resolution<ResolvedCredential>` that the kernel's authentication layer consumes. `module.ts` registers this function at import time; the logic itself lives here.

## Key elements

- **`fromBearerToken`** *(exported)* — Entry point. Parses the token, performs a prefix lookup, hash-verifies the secret, re-derives the minter's current caller, intersects the key's stored permissions with the minter's now-held rules, unions the anonymous baseline, and returns `{ ok: ResolvedCredential }` or `{ miss: … }`. All failure branches resolve; none throw.
- **`currentCallerOf`** *(private)* — Re-derives the minter's tenant `Caller` from `userService.findAuthenticatableById` → `accessService.rolesOf` → `keysInScope` → `assembleCaller`. A `null` staff-role input when the authenticator app is not armed mirrors the session-path rule.
- **`missFor`** *(private)* — Disambiguates why an *active* lookup found nothing: `invalid_signature` (no row or wrong hash) vs. `revoked`/`expired` (hash matches a retired row). Prevents prefix-guessing from being distinguishable from a never-minted key.

## Relationships

- **`@kernel/authentication`** — Supplies the `Resolution` / `ResolvedCredential` return-type contract that `fromBearerToken` fulfils.
- **`@kernel/permissions`** — Provides `keysInScope` (permission derivation) and `assembleCaller` (caller construction); both are called rather than re-implemented.
- **`@kernel/ability`** — `heldRules` extracts the literal CASL rule set from a caller so the key's stored permissions can be intersected against what the minter actually holds today.
- **`@modules/access`** — `accessService.rolesOf` fetches the minter's current role list for the tenant.
- **`@modules/users`** — `userService.findAuthenticatableById` loads the minter (refusing deactivated/deleted accounts); `userService.touchApiKeyUse` stamps the minter as active for the inactivity reaper.
- **`../repository`** — `apiKeyRepository.findActiveByPrefix`, `findAnyByPrefix`, and `touchLastUsed` drive the lookup and side-effect stamping.
- **`../credentials`** — `parseApiKeyToken`, `verifyApiKey`, `displayIdOf` handle token shape, hash comparison, and public-ID derivation.
- **`@infrastructure/adapters/logger`** — Logs the two fire-and-forget stamping failures (`touchLastUsed`, `touchApiKeyUse`) so they don't surface as unhandled rejections.
- **`@types`** — `Caller` type used throughout.

## Notes

- **All refusals resolve, never throw.** Malformed, unknown, wrong-secret, revoked, expired, and minter-gone all produce `{ miss: … }`, matching the kernel's expectation.
- **Fire-and-forget side effects.** `touchLastUsed` and `touchApiKeyUse` are `void` + `.catch(logger.warn)`; a lost stamp costs only a stale reading, never a failed request.
- **Permission floor is computed per-request.** The key's effective scope is `stored ∩ heldRules(currentCaller)` ∪ `keysInScope(null, 'tenant')` (the anonymous baseline). A minter who downgrades from staff to customer immediately loses staff-only rules on their next key use.
- **`findAuthenticatableById` over `findById`.** A deactivated or soft-deleted minter stops granting access on the very next request; an unban or restore brings keys back untouched.
- **Staff role in a key requires an armed authenticator.** Mirrors the session-path rule in `callerInScope`; a key never holds more than the person's active session would.
