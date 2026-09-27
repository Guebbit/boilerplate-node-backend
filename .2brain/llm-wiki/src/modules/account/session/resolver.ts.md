---
source: src/modules/account/session/resolver.ts
sha256: e938fc19682cb76516292f5fff46a5aca713aa401275ed57bf487d1e97b69fd9
generated_at: 2026-09-27T14:32:43.270263+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/resolver.ts

## Purpose

Implements the kernel's `AuthResolver` port for this deployment. Given a raw token string it verifies the JWT, loads the authenticatable user, resolves role memberships, and assembles the `AuthContext` object that downstream guards consume. Registered at import time by `module.ts`.

## Key elements

- **`resolve`** (private) — Curried factory: takes a verifier function (`(token) => Promise<TokenData>`) and returns a `(token) => Promise<AuthContext | undefined>` pipeline. The pipeline chains: verify → `findAuthenticatableById` → `rolesOf` → final `AuthContext` projection.
- **`accountAuthResolver`** (exported) — The concrete `AuthResolver` object wiring `resolve(verifyAccessToken)` and `resolve(verifyRefreshToken)` into `fromAccessToken` / `fromRefreshToken`.

## Relationships

- **`./jwt`** (`src/modules/account/session/jwt.ts`) — Supplies `verifyAccessToken`, `verifyRefreshToken`, and the `TokenData` type; the sole source of token verification logic consumed here.
- **`@modules/users`** (`src/modules/users/index.ts`, `src/modules/users/service.ts`) — `userService.findAuthenticatableById` is called for every resolved token; determines whether the account still exists and is active.
- **`@modules/access`** (`src/modules/access/index.ts`, `src/modules/access/service.ts`) — `rolesOf(userId, tenantId)` fetches the membership rows that are the single source of truth for role assignment.
- **`@kernel/authentication`** (`src/kernel/authentication.ts`) — Provides the `AuthResolver` type this file fulfils.
- **`@kernel/access/tenant`** (`src/kernel/access/tenant.ts`) — Supplies `DEPLOYMENT_TENANT_ID`, the fixed tenant constant stamped onto every `AuthContext`.
- **`@types`** (`src/types/auth-context.ts`) — Defines the `AuthContext` shape that the final projection must match.
- **`src/modules/account/module.ts`** — Calls `registerAuthResolver(accountAuthResolver)` at import time to install this resolver into the kernel.

## Notes

- Uses `findAuthenticatableById` (not `findById`) so a deactivated or soft-deleted account is rejected on its very next request, not only at re-login.
- MFA login challenges never reach this pipeline; they are not JWTs and fail inside `verify()` before user lookup is attempted.
- `analyticsConsent` is read fresh from the user document on every request (so a consent withdrawal takes effect immediately), whereas `authTime`/`amr` are carried in the token claims and never re-read.
- `rolesOf` returns `null` for a scope where no membership row exists; `kernel/permissions.ts` (`keysInScope`) maps that `null` to the correct baseline. There is no fallback role in this file.
- `tenantId` is always the compile-time `DEPLOYMENT_TENANT_ID` constant — it is never derived from the request or the token.
- The final projection explicitly picks only the fields the `AuthContext` port declares so the kernel never sees the full user document shape.
