---
source: src/modules/access/tests/unit/grantable-roles.test.ts
sha256: 73cf06a871ddcfa97c8321a0631d724b4665c0f28abba517a205c8d7cdc22d07
generated_at: 2026-11-14T18:29:04.975178+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/unit/grantable-roles.test.ts

## Purpose

Unit tests for `grantableRoles` and `assertCanGrant` in isolation, verifying which tenant-scoped roles a preset caller is permitted to assign to other members. The test table is the executable model of the grant rule defined in `shared/rules/authorization-roles.yaml`: adding a role or changing its `assignable` flag should surface here as a new or updated row.

## Key elements

- **`everyTenantRole`** — all `PRESET_ROLES` with `scope === 'tenant'`, in declaration order.
- **`assignableTenantRoles`** — the subset of the above where `assignable !== false` (i.e. excludes `system`).
- **`refuses(call)`** — helper that runs a synchronous function and returns `true` if it throws; lets a single `expect` assert both grant and deny outcomes for a table row.
- **`describe('grantableRoles')`** suite containing:
  - Parameterised check that `admin` gets all assignable tenant roles, while `moderator` and `support` get none.
  - Empty-permissions caller returns `[]`.
  - `system` role is never grantable, even by `admin` (both `grantableRoles` exclusion and `assertCanGrant` rejection with a "never assigned" message).
  - Platform-scoped roles (e.g. `operator`) never appear in tenant-scope results.
  - Cross-check table (`admin`/`moderator` × every tenant role) confirming `grantableRoles` offers a role **if and only if** `assertCanGrant` does not throw — i.e. the read path and the write path agree.

## Relationships

- **`src/kernel/permissions.ts`** — source of `PRESET_ROLES` (the role catalog) and `permissionsOfRole` (maps a role name to its permission-key array). The tests derive their expected tables directly from these constants.
- **`src/modules/access/services/grants.ts`** — defines `grantableRoles` and `assertCanGrant`, the two functions under test.
- **`src/modules/access/services/index.ts`** — barrel re-export; the test imports `grantableRoles` and `assertCanGrant` through this path (`../../services`) rather than reaching into `grants.ts` directly.

## Notes

- The tests mock `../../repository` (empty stubs) so no database calls leak in; the functions under test are pure given their permission-key arguments.
- The consistency table (`agrees with the write path`) is the critical guard: if someone edits the grant rule in YAML or the service logic without updating the other side, this cross-check catches the drift immediately.
- `customer` and `unverified` are intentionally absent from the grant tables — they are audience labels, not grantable roles.
