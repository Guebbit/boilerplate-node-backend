---
source: src/modules/access/services/index.ts
sha256: f542e9de20b9c47a7533f83ce4ebf71175b3fcd9707e5294e5ada91ca1e82087
generated_at: 2026-10-29T02:23:11.856520+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/index.ts

## Purpose

Barrel file for the access service. It re-exports the public API of the three sub-services (`grants`, `memberships`, `protection`) plus `role-audit`, and bundles every database-reading or writing operation into a single `accessService` object so callers have one import site for all access-related work.

## Key elements

- **`accessService`** (const) — the service's public surface; aggregates 17 functions spanning grant operations, membership CRUD/queries, staff-account protection checks, and role-change auditing.
- **Named re-exports from `./grants`** — `AccessInvariantError` (error class), `assertCanGrant` (pure validation), `grantableRoles` (pure lookup), `GrantRefusal` (type).
- **Named re-export from `./memberships`** — `DEPLOYMENT_TENANT_SLUG` (constant).
- **Named re-exports from `./protection`** — `isOwnThing`, `mayChangeAccount`, `ownOrderFlag`, `roleManagementRequired` (pure checks); `ROLE_PROTECTED_REASON`, `SHOP_REFUSAL_REASONS` (constants).
- **Not separately exported** — `grantRefusalAudited`, `auditRoleAssigned`, `auditRoleRevoked` are reachable only through `accessService`.

## Relationships

- **`./grants`, `./memberships`, `./protection`, `./role-audit`** — source modules; this file imports and re-exports their public symbols.
- **`src/modules/access/index.ts` / `src/modules/access/module.ts`** — the module entry points that expose this service to the wider codebase.
- **`scripts/db/bootstrap-access.ts`** — consumes `bootstrapAccess` via `accessService` to seed initial tenant roles.
- **`scenarios/accounts.ts`** — test scenario that exercises the full grant/revoke/membership flow through `accessService`.
- **`src/modules/account/roles.ts`** — downstream consumer of role-lookup and grantable-role checks.
- **`src/modules/account/services/two-factor-enrollment.ts`** — calls protection helpers (`canChangeAccount`, `holdsStaffRole`) to guard staff-account mutations.
- **`src/modules/account/session/auth-context.ts` / `listing.ts`** — read membership/role data (`rolesOf`, `membershipsOf`, etc.) to shape session context.
- **Tests** — `access.test.ts` (integration), `grantable-roles.test.ts` and `protection.test.ts` (unit) import directly from this file.

## Notes

- The module doc explicitly states that `role-audit`'s functions and the grant internals (`grantRefusalAudited`) are **not** separately published; they are only accessible as members of `accessService`.
- A deliberate split exists: *pure* checks and constants are plain named exports, while anything that touches the database is gated behind `accessService`. Consumers that only need a read-only check (e.g. `assertCanGrant`, `mayChangeAccount`) can import without the service object.
- See `docs/theory/authorization.md` (referenced in the module docstring) for the design rationale behind the three-way split.
