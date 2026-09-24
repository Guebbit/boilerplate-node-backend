---
source: src/kernel/authentication.ts
sha256: 3eb7afdfaeb649496cb749f763e64949756568a52238e73cd832a08880441339
generated_at: 2026-09-23T17:54:54.420965+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/authentication.ts

## Purpose

Kernel-level port that decouples token *resolution* from token *validation*. It declares two resolver interfaces (user tokens and machine credentials), holds the registered implementations in module-scoped variables, and exposes thin async wrappers that middleware and guards call. Modules (`account`, `api-keys`) install their concrete implementations at import time, so the kernel never imports a module directly.

## Key elements

- **`AuthResolver`** — interface with `fromAccessToken` / `fromRefreshToken`; returns `AuthContext | undefined` (undefined means the user no longer exists, not that the token is bad).
- **`CredentialResolver`** — interface with `fromBearerToken`; returns `ResolvedCredential | undefined`.
- **`ResolvedCredential`** — `{ caller: Caller; credentialId: string }`; a caller already scoped to the credential's own permissions.
- **`API_KEY_TOKEN_PREFIX`** (`'sk_'`) — dispatch constant. A JWT always starts with `eyJ` (base64url of `{"alg"`), so the kernel can route to the correct resolver by prefix alone without attempting a JWT decode.
- **`registerAuthResolver(impl)`** / **`registerCredentialResolver(impl)`** — one-shot setters called at module import time.
- **`resolveAccessToken(token)`** / **`resolveRefreshToken(token)`** — delegate to the registered `AuthResolver`. Throws if none is registered (no `account` module → no valid build).
- **`resolveCredential(token)`** — delegates to the registered `CredentialResolver`; returns `undefined` (not an error) when no `api-keys` module is present in the build.
- **`requireResolver()`** (private) — guards the auth path; throws a descriptive error when unregistered.

## Relationships

- **`src/types/auth-context.ts`** — source of `AuthContext` and `Caller` types consumed throughout this file.
- **`src/modules/account/module.ts`** — imports `registerAuthResolver` and supplies the `AuthResolver` implementation at boot.
- **`src/modules/api-keys/module.ts`** — imports `registerCredentialResolver` and supplies the `CredentialResolver` implementation.
- **`src/modules/api-keys/credentials.ts`** — implements the actual credential validation logic behind the `CredentialResolver` port.
- **`src/kernel/middlewares/authorizations.ts`** — the HTTP guard that calls `resolveAccessToken`, `resolveRefreshToken`, or `resolveCredential` and maps results to 200/401/403.
- **`tests/unit/kernel/authorizations.test.ts`** — exercises the guard's decision tree against these resolution functions.
- **`src/modules/api-keys/tests/integration/api-keys.test.ts`** — integration test that exercises the full `registerCredentialResolver` → `resolveCredential` path.

## Notes

- **401 vs 403 contract.** A *rejected* token (malformed, expired, wrongly signed) and a *resolved-but-user-deleted* token (`undefined`) must stay distinct. Collapsing them would turn a deleted account's 403 into a 401 ("log in again") for an account that can no longer log in.
- **Asymmetry on unregistered resolvers.** `resolveAccessToken` / `resolveRefreshToken` *throw* when no `AuthResolver` is registered (a build without `account` is broken). `resolveCredential` *returns `undefined`* when no `CredentialResolver` is registered (a build without `api-keys` is perfectly valid). Guards must not special-case the missing-credential path.
- **Dispatch by string prefix, not by token shape.** The `sk_` prefix check is a kernel concern and lives here, not in `api-keys`. Do not move it.
- **Registration is at import time, not boot time.** Both `register*` functions are called during module evaluation (top-level import), so by the time the first request arrives the resolvers are set. There is no runtime re-registration.
