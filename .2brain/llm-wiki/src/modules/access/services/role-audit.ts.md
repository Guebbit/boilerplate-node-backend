---
source: src/modules/access/services/role-audit.ts
sha256: 55be111b36458abbce4be4fd8608f0cf0bb33d778a125b7cce7abec906048813
generated_at: 2026-10-29T02:23:58.931644+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/role-audit.ts

## Purpose

Centralises the audit-row emission for every role change (grant, revoke, refused attempt) so the three writer paths produce a single, consistent audit-trail shape instead of each spelling it differently. It exists to prevent the drift that historically caused one branch (revoke's failure) to silently drop `role` from its metadata.

## Key elements

- **`auditRoleChange`** — The single shared emitter. Builds the audit record (action, outcome, `targetType: 'user'`, `targetId`, and a metadata object containing `role`/`tenantId`/`scope`) and calls `recordAudit`. Omitting `role` from metadata when it is `undefined` is handled here.
- **`auditRoleAssigned`** — Convenience wrapper for a *committed* grant. Delegates to `auditRoleChange` with `accessAuditActions.ROLE_ASSIGNED`, outcome `'success'`, and lowercases `roleName`.
- **`auditRoleRevoked`** — Mirror wrapper for a *committed* revoke. Same delegation but uses `accessAuditActions.ROLE_REVOKED` and passes `roleName` through **without** lowercasing.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Imports the `recordAudit` writer and the `AuditAction` type that `auditRoleChange` accepts.
- **`src/modules/access/audit.ts`** — Imports `accessAuditActions`, the domain-specific action constants (`ROLE_ASSIGNED`, `ROLE_REVOKED`) used as the `action` argument.
- **`src/modules/access/services/grants.ts`** — Caller: its `assignRole` function calls `auditRoleAssigned` after the transaction commits, and its failure paths call `auditRoleChange` directly.
- **`src/modules/access/services/memberships.ts`** — Caller: its `revokeRole` function calls `auditRoleRevoked` (success) or `auditRoleChange` (failure).
- **`src/types/auth-context.ts`** — Source of the `CallerContext` and `AuthorizationScope` types used in every exported signature.
- **`src/modules/access/services/index.ts`** — Barrel that re-exports these functions for external consumers of the services layer.

## Notes

- **Commit-timing contract.** The success-path functions (`auditRoleAssigned`, `auditRoleRevoked`) are designed to be called *after* the caller's transaction has committed. The JSDoc on `auditRoleAssigned` makes explicit that `assignRole` only audits its *failures* inline; the success row arrives later via this module. Calling them before commit would record an event for a change that may roll back.
- **Asymmetric normalisation.** `auditRoleAssigned` lowercases `roleName`; `auditRoleRevoked` does not. If you expect both to store the role identically in the audit trail, normalise at the call site.
- **`undefined` vs. omitted metadata.** When `role` is `undefined` (e.g. a revoke where no membership was found), it is *excluded* from the metadata object rather than stored as `undefined`. Downstream consumers should treat a missing `role` key as "unknown", not as a falsy value.
- **`userId` may be `undefined`** (e.g. a grant refused before the account exists). In that case `targetId` in the audit record will be `undefined`.
