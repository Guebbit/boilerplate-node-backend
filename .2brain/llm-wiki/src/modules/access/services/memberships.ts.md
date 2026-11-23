---
source: src/modules/access/services/memberships.ts
source_sha256: fd0231dd691f270bd1c0f1f08c1cd2074f1f6ed1d17c656f4fd51dbef0159b29
context_sha256: 67d15d8f37ae2705bf438b70435fa8308d9c4024bc43ebd64f46c6156198c4bf
generated_at: 2026-11-22T03:17:40.277712+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/services/memberships.ts

## Purpose
The membership half of the access model: tenants, who holds which role in which place, and the writes that change it. A role lives in exactly one place, the membership row; the user document holds none. This file wraps the tenant and membership repositories with grant/revoke rules, auditing, and read helpers.

## Key elements
- `ensureTenant(slug, name, id?)`: upserts a tenant by lower-cased slug. `id` is only passed by `bootstrapAccess`.
- `membershipsOf(userId)`: every membership row for a person.
- `membershipIn(userId, tenantId, scope)`: the person's membership in one place, or `null`.
- `assignRole(userId, tenantId, scope, roleName, granter, context?, session?)`: validates the grant via `validateGrant` (against the granter's keys), then upserts the role (lower-cased). Failures are rejections, never synchronous throws.
  - With a `context`, success is audited via `auditRoleAssigned`, and failure (e.g. an escalation attempt) is audited as a failure `ROLE_ASSIGNED` entry.
  - With a `session`, only failures are audited here. The caller audits the success after commit.
- `revokeRole(userId, tenantId, scope, context, session?)`: checks `assertCanRevoke(context)`, looks up the membership, and deletes it. A missing membership is a silent no-op with no audit. Failures are audited as `ROLE_REVOKED` failures, carrying the role only if a membership was found. Success is audited unless a `session` is given.
- `eraseMemberships(userId, session)`: the `personalData.erase` hook for the `roles` section. It deletes all of a person's memberships inside the hard delete's transaction.
- `rolesOf(userId, tenantId)`: returns `{ tenant, platform }` role names, each `null` when no membership exists. There is no fallback role.
- `rolesOfMany(userIds, tenantId, scope='tenant')`: one query returning a `Map<userId, role>` for list pages. It short-circuits on an empty input. An absent id means no role.
- `DEPLOYMENT_TENANT_SLUG`: `'shop'`, the single tenant the boilerplate ships.
- `bootstrapAccess(name)`: idempotently creates the shop tenant with the fixed `DEPLOYMENT_TENANT_ID`.
- `membersHolding(tenantId, sets)`: returns the user ids of tenant members whose role lists one of the permission `sets`, plus all unrestricted roles. It filters `PRESET_ROLES` in memory, skips roles with `assignable === false`, and makes one DB query. An empty `sets` means administrators only.

## Relationships
- `../repository`: `membershipRepository` and `tenantRepository` perform all persistence (upsert, find, delete).
- `../model`: supplies the `MembershipDocument` and `TenantDocument` types.
- `./grants`: `validateGrant` and `assertCanRevoke` enforce who may grant or revoke.
- `./role-audit`: `auditRoleAssigned`, `auditRoleRevoked` and `auditRoleChange` emit audit entries.
- `../audit`: `accessAuditActions` supplies the action names for failure audits.
- `@kernel/access/tenant`: `DEPLOYMENT_TENANT_ID` is the fixed id used by `bootstrapAccess`.
- `@kernel/permissions`: `PRESET_ROLES` and `isUnrestrictedRole` drive `membersHolding`.
- `@types`: `AuthorizationScope` and `CallerContext`.

## Notes
- `assignRole` has no "skip the check" granter value. Seeders and fixtures should write memberships through the module's `factories.ts` instead.
- Check logic runs inside a `Promise.resolve().then(...)` chain on purpose, so callers using `.catch(...)` always see rejections.
- Revoking a place's last administrator is allowed deliberately, and so is erasure.
- `bootstrapAccess` is safe against a live database because it is an upsert.
- Presets are read from `shared/rules/authorization-roles.yaml` at import, so they need no seeding.
