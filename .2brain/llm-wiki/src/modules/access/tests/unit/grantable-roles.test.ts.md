---
source: src/modules/access/tests/unit/grantable-roles.test.ts
source_sha256: 5ac8963054590569fdced284cd82e070f4cb0e04f8e469b86e161739e1a04d04
context_sha256: e8f27f85b1751606b0b719293e7cba27fbb295136c4517b80f489468d525df1c
generated_at: 2026-11-22T03:18:47.334486+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/tests/unit/grantable-roles.test.ts

## Purpose
Unit tests for `grantableRoles` in isolation: which tenant roles each preset caller may hand out. The expectations follow the same rule `validateGrant` applies on the write path. The file's header says the table is the model: a role added to `shared/rules/authorization-roles.yaml` that changes who may grant what shows up here as a row to review.

## Key elements
- `everyTenantRole`: names of all `PRESET_ROLES` with `scope === 'tenant'`, in declaration order.
- `assignableTenantRoles`: the tenant roles whose `assignable` is not `false`, which excludes `system`.
- `refuses(call)`: runs a synchronous call and returns `true` if it throws. This lets one `expect` cover both outcomes of a table row.
- Table test: `admin` gets all `assignableTenantRoles`. `moderator` and `support` get `[]`. The comment says the rule is "hold `assign:Role`", so only a role manager can grant.
- A caller holding no permission keys gets `[]`.
- `system` is never offered, even to `admin`, and `assertCanGrant('tenant', 'system', …)` throws `/never assigned/`.
- The `operator` platform role is not offered in tenant scope.
- Parity test: for `admin` and `moderator` against every tenant role, `refuses(assertCanGrant(...))` must equal `!grantableRoles(...).includes(role)`. This ties the list to the write-path check.

## Relationships
- `src/kernel/permissions.ts`: provides `PRESET_ROLES` (used to derive the role lists) and `permissionsOfRole` (used to build each caller's permission set).
- `src/modules/access/services/index.ts`: the test imports `grantableRoles` and `assertCanGrant` from here. The implementation presumably lives in `src/modules/access/services/grants.ts`, which the index appears to re-export; the test does not import that file directly.
- `../../repository`: mocked with empty `membershipRepository` and `tenantRepository` objects, so no data layer is needed.

## Notes
- The `jest.mock` of the repository is needed only so that importing the services doesn't load the real repositories. The tests call only pure permission logic.
- The parity test covers only `admin` and `moderator`, not `support` or other callers.
