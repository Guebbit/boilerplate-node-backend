---
source: src/modules/account/services/caller.ts
sha256: 260620012458fa83506018cb90c41f619f0182a0030269a7568a13b3cc598741
generated_at: 2026-11-14T18:41:58.956655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/caller.ts

## Purpose

Provides two shared primitives for self-service account flows: loading the caller's own account document (returning 401 rather than 404 if it no longer exists) and recording an audit entry with a freshly-resolved actor role. Every account service that operates on the caller's own data goes through these helpers instead of duplicating the load-or-reject and audit-role logic.

## Key elements

- **`withOwnAccount<T>(userId, action, load?)`** — Loads the caller's account (default loader: `accountUserService.findByIdWithCredentials`, which includes `select: false` credential fields). If the user is found, runs `action(user)` and returns its result; otherwise returns `generateReject(401, [])`. Accepts a custom `load` function for callers that need a different projection.
- **`recordAccountAudit(context, userId, entry)`** — Builds and records an audit entry via `recordAudit`. Resolves the actor's role *after* the caller's action has completed by calling `isUnrestrictedCaller(userId)`: `'admin'` if unrestricted, `'user'` otherwise. Spreads the caller-supplied `entry` and overwrites `actorUserId` / `actorRole`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Source of `generateReject`, `ResponseReject`, and `ResponseSuccess` used for the 401 path and the function's return types.
- **`src/infrastructure/observability/audit.ts`** — Source of `recordAudit`, which `recordAccountAudit` delegates to.
- **`src/modules/account/roles.ts`** — Provides `isUnrestrictedCaller`, the role check used to label the actor in audit entries.
- **`src/modules/users/friends/account.ts`** — Provides `accountUserService`, the account service whose `findByIdWithCredentials` method is the default loader for `withOwnAccount`.
- **`src/modules/users/index.ts`** — Source of the `UserDocument` type used as the loaded-account parameter.
- **Consumers** (all account services that operate on the caller's own data): `email-change.ts`, `export.ts`, `login.ts`, `oauth.ts`, `password-reset.ts`, `profile.ts`, `reauth.ts`, `two-factor-enrollment.ts`, `two-factor-lockout.ts`, `verification.ts` — each calls `withOwnAccount` to obtain the loaded account and `recordAccountAudit` to log the outcome.

## Notes

- The 401-instead-of-404 contract is deliberate: the HTTP layer's `isAuth` guard treats "valid token, user deleted" as unauthenticated, and these routes expose no 404. Callers should not expect a 404 path.
- `recordAccountAudit` resolves the role *after* the action runs, so a flow that promotes `unverified → customer` will be logged with the post-mutation role, not the pre-mutation one. Do not cache or pass a pre-computed role.
- The default `load` includes credentials (`select: false` fields) because most flows verify or save against secrets. Pass a custom `load` if you only need a public projection and want to avoid loading sensitive fields.
