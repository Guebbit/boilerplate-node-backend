---
source: src/modules/account/roles.ts
source_sha256: 851c97ebea275e9f2712add3566601aaca9c623d35383c8ca3d8464df3a73a49
context_sha256: 1e43584a7c440c005828f34c9404ded51ab253466317206e679dbc457d084346
generated_at: 2026-11-22T03:34:34.014700+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/roles.ts

## Purpose
Answers one question about a caller: does their own membership carry an unrestricted (admin) role? The result is the value login emits and audit records need for `actorRole`. It reads the role fresh from the membership store, because the account document carries no role of its own.

## Key elements
- `isUnrestrictedCaller(userId: string): Promise<boolean>` — the only export. It calls `accessService.rolesOf(userId, DEPLOYMENT_TENANT_ID)` and passes the `tenant` part of the result to `isUnrestrictedRole`.

## Relationships
- `src/modules/access/index.ts` — supplies `accessService`, whose `rolesOf` does the membership lookup.
- `src/kernel/access/tenant.ts` — supplies `DEPLOYMENT_TENANT_ID`, so the check is always scoped to this deployment's tenant.
- `src/kernel/permissions.ts` — supplies `isUnrestrictedRole`, which decides whether the tenant role counts as unrestricted.
- The other listed neighbors (`src/modules/access/services/index.ts`, `src/modules/account/services/caller.ts`, `src/modules/account/session/login-observability.ts`) are not imported here. Judging by the module doc, the login and audit code that needs `actorRole` is the likely consumer.

## Notes
- Each call performs a membership lookup. There is no caching in this file.
- Only the tenant-level role (`roles.tenant`) is checked. Other role scopes returned by `rolesOf` are ignored.
