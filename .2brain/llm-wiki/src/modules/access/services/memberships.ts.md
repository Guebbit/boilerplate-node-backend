---
source: src/modules/access/services/memberships.ts
sha256: 36bc12525bc6f59b78325d700b1a1584cea79ca2a73de21f418fc877af43782b
generated_at: 2026-11-08T03:57:52.485754+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/memberships.ts

## Purpose

The membership service layer: reads, writes, and deletes the rows that tie a user to a role in a given place (tenant or platform scope). It owns the full write-path for granting and revoking roles (with permission checks and audit), the read-path for resolving who holds what, and the bootstrap/seed entry points that give a fresh deployment its single tenant row.

## Key elements

- **`ensureTenant(slug, name, id?)`** — Upserts a tenant by slug; returns the existing document if the slug already exists. `id` is optional (used only by `bootstrapAccess` to pin `DEPLOYMENT_TENANT_ID`).
- **`membershipsOf(userId)`** — All membership rows for a user across every place.
- **`membershipIn(userId, tenantId, scope)`** — Single membership lookup; returns `null` if the user has no role there.
- **`assignRole(userId, tenantId, scope, roleName, granter, context?, session?)`** — Grants a role after validating the granter's keys. Audits success or failure. Returns a rejection (never a synchronous throw) on refusal.
- **`revokeRole(userId, tenantId, scope, context, session?)`** — Deletes a membership after asserting the caller may revoke. Idempotent: no-op if the membership doesn't exist.
- **`eraseMemberships(userId, session)`** — Bulk-deletes all of a user's memberships; the `personalData.erase` hook for this section. Must share the caller's transaction.
- **`rolesOf(userId, tenantId)`** — Resolves `{ tenant, platform }` role names for one user; `null` where no row exists (no implicit default).
- **`rolesOfMany(userIds, tenantId, scope)`** — Batch variant of `rolesOf` for list pages; returns a `Map<userId, role>`.
- **`membersHolding(tenantId, sets)`** — Returns user ids whose tenant role includes any of the given permission-set names, plus all unrestricted roles (e.g. admin).
- **`DEPLOYMENT_TENANT_SLUG`** — Constant `'shop'`; the single-tenant slug this boilerplate ships with.
- **`bootstrapAccess(name)`** — Idempotent upsert of the deployment tenant with the fixed `DEPLOYMENT_TENANT_ID`; safe to call against a live DB.

## Relationships

- **`@kernel/access/tenant`** — Imports `DEPLOYMENT_TENANT_ID` for the fixed deployment tenant row.
- **`@kernel/permissions`** — Imports `isUnrestrictedRole` and `PRESET_ROLES` to resolve which roles match a set of permission names in `membersHolding`.
- **`../repository`** — All database I/O goes through `membershipRepository` and `tenantRepository`; this module performs no direct Mongoose queries.
- **`./grants`** — Delegates grant validation to `validateGrant` and revoke authorization to `assertCanRevoke`.
- **`./role-audit`** — Calls `auditRoleAssigned`, `auditRoleRevoked`, and `auditRoleChange` for every success/failure path.
- **`../audit`** — Imports `accessAuditActions` enum used as the action label in failure audits.
- **`../model`** — Type-only imports for `MembershipDocument` and `TenantDocument`.
- **`@types`** — Type-only imports for `AuthorizationScope` and `CallerContext`.
- **`services/index.ts`** — Barrel re-export of this module's public API.

## Notes

- **Rejections, not throws.** Every validation step runs inside a `Promise.resolve().then(...)` chain so that callers using `.catch(...)` (the house style) always see a rejection. There is no code path that throws synchronously.
- **`session` shifts audit responsibility.** When a `ClientSession` is passed, only *failure* audits are emitted here; the caller is expected to call `auditRoleAssigned`/`auditRoleRevoked` itself after the transaction commits. Without a session, this function audits both paths.
- **`granter` is required on `assignRole`.** There is no "skip the check" sentinel. Seeders and test fixtures that have no real granter must write through `factories.ts` instead.
- **`revokeRole` can remove a tenant's last admin.** This is intentional; a new admin is one write away.
- **`rolesOf` returns `null` for a missing scope.** It never substitutes a default role. The permission evaluator (`keysInScope` in `permissions.ts`) treats `null` as "no role."
- **`bootstrapAccess` is an upsert**, not an insert. It is safe to re-run after `emptyDatabase()` + reseed and will preserve the fixed `DEPLOYMENT_TENANT_ID`.
- **`membersHolding` with `sets: []`** resolves to only unrestricted roles (administrators).
