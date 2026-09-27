---
source: src/modules/api-keys/services/resolver.ts
sha256: cf1634fb080c6ca32b172f90868dfbd2bc09e5a9281d80fc47b18f4b71583115
generated_at: 2026-09-27T14:41:57.353895+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/resolver.ts

## Purpose

Implements the credential-resolution logic for `sk_…` API-key bearer tokens. Given a presented token, it parses, verifies, and re-derives the minter's **current** permissions to produce a fully-floored `Caller`. The result is registered into `kernel/authentication.ts` by `module.ts` at import time, making this file the single runtime path through which machine-to-machine credentials become a request-scoped identity.

## Key elements

- **`currentCallerOf(apiKey)`** *(private)* — Re-derives the minter's live caller by calling `userService.findAuthenticatableById`, then `rolesOf` → `keysInScope` → `assembleCaller`. Returns `undefined` if the minter is deactivated or soft-deleted, which cascades to zero permissions on every key they minted.
- **`fromBearerToken(token)`** *(exported)* — The public resolver entry point. Pipeline: `parseApiKeyToken` → `apiKeyRepository.findActiveByPrefix` → `verifyApiKey` (hash compare) → `currentCallerOf` → filter `apiKey.permissions` through `holdsKey(currentCaller, …)` → assemble and return a `ResolvedCredential`. Every failure mode (malformed, unknown prefix, wrong secret, revoked, expired, minter gone) resolves `undefined`; none throws.
- **`touchLastUsed` side-effect** — Fire-and-forget `void … .catch(…)` call after successful verification; logs a warning via `logger.warn` on rejection rather than surfacing an unhandled promise rejection.

## Relationships

- **`kernel/authentication.ts`** — Imports the `ResolvedCredential` return type. This file's `fromBearerToken` is the implementation that `resolveCredential` dispatches to for the `sk_…` prefix.
- **`kernel/permissions.ts`** — Imports `keysInScope` and `assembleCaller` to build the caller from freshly-derived roles.
- **`kernel/ability.ts`** — Imports `holdsKey` (CASL ability check) to intersect the key's stored permissions with the minter's current abilities.
- **`modules/access` (index)** — Imports `rolesOf` to obtain the minter's role set for the given tenant.
- **`modules/users` (index)** — Calls `userService.findAuthenticatableById`; deliberately avoids `findById` so deactivated/soft-deleted minters are immediately neutralised.
- **`modules/api-keys/credentials.ts`** — Imports `parseApiKeyToken`, `verifyApiKey`, `displayIdOf` for token parsing, hash verification, and the human-readable credential ID.
- **`modules/api-keys/repository.ts`** — Imports `apiKeyRepository` for `findActiveByPrefix` and `touchLastUsed`.
- **`modules/api-keys/model.ts`** — Imports the `ApiKeyDocument` type used as the repository result shape.
- **`infrastructure/adapters/logger.ts`** — Imports `logger`; used only in the `touchLastUsed` catch handler.
- **`types` (index / auth-context)** — Imports the `Caller` type for function signatures.

## Notes

- **Never throws.** All error paths resolve `undefined`. The caller in `kernel/authentication.ts` treats `undefined` uniformly as "no identity."
- **Minter liveness is checked per-request.** Because `findAuthenticatableById` (not `findById`) is used, a deactivated or soft-deleted user causes every key they minted to hold nothing on the very next request—no cache TTL or re-login needed.
- **Permission intersection is ability-based.** `holdsKey` builds a CASL ability and asks "can this caller do `key`?" rather than doing a raw string-in-array check. This mirrors how route guards evaluate permissions elsewhere.
- **Tenant scope is hard-coded to `'tenant'`.** Both `assembleCaller` calls use `'tenant'` as the scope string; there is no multi-scope branching in this file.
- **`touchLastUsed` is intentionally not awaited.** The request must not block on a telemetry write; the `.catch` exists solely to prevent an unhandled rejection that would be unattributable to a specific key.
