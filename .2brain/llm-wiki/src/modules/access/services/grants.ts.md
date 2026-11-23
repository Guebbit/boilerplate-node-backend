---
source: src/modules/access/services/grants.ts
source_sha256: d44db5a9f4db29f5dd579df31d3e5168be0e3187f9fcac52e7c482df51372b21
context_sha256: f041ea93111874f8e6ef693dc74be966d46f2ac13c187d00edf66a212222f200
generated_at: 2026-11-22T03:17:18.280011+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/services/grants.ts

## Purpose
Decides who may hand out which role. A grant is refused if the role is not declared (or is not assignable in the scope), or if the granter lacks the `assign:Role` permission. Each rule is enforced as an executed refusal, not left as documentation. Revokes are gated by the same permission.

## Key elements
- `ASSIGN_RULE` – the `'assign:Role'` permission id; whoever holds it may hand out staff roles and change accounts that already hold one.
- `AccessInvariantError` – extends `ConflictError`, sets `name = 'AccessInvariantError'`. Thrown for refused grants and revokes.
- `GrantRefusal` – `{ kind: 'not_granter' | 'unknown_role', message }`. `not_granter` maps to a 403 and `unknown_role` to a 422 on the `role` field. The message is internal only and is never sent to a client.
- `checkGrant` (private) – the non-throwing core. It returns `{ lowered }` or `{ refusal }`. Checks run in this order:
  1. The granter must hold `assign:Role`.
  2. `findRole(lowered)` must exist and its `scope` must match the requested scope.
  3. The role must not have `assignable === false`.
- `validateGrant(scope, roleName, granter)` – throws `AccessInvariantError` on refusal, otherwise returns the lowercased role name.
- `grantableRoles(scope, granter)` – lists the `PRESET_ROLES` names in that scope that `checkGrant` would accept, in declaration order. Clients use it to build a role picker. It has no authority of its own, because the write re-checks.
- `assertCanGrant` – a dry run of `validateGrant` that returns nothing, for callers that need to know before committing other state.
- `grantRefusalAudited(scope, roleName, granter, context, userId?)` – returns the `GrantRefusal` or `undefined` instead of throwing. On refusal it first writes a failed audit row via `auditRoleChange`, using the `ROLE_ASSIGNED` action.
- `assertCanRevoke(context)` – passes for the system actor or a holder of `assign:Role` (`holds(caller, 'assign', 'Role')`). Otherwise it throws `AccessInvariantError`.

## Relationships
- `src/kernel/permissions.ts` – supplies `findRole`, `PRESET_ROLES` and `PermissionRuleId`. Roles come only from the declared presets.
- `src/kernel/ability.ts` – `holds` is used in `assertCanRevoke`.
- `src/kernel/access/tenant.ts` – `DEPLOYMENT_TENANT_ID` is the tenant id recorded in the failure audit row for tenant-scoped grants (`null` otherwise).
- `src/infrastructure/http/errors.ts` – `ConflictError` is the base class. The error interpreter maps it to 409 by `instanceof`.
- `src/modules/access/audit.ts` and `src/modules/access/services/role-audit.ts` – `accessAuditActions` and `auditRoleChange` are used to record refused attempts.
- `src/types/auth-context.ts` / `src/types/index.ts` – `AuthorizationScope` and `CallerContext` types are imported from `@types`.
- `src/modules/access/tests/unit/grantable-roles.test.ts` and `src/modules/access/tests/integration/access.test.ts` are test neighbors of this file.

## Notes
- The `granter` key list is required on purpose, so that omitting it cannot mean "no check". Seeders bypass this by writing through the access module's test `factories.ts` instead.
- The permission is checked before the role. A caller without `assign:Role` learns nothing about which role names exist.
- Names such as `customer`, `unverified` and `guest` are audiences that are computed, never granted, so they are refused as `unknown_role`.
- The code does not re-check that preset permission keys are declared. A cross-cutting test proves it once for all presets.
- Role names are lowercased before lookup. The audit row for a refusal uses the lowercased name.
