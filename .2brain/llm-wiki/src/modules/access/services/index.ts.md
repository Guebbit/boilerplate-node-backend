---
source: src/modules/access/services/index.ts
sha256: fa606e36887d98eb4c59c997267ffff74bf2a4b48ec02d621c0ad461b5456fe6
generated_at: 2026-11-14T18:27:51.320747+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/index.ts

## Purpose

Barrel file that assembles the access module's public API. It re-exports pure constants and helper types (role checks, error types, refusal reasons) directly and bundles every database-reading or writing operation into a single `accessService` object, giving consumers one stable import surface for the three service files (`grants`, `memberships`, `protection`) plus the `role-audit` helpers.

## Key elements

- **`accessService`** (const object) — the sole aggregate export for all DB-touching operations: `grantRefusalAudited`, `assignRole`, `revokeRole`, `bootstrapAccess`, `ensureTenant`, `eraseMemberships`, `membersHolding`, `membershipIn`, `membershipsOf`, `rolesOf`, `rolesOfMany`, `canChangeAccount`, `holdsStaffRole`, `roleProtectedRefusal`, `staffHoldersAmong`, `auditRoleAssigned`, `auditRoleRevoked`.
- **Re-exported named items** — `AccessInvariantError`, `assertCanGrant`, `grantableRoles`, `GrantRefusal` (type) from `./grants`; `DEPLOYMENT_TENANT_SLUG` from `./memberships`; `roleManagementRequired`, `ROLE_PROTECTED_REASON`, `SHOP_REFUSAL_REASONS` from `./protection`.
- **Not exported** — `auditRoleChange` and other internal grant/membership helpers stay private to their source files.

## Relationships

- **`src/modules/access/services/grants.ts`, `src/modules/access/services/memberships.ts`, `src/modules/access/services/protection.ts`, `src/modules/access/services/role-audit.ts`** — direct sources; this file is their outward-facing re-export point.
- **`src/modules/access/index.ts`** — the module-level entry that re-exports `accessService` and the named constants from this file.
- **`src/modules/access/module.ts`** — DI/module registration that injects `accessService` into consumers.
- **`src/modules/account/roles.ts`** — defines role identifiers and types consumed by the grantable-roles and staff-role checks.
- **`src/modules/account/session/auth-context.ts`** — provides the authenticated caller context relied upon by the grants and protection operations.
- **`src/modules/account/session/listing.ts`** — consumes role/membership queries from this module for session-scoped account views.
- **`src/modules/account/services/two-factor-enrollment.ts`** — consumes protection-related operations from this module to gate enrollment.
- **`scripts/db/bootstrap-access.ts`** — invokes the bootstrap operation exposed by this module during initial seeding.
- **`scenarios/accounts.ts`** — scenario-level fixture that exercises the access service surface.
- **`src/modules/access/tests/integration/access.test.ts`, `src/modules/access/tests/unit/grantable-roles.test.ts`, `src/modules/access/tests/unit/protection.test.ts`** — test the `accessService` surface and the named exports directly.

## Notes

- The design intentionally splits the API in two: **named exports** are side-effect-free (constants, pure predicates, error types) and **`accessService`** is the single object that performs I/O. This keeps tree-shaking simple and makes it obvious which calls hit the database.
- `auditRoleChange` (the general internal helper in `role-audit.ts`) is deliberately *not* re-exported; only the public `auditRoleAssigned` / `auditRoleRevoked` wrappers appear in `accessService`.
- Consumers should import from `src/modules/access` (the module barrel) rather than reaching into this file directly, to keep the public surface stable.
