---
source: src/modules/account/services/caller.ts
sha256: 7ce04dbfefd20ec219abfa8029bea4252c457cc30578fe477a3e2e9f516722c9
generated_at: 2026-11-08T04:16:20.455594+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/caller.ts

## Purpose

Provides the shared "load the caller's own account or answer 401" entry point that every self-service account flow begins with, plus a helper that records audit entries with the actor's role resolved post-action. It centralizes the 401-vs-404 contract (a valid token for a deleted account is unauthenticated, not not-found) and the convention for naming actor roles in account audit logs.

## Key elements

- **`withOwnAccount<T>(userId, action, load?)`** — Loads the caller's account via `load` (defaults to `userService.findByIdWithCredentials`, i.e. secrets are included since most flows verify or save against `select: false` fields), then runs `action(user)`. If the account no longer exists, short-circuits to `generateReject(401, [])`.
- **`recordAccountAudit(context, userId, entry)`** — Resolves the actor's role via `isUnrestrictedCaller(userId)` *after* the calling action has completed (so role reflects any promotion that just happened), maps it to `'admin'` or `'user'`, and delegates to `recordAudit` with `actorUserId` / `actorRole` filled in.

## Relationships

- **`src/infrastructure/http/response`** — Uses `generateReject`, `ResponseReject`, `ResponseSuccess` for the 401 short-circuit and the generic return type.
- **`src/infrastructure/observability/audit`** — `recordAccountAudit` wraps `recordAudit` to inject the account-specific actor identity and role.
- **`src/modules/account/roles`** — `recordAccountAudit` calls `isUnrestrictedCaller` to decide between the `admin` and `user` role label.
- **`src/modules/users`** — Default `load` function is `userService.findByIdWithCredentials`; `UserDocument` is the type threaded through `action`.
- **`src/modules/users/model` / `services/index`** — Provide the `UserDocument` shape and the `userService` instance consumed at load time.

## Notes

- The default loader includes credentials (`findByIdWithCredentials`). If a flow does *not* need secrets, pass a custom `load` to avoid fetching them.
- `recordAccountAudit` always re-reads the role after the action runs. Do not compute the role before a mutation (e.g. verification) and pass it in — it would be stale.
- The 401-for-missing-account behavior is intentional and deliberate; do not "fix" it to 404. The route contract declares no 404 on self-service account routes.
