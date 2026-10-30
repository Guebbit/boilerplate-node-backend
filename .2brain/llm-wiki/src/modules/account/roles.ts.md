---
source: src/modules/account/roles.ts
sha256: 851c97ebea275e9f2712add3566601aaca9c623d35383c8ca3d8464df3a73a49
generated_at: 2026-10-29T02:38:57.655697+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/roles.ts

## Purpose

Provides a single helper that determines whether a given user holds an unrestricted (admin) role on the current deployment's tenant. It exists so that login-emit and audit-record code can resolve `actorRole` from the live membership store instead of relying on a role value that does not exist on the account document itself.

## Key elements

- **`isUnrestrictedCaller(userId: string): Promise<boolean>`** — Queries the access service for the user's roles on `DEPLOYMENT_TENANT_ID` and returns the result of `isUnrestrictedRole(roles.tenant)`. This is the only export.

## Relationships

- **`src/kernel/permissions.ts`** — Supplies `isUnrestrictedRole`, the predicate applied to the tenant role string.
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID`, the fixed tenant scope for the lookup.
- **`src/modules/access/index.ts`** — Supplies the `accessService` instance whose `rolesOf(userId, tenantId)` method performs the actual membership read.
- **`src/modules/account/session/login-observability.ts`** — Downstream consumer; uses `isUnrestrictedCaller` to populate `actorRole` on login-emitted events.
- **`src/modules/account/services/caller.ts`** — Downstream consumer in the account service layer that needs the same admin-role fact.

## Notes

- The account document intentionally carries **no** role field; the only source of truth is the tenant membership store. Always call `isUnrestrictedCaller` at emit/audit time rather than caching the result across a session.
- The lookup is scoped to `DEPLOYMENT_TENANT_ID` (a single, fixed tenant per deployment). It does not check other tenants.
