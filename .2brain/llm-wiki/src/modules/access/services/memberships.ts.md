---
source: src/modules/access/services/memberships.ts
sha256: ed8ff430322b45d204c1fd27e6ca0a422e6b95d0794b0b9d40bc7542c8f83cb6
generated_at: 2026-11-14T18:28:10.098271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/memberships.ts

## Purpose

The membership half of the access model: it owns every read and write of the "who holds which role in which place" relationship. A role lives exclusively in a membership row (never on the user document), and this module provides the service-level API for creating tenants, assigning/reviewing/revoking roles, batch-resolving roles, and the idempotent seed a fresh deployment needs to boot.

## Key elements

- **`ensureTenant(slug, name, id?)`** — Upsert a tenant by lowercased slug; returns the existing row or creates one. The optional `id` lets `bootstrapAccess` pin `DEPLOYMENT_TENANT_ID` across reseed cycles.
- **`membershipsOf(userId)`** — All membership rows for a user across every scope/tenant.
- **`membershipIn(userId, tenantId, scope)`** — The single membership row for one user + place, or `null`.
- **`assignRole(userId, tenantId, scope, roleName, granter, context?, session?)`** — Validate the grant via `validateGrant`, upsert the role, and audit. Rejections (not throws) are guaranteed by the `Promise.resolve().then(…)` chain. When `session` is supplied the caller is responsible for the success audit; failures are always audited here.
- **`revokeRole(userId, tenantId, scope, context, session?)`** — Permission-checked deletion of a membership. Permitted even if it removes a place's last admin. Same rejection-not-throw and session-deferred-success-audit pattern as `assignRole`.
- **`eraseMemberships(userId, session)`** — Delete every membership row for a user within the caller's transaction (the `personalData.erase` hook for the roles section).
- **`rolesOf(userId, tenantId)`** — Resolve the tenant-scope and platform-scope role names for one user; returns `null` (not a fallback) where no row exists.
- **`rolesOfMany(userIds, tenantId, scope?)`** — Batch lookup: one query returns a `Map<userId, roleName>` for a list page.
- **`DEPLOYMENT_TENANT_SLUG`** — Constant `'shop'`; the single tenant this boilerplate ships.
- **`bootstrapAccess(name)`** — Idempotent upsert of the deployment tenant with the fixed kernel id. Safe against a live database; no `NODE_ENV` guard needed.
- **`membersHolding(tenantId, sets)`** — Resolve which user IDs hold a role whose permission-set list intersects `sets`, plus all unrestricted (admin) roles. Filters out non-assignable roles (e.g. `system`).

## Relationships

- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID`, the fixed id `bootstrapAccess` pins to.
- **`src/kernel/permissions.ts`** — Provides `PRESET_ROLES` and `isUnrestrictedRole`, used by `membersHolding` to filter assignable roles and include admins.
- **`src/modules/access/repository.ts`** — `membershipRepository` and `tenantRepository` are the data-access layer for every read/write in this file.
- **`src/modules/access/model.ts`** — Type definitions `MembershipDocument` and `TenantDocument`.
- **`src/modules/access/audit.ts`** — `accessAuditActions` enum values passed to the audit helpers.
- **`src/modules/access/services/grants.ts`** — `validateGrant` (called inside `assignRole`) and `assertCanRevoke` (called inside `revokeRole`).
- **`src/modules/access/services/role-audit.ts`** — `auditRoleAssigned`, `auditRoleChange`, `auditRoleRevoked`; the actual audit-log writes.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — `AuthorizationScope` and `CallerContext` types used throughout the signatures.
- **`src/modules/access/services/index.ts`** — Re-exports this module's public API.
- **`src/modules/access/services/protection.ts`** — Sibling service in the same `services/` directory (no direct import relationship visible in this file).

## Notes

- **Rejection, not throw.** Every validation path runs inside a `Promise.resolve().then(…)` chain so callers using `.catch(…)` (the codebase convention) always see a rejection. `AccessInvariantError` is never thrown synchronously.
- **`granter` is mandatory on `assignRole`.** There is no "skip the check" sentinel; seeders and test fixtures that have no real granter must write through `factories.ts` instead.
- **Session defers success auditing.** When a `session` is passed to `assignRole`/`revokeRole`, only the *failure* audit fires here. The caller records the success via `auditRoleAssigned`/`auditRoleRevoked` after the transaction commits.
- **No role fallback.** `rolesOf` returns `null` for a missing membership; it never substitutes a default role. The anonymous baseline is handled downstream by `keysInScope` in `permissions.ts`.
- **`revokeRole` / `eraseMemberships` do not guard the last admin.** The design decision is that an operator removing the last admin is acting deliberately; a replacement is one write away.
- **`bootstrapAccess` is safe on a live DB.** It is an upsert (not an insert), unlike `scenarios/apply.ts` which writes scenario data.
