---
source: src/modules/access/services/index.ts
source_sha256: f547f14b5e729678680ea990d221ef12451130792f7f613523720f2f964289cc
context_sha256: f657daeb668d3104e84cd81b085ba36817a0559b253f544598ea06b99da9f51b
generated_at: 2026-11-22T03:17:30.624005+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/services/index.ts

## Purpose
Barrel file and single entry point for the access service. It brings together three sub-modules: `grants` (who may hand out which role), `memberships` (who holds which role where), and `protection` (protecting staff accounts). It also pulls in `role-audit`. Everything that reads or writes the database is exposed through one `accessService` object. Constants, the error class and the pure grant and ownership checks are named exports.

## Key elements
- **`accessService`**: object bundling every DB-touching operation of the module:
  - From `grants`: `grantRefusalAudited`.
  - From `memberships`: `assignRole`, `revokeRole`, `bootstrapAccess`, `ensureTenant`, `eraseMemberships`, `membersHolding`, `membershipIn`, `membershipsOf`, `rolesOf`, `rolesOfMany`.
  - From `protection`: `canChangeAccount`, `holdsStaffRole`, `roleProtectedRefusal`, `staffHoldersAmong`.
  - From `role-audit`: `auditRoleAssigned`, `auditRoleRevoked`.
- **Re-exports from `grants`**: `AccessInvariantError`, `assertCanGrant`, `grantableRoles`, and the type `GrantRefusal`.
- **Re-exports from `memberships`**: `DEPLOYMENT_TENANT_SLUG`.
- **Re-exports from `protection`**: `roleManagementRequired`, `ROLE_PROTECTED_REASON`, `SHOP_REFUSAL_REASONS`.

## Relationships
- Imports from and re-exports `./grants`, `./memberships`, `./protection` and `./role-audit`. It holds no logic of its own.
- Presumably consumed by `src/modules/access/index.ts` and `module.ts` (the module's public surface). This is not visible in the file itself.
- The listed neighbors outside the module (`scenarios/accounts.ts`, `scripts/db/bootstrap-access.ts`, `src/modules/account/roles.ts`, `src/modules/account/services/two-factor-enrollment.ts`, `src/modules/account/session/auth-context.ts`, `src/modules/account/session/listing.ts`) and the module's own tests (`access.test.ts`, `grantable-roles.test.ts`, `protection.test.ts`) are linked in the dependency graph. This file does not show which symbols they use.

## Notes
- Only `auditRoleAssigned` and `auditRoleRevoked` are published, and only through `accessService`. `role-audit`'s `auditRoleChange` and the grant internals are deliberately not published.
- The pure helpers (`assertCanGrant`, `grantableRoles`, `roleManagementRequired`) and the constants are named exports and are not part of `accessService`.
