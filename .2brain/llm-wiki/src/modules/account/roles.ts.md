---
source: src/modules/account/roles.ts
sha256: 10f521cc901553c71594747cd24ad941255190461431643ce6acdb8fac550759
generated_at: 2026-10-14T08:46:03.406105+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/roles.ts

## Purpose

Provides a single helper to determine whether a given user holds an unrestricted (admin) role on the deployment's tenant. This value is needed as the `actorRole` field on every login event emission and audit record produced by the account module. Roles are read live from the membership store because the account document itself carries no role.

## Key elements

- **`isUnrestrictedCaller(userId: string): Promise<boolean>`** — Queries the user's roles on `DEPLOYMENT_TENANT_ID` via `rolesOf`, then tests the tenant-role slot with `isUnrestrictedRole`. Returns a promise that resolves to `true` only when the caller's own membership grants unrestricted access.

## Relationships

- **`src/kernel/permissions.ts`** — Supplies `isUnrestrictedRole`, the predicate that classifies a role value as unrestricted.
- **`src/modules/access/index.ts`** — Supplies `rolesOf`, the membership-store query that returns the user's role pair (`tenant` / `project`).
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID`, the tenant context in which the role check is performed.
- **Account controllers & services** (`post-login`, `post-login-2fa`, `get-oauth-callback`, `oauth`, `password-reset`, `self-delete`, `verification`) — Consume `isUnrestrictedCaller` to populate `actorRole` on emitted events and audit entries.

## Notes

- The check is always scoped to the **deployment's** tenant (`DEPLOYMENT_TENANT_ID`), not to any per-project tenant. Do not pass an arbitrary tenant id.
- The account document does **not** store a role; calling `isUnrestrictedCaller` triggers a fresh store read each time. There is no caching layer in this file—callers should be aware of the I/O cost if invoked in tight loops.
- Only the `roles.tenant` slot is inspected; project-level roles are intentionally irrelevant to the `actorRole` audit field.
