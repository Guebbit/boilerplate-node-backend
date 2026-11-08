---
source: src/modules/access/services/index.ts
sha256: f542e9de20b9c47a7533f83ce4ebf71175b3fcd9707e5294e5ada91ca1e82087
generated_at: 2026-11-08T03:57:36.136900+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/index.ts

## Purpose

Barrel module that defines the public surface of the access service. It re-exports the pure helpers, constants, and error class from the three sibling sub-modules (`grants`, `memberships`, `protection`) and bundles every database-reading/writing operation—plus the two audit hooks from `role-audit`—into a single `accessService` object. Callers import this file instead of reaching into individual sub-module paths.

## Key elements

- **`accessService`** (const object) — the sole aggregated export for all stateful operations: `grantRefusalAudited`, `assignRole`, `revokeRole`, `bootstrapAccess`, `ensureTenant`, `eraseMemberships`, `membersHolding`, `membershipIn`, `membershipsOf`, `rolesOf`, `rolesOfMany`, `canChangeAccount`, `holdsStaffRole`, `roleProtectedRefusal`, `staffHoldersAmong`, `auditRoleAssigned`, `auditRoleRevoked`.
- **Named re-exports from `./grants`** — `AccessInvariantError`, `assertCanGrant`, `grantableRoles`, type `GrantRefusal`.
- **Named re-export from `./memberships`** — `DEPLOYMENT_TENANT_SLUG` (constant).
- **Named re-exports from `./protection`** — `isOwnThing`, `mayChangeAccount`, `ownOrderFlag`, `roleManagementRequired`, `ROLE_PROTECTED_REASON`, `SHOP_REFUSAL_REASONS` (pure checks and reason constants).
- **Imports from `./role-audit`** — `auditRoleAssigned`, `auditRoleRevoked` (included in `accessService` but *not* separately re-exported).

## Relationships

- **`./grants.ts`, `./memberships.ts`, `./protection.ts`** — this file's three data sources; it imports their operations and re-exports their pure/constants.
- **`./role-audit.ts`** — supplies the two audit hooks embedded in `accessService`.
- **`src/modules/access/index.ts`** — the module-level barrel that re-exports this services index to consumers outside the services directory.
- **`src/modules/access/module.ts`** — wires the access module into the application; expects to consume `accessService` and the named exports defined here.
- **`scripts/db/bootstrap-access.ts`** — calls `accessService.bootstrapAccess` (imported via this file or the module barrel).
- **`src/modules/account/roles.ts`, `src/modules/account/services/two-factor-enrollment.ts`, `src/modules/account/session/auth-context.ts`, `src/modules/account/session/listing.ts`** — downstream consumers that rely on the named protection checks (`mayChangeAccount`, `holdsStaffRole`, etc.) or `accessService` methods re-exported through this file.
- **Tests** (`access.test.ts`, `grantable-roles.test.ts`, `protection.test.ts`) — import the named exports and `accessService` to exercise the surface defined here.

## Notes

- The split is intentional: **named exports** are pure functions, constants, or the error class (no I/O); **`accessService`** contains every operation that reads or writes the database. Callers should not mix the two categories.
- `auditRoleChange` (mentioned in the file's own docstring) is **not** published; only `auditRoleAssigned` and `auditRoleRevoked` appear in `accessService`. Do not expect a generic `auditRoleChange` export.
- This file contains no logic of its own—only imports, re-exports, and the object literal. Any behavior change belongs in the sub-modules.
