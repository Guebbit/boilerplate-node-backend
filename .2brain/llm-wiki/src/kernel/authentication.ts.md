---
source: src/kernel/authentication.ts
sha256: aace2c3382f3048a764381673d2e8ea3c131ce5b3ec227d08539d186e8344969
generated_at: 2026-09-27T14:18:13.169120+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/authentication.ts

## Purpose

Declares the kernel's authentication port: the contract between the kernel (which needs to know *who* is calling) and the modules that can answer (`account` for user tokens, `api-keys` for machine credentials). It exists so the dispatch logic and the 401-vs-403 distinction live in one kernel-level file rather than being scattered across middleware, while concrete token verification stays in the owning module.

## Key elements

- **`AuthResolver`** (interface) — the port `account` implements: `fromAccessToken` / `fromRefreshToken`, each returning `Promise<AuthContext | undefined>`.
- **`CredentialResolver`** (interface) — the port `api-keys` implements: `fromBearerToken`, returning `Promise<ResolvedCredential | undefined>`.
- **`ResolvedCredential`** (interface) — `{ caller: Caller, credentialId: string }`; the caller is pre-floored to the credential's own permissions.
- **`API_KEY_TOKEN_PREFIX`** — the literal `'sk_'`; used by `authorizations` to dispatch between the JWT and machine-credential paths without attempting a JWT parse.
- **`registerAuthResolver`** / **`registerCredentialResolver`** — one-shot installers called from the respective module's `onRegistered`.
- **`resolveAccessToken`** / **`resolveRefreshToken`** — thin wrappers that throw if no `AuthResolver` is registered, then delegate. Throwing is correct here: `account` is load-bearing in every build.
- **`resolveCredential`** — delegates to `credentialResolver` if present; returns `undefined` (not an error) when the `api-keys` module was excluded from the build.

## Relationships

- **`src/types/auth-context.ts` / `src/types/index.ts`** — supplies the `AuthContext` and `Caller` types this file re-exports in its interfaces.
- **`src/modules/account/module.ts`** — calls `registerAuthResolver` during boot to install its session resolver.
- **`src/modules/account/session/resolver.ts`** — provides the concrete `AuthResolver` implementation (JWT verification, user lookup).
- **`src/modules/api-keys/module.ts`** — calls `registerCredentialResolver` during boot.
- **`src/modules/api-keys/services/resolver.ts`** — provides the concrete `CredentialResolver` implementation (`fromBearerToken`).
- **`src/modules/api-keys/credentials.ts`** — defines the credential record shape consumed by the resolver and surfaced in `ResolvedCredential.credentialId`.
- **`src/kernel/middlewares/authorizations.ts`** — the guard that calls `resolveAccessToken` / `resolveRefreshToken` / `resolveCredential` and applies the 401-vs-403 split.
- **`tests/unit/kernel/authentication.test.ts`** — unit-tests the registration, dispatch, and error paths in this file.
- **`tests/unit/kernel/authorizations.test.ts`** — exercises the middleware that depends on these resolvers.
- **`tests/unit/kernel/api-keys.test.ts`** (integration) — end-to-end test of the `sk_` credential path through `resolveCredential`.

## Notes

- **401 vs 403 is intentional and structural.** A *reject* (malformed/expired/unsigned token) is a 401; a *resolve-to-undefined* (valid token, user deleted) is a 403. Collapsing them would tell a deleted user to "log in again" for an account that cannot exist. The module docstring and `docs/tools/security.md` both call this out.
- **Asymmetric failure semantics.** `resolveAccessToken` / `resolveRefreshToken` throw when no resolver is registered (the build is broken). `resolveCredential` silently returns `undefined` in that case, because `api-keys` is an optional module. Do not "fix" this asymmetry without understanding why.
- **`API_KEY_TOKEN_PREFIX` lives here, not in `api-keys`.** The *dispatch* between the two credential paths is a kernel concern; the module that mints the tokens doesn't need to know the prefix.
- **`Promise.resolve().then(…)` wrappers** are used to keep the public API always-async (so callers can `.catch` uniformly) while the resolver itself may be synchronous. This is a convention, not a performance choice.
