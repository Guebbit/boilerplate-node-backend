---
source: src/modules/access/services/role-audit.ts
source_sha256: 20519a616b73bdf036043be2a5b42f628d77cdcaefb0ce1ef0c97ddcfd344097
context_sha256: 6cb8f148811da9756da42bbe1268b580ba45b0abb57be055c4faac48ecb4d7ea
generated_at: 2026-11-22T03:18:06.140890+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/services/role-audit.ts

## Purpose
Single place that defines what a role grant or revoke looks like in the audit trail, so grant, revoke, and refused-attempt writers all produce consistently shaped rows. It wraps `recordAudit` with role-specific fields and the access module's audit action names.

## Key elements
- `auditRoleAssigned(context, userId, roleName, tenantId, scope)` — records a **committed** grant (`ROLE_ASSIGNED`, outcome `success`). Lowercases `roleName` before recording.
- `auditRoleRevoked(context, userId, roleName, tenantId, scope)` — records a **committed** revoke (`ROLE_REVOKED`, outcome `success`). Passes `roleName` as given.
- `auditRoleChange(context, action, outcome, userId, role, tenantId, scope)` — the shared writer for success or failure. Calls `recordAudit` with `targetType: 'user'`, `targetId: userId`, and metadata `{ role, tenantId, scope }`. `role` is left out of the metadata entirely when `undefined`. `userId` may be `undefined` (e.g. a grant refused before the account exists).

## Relationships
- `@infrastructure/observability/audit` — supplies `recordAudit` (the actual write) and the `AuditAction` type.
- `../audit` (`src/modules/access/audit.ts`) — supplies `accessAuditActions` (`ROLE_ASSIGNED`, `ROLE_REVOKED`).
- `@types` (`CallerContext`, `AuthorizationScope`) — types for the caller and scope parameters; the neighbors `src/types/auth-context.ts` and `src/types/index.ts` relate to these.
- Documentation refers to `assignRole` and `revokeRole` as the callers (the grant and revoke services, presumably in `grants.ts`/`memberships.ts`). This file does not import them.

## Notes
- The committed-success helpers exist because `assignRole`, when given a `session`, audits only its failures; the caller must invoke `auditRoleAssigned` after its transaction commits.
- Grant lowercases the role name while revoke does not, so callers of `auditRoleRevoked` must pass the name in the form they want recorded.
- Centralizing the row was meant to prevent drift, such as a revoke failure branch silently dropping `role` from metadata.
