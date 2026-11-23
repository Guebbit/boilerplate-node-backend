---
source: src/modules/account/services/caller.ts
source_sha256: 260620012458fa83506018cb90c41f619f0182a0030269a7568a13b3cc598741
context_sha256: 6fb11e4e693d39021020b34e8a0cb24b7b3d2d9ea8277e2a18b8de12fd6b780b
generated_at: 2026-11-22T03:35:42.515733+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/caller.ts

## Purpose
Shared opening for account self-service flows: load the authenticated caller's own account or answer 401, and record audit entries with a consistently derived actor role. A valid token for a since-deleted account is treated as unauthenticated (401), not 404, because the route contracts declare no 404 and `isAuth` handles the same case the same way.

## Key elements
- `withOwnAccount(userId, action, load?)` — loads the user via `load`, then runs `action(user)`. If no user is found, resolves to `generateReject(401, [])`. `action` may return a response synchronously or as a promise. `load` defaults to `accountUserService.findByIdWithCredentials`, since most flows save or verify against `select: false` secrets.
- `recordAccountAudit(context, userId, entry)` — calls `recordAudit` with `actorUserId` set to `userId` and `actorRole` set to `'admin'` if `isUnrestrictedCaller(userId)` resolves true, otherwise `'user'`. `entry` is the audit entry minus those two fields.

## Relationships
- `src/infrastructure/http/response.ts` — supplies `generateReject` and the `ResponseSuccess`/`ResponseReject` types used in `withOwnAccount`'s signature.
- `src/infrastructure/observability/audit.ts` — `recordAudit` is called by `recordAccountAudit`; its parameter type defines the `entry` shape.
- `src/modules/account/roles.ts` — `isUnrestrictedCaller` decides the audit actor role.
- `src/modules/users/friends/account.ts` — provides `accountUserService`, whose `findByIdWithCredentials` is the default loader.
- `src/modules/users/index.ts` — provides the `UserDocument` type.
- The sibling account services (`email-change`, `export`, `login`, `oauth`, `password-reset`, `profile`, `reauth`, `two-factor-enrollment`, `two-factor-lockout`, `verification`) are the neighbors in the dependency graph. This file's own purpose is to serve flows like these, though the imports themselves aren't visible here.

## Notes
- The actor role is read fresh each time `recordAccountAudit` runs, after the action has finished. For example, a verification promotes `unverified` to `customer`, so the role must not come from a value computed earlier.
- The `load` parameter lets a flow supply a different loader, for example one that doesn't include credentials.
- `recordAccountAudit` doesn't return or await the result of `recordAudit`. Its promise resolves once the role lookup completes and `recordAudit` has been called.
