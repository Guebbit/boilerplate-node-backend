---
source: src/modules/access/audit.ts
source_sha256: b65cedb01985178cd6820de7f57d5806f1f3910c5c412f7a6a668119d32e980c
context_sha256: 2665c625b1faa57e74c46f6039a0d8ebba4820a2eaf246924de4a088de5835e6
generated_at: 2026-11-22T03:15:33.340856+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/audit.ts

## Purpose
Declares the audit actions emitted by the access module. Only role grants and revocations are audited, since they are the events that change what someone may do. The `access.` prefix lets a compliance query find them. Actions are registered by type augmentation, not through a shared enum.

## Key elements
- `accessAuditActions`: a `const` object holding the module's action strings:
  - `ROLE_ASSIGNED` = `'access.role.assigned'`: a membership was given a role by an admin (`update:User`/`create:User`), never self-service.
  - `ROLE_REVOKED` = `'access.role.revoked'`: a membership's role was taken away.
- `declare module '@infrastructure/observability/audit'`: augments `AuditActionMap` with an `access` key. Its type is the union of the values of `accessAuditActions`, so those strings become valid app-wide audit actions.

## Relationships
The provided content does not import or reference any neighbor. It only defines the vocabulary and the type augmentation. Neighbors such as `src/modules/access/services/grants.ts`, `src/modules/access/services/memberships.ts` and `src/modules/access/services/role-audit.ts` are likely consumers of these action names, but this file does not show that. The same applies to the tests listed as neighbors.

## Notes
- The file has no runtime logic beyond the constant. The augmentation applies only at the type level.
- `as const` keeps the action strings as literal types, which the `AuditActionMap` union depends on.
- The header refers to `src/modules/account/audit.ts` for the reasoning behind augmentation over a shared enum.
- Read-only operations in this module (`membershipsOf`, `rolesOf`, …) have no audit actions.
