---
source: src/modules/access/services/memberships.ts
sha256: 36bc12525bc6f59b78325d700b1a1584cea79ca2a73de21f418fc877af43782b
generated_at: 2026-10-29T02:23:30.046497+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/memberships.ts

## Purpose

The service layer for the membership half of the authorization model: creating tenants, assigning and revoking roles (who holds which role in which scope), and bulk operations for reads and erasure. It sits between the repository (raw MongoDB/Mongoose access) and the callers that need business-logic-level membership mutations with validation, audit, and transaction support.

## Key elements

- **`ensureTenant(slug, name, id?)`** — Upsert a tenant by slug; returns the existing one if already present.
- **`membershipsOf(userId)`** — All membership rows for a user across every scope/tenant.
- **`membershipIn(userId, tenantId, scope)`** — Single membership lookup; returns `null` if the user is not a member there.
- **`assignRole(userId, tenantId, scope, roleName, granter, context?, session?)`** — Grant a role. Validates via `validateGrant`, upserts the row, and audits success or failure (escalation attempts are audited as failures). Requires a `granter` key list — no bypass path.
- **`revokeRole(userId, tenantId, scope, context, session?)`** — Remove a role. Authorizes via `assertCanRevoke`, deletes the row, audits. Allowed even if it removes a tenant's last admin.
- **`eraseMemberships(userId, session)`** — `personalData.erase` hook; deletes all of a user's membership rows within the caller's transaction.
- **`rolesOf(userId, tenantId)`** — Returns `{ tenant, platform }` role names (or `null` for each) from the user's membership rows. No default/fallback.
- **`rolesOfMany(userIds, tenantId, scope)`** — Batch variant of `rolesOf` for list pages; one query, returns a `Map<userId, role>`.
- **`DEPLOYMENT_TENANT_SLUG`** — Constant `'shop'`, the single default tenant slug.
- **`bootstrapAccess(name)`** — Idempotent creation of the default tenant using the fixed `DEPLOYMENT_TENANT_ID`; safe to call against a live DB.
- **`membersHolding(tenantId, sets)`** — Resolve permission-set names to role names (via `PRESET_ROLES`), then query for member ids. `sets: []` yields only unrestricted roles.

## Relationships

- **`@kernel/access/tenant`** — Imports `DEPLOYMENT_TENANT_ID` for the fixed bootstrap tenant id.
- **`@kernel/permissions`** — Imports `isUnrestrictedRole` and `PRESET_ROLES`; used in `assignRole` (role name validation) and `membersHolding` (role-to-set resolution).
- **`../repository`** — All DB reads/writes go through `membershipRepository` and `tenantRepository`; this file contains no direct Mongoose queries.
- **`../model`** — Type-only imports of `MembershipDocument` and `TenantDocument`.
- **`../audit`** — Imports `accessAuditActions` enum for audit action identifiers.
- **`./grants`** — Delegates grant validation (`validateGrant`) and revoke authorization (`assertCanRevoke`).
- **`./role-audit`** — Delegates all audit recording (`auditRoleAssigned`, `auditRoleChange`, `auditRoleRevoked`).
- **`./index`** — Barrel file that re-exports this module's public API.
- **`@types`** — Imports `AuthorizationScope` and `CallerContext` type definitions.

## Notes

- **Rejection, not throw.** Every validation failure is emitted as a promise rejection (the `Promise.resolve().then(...)` chain is deliberate). Callers in this codebase use `.catch(...)`; a synchronous `throw` would be an uncaught exception instead.
- **Audit is split by transaction.** When a `session` is passed, only *failures* are audited here; the caller records the success via `auditRoleAssigned`/`auditRoleRevoked` after the transaction commits. Without a `session`, this function audits both outcomes.
- **No default role.** `rolesOf` returns `null` (not a fallback role) when no membership row exists. The permission evaluator in `kernel/permissions.ts` interprets `null` as "no role" with scope-specific anonymous baselines.
- **`revokeRole` can orphan a tenant.** Removing the last admin is intentionally permitted; restoring one is a single write.
- **`assignRole` has no "system bypass."** Seed/test fixtures that need to write without a granter must use the module's `factories.ts` path instead.
- **`bootstrapAccess` is an upsert.** Unlike scenario seeding, it is safe to run repeatedly and requires no `NODE_ENV` guard.
