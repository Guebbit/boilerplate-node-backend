---
source: src/modules/account/roles.ts
sha256: e3be17636dca618a5abcd75e6b2c73b4e6f54839440d919b04fff64dd46ee8fd
generated_at: 2026-09-27T14:28:21.609688+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/roles.ts

## Purpose

Provides a single helper that determines whether a caller holds an unrestricted (admin) role on the deployment's tenant. It exists so that every login emit and audit record in the account module can record an accurate `actor_role` by reading the current membership state rather than relying on a stale or absent value on the account document.

## Key elements

- **`isUnrestrictedCaller(userId: string): Promise<boolean>`** — Queries the membership store for the given user's roles on `DEPLOYMENT_TENANT_ID`, then passes the tenant-level role through `isUnrestrictedRole` to return a boolean. This is the sole export.

## Relationships

- **`src/kernel/permissions.ts`** — Imports `isUnrestrictedRole`, the predicate that classifies a role value as unrestricted.
- **`src/modules/access/index.ts`** — Imports `rolesOf`, the membership-store accessor that returns the user's roles for a given tenant.
- **`src/kernel/access/tenant.ts`** — Imports `DEPLOYMENT_TENANT_ID`, the constant identifying this deployment's tenant (the scope in which "admin" is evaluated).

## Notes

- The account document itself carries **no** role field; this function always performs a live lookup via `rolesOf`. Do not attempt to read a role off the account record.
- The check is tenant-scoped to `DEPLOYMENT_TENANT_ID` specifically — it does not consider cross-tenant roles.
- Intended for use in login/audit emit paths (e.g., `post-login.ts`, `post-login-2fa.ts`, `get-oauth-callback.ts`), where `actor_role` must reflect the caller's role *at the moment of the event*.
