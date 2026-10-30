---
source: src/modules/access/tests/unit/grantable-roles.test.ts
sha256: f6966dba2089eb4de667b8869fa4c854186e38e81faba19846b95a439db64348
generated_at: 2026-10-29T02:24:37.896044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/unit/grantable-roles.test.ts

## Purpose

Unit-tests the `grantableRoles` service function in isolation: for each preset caller role, it asserts exactly which tenant-scoped roles that caller may assign, and cross-checks the read-side list against the write-side `assertCanGrant` guard so the two can never drift apart.

## Key elements

- **`everyTenantRole`** – derived from `PRESET_ROLES`; the full list of tenant-scoped role names in declaration order.
- **`assignableTenantRoles`** – same list filtered to roles where `assignable !== false` (excludes `system`).
- **`describe('grantableRoles', …)`** – the test block containing:
  - Parametrized caller checks (`admin` → all assignable; `moderator`/`support` → `[]`).
  - Empty-permissions case (no keys → empty list).
  - `system`-actor exclusion (never offered, and `assertCanGrant` throws).
  - Platform-role exclusion in tenant scope (`operator` not present).
  - **Write-path agreement** (`it.each` over every granter × target pair): asserts that a role appears in `grantableRoles` output *iff* `assertCanGrant` does not throw.

## Relationships

- **`src/kernel/permissions.ts`** – provides `PRESET_ROLES` (the role catalogue) and `permissionsOfRole` (resolves a role name to its permission-key list). Both are the sole inputs to every test case.
- **`src/modules/access/services/grants.ts`** – implements `grantableRoles` and `assertCanGrant`, the two functions under test.
- **`src/modules/access/services/index.ts`** – barrel module through which the test imports `assertCanGrant` and `grantableRoles` (`from '../../services'`).
- **`../../repository`** (mocked) – `membershipRepository` and `tenantRepository` are stubbed to empty objects to prevent any database access.

## Notes

- The test explicitly documents that `customer` and `unverified` are **audiences**, not roles; they never appear in the grantable list because there is nothing to "grant" for them.
- The cross-check test (`agrees with the write path`) is the primary drift guard: any future change to `grantableRoles` or `assertCanGrant` that makes them disagree will fail here for every affected (granter, target) pair.
- The module doc-block points to `shared/authorization-roles.yaml` as the upstream source of truth; adding a role there that alters grant permissions should surface as a new expected row in this test.
