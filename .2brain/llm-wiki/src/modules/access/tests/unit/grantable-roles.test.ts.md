---
source: src/modules/access/tests/unit/grantable-roles.test.ts
sha256: f6966dba2089eb4de667b8869fa4c854186e38e81faba19846b95a439db64348
generated_at: 2026-11-08T03:59:01.927331+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/unit/grantable-roles.test.ts

## Purpose

Unit tests for the `grantableRoles` read-path helper in isolation. They verify that the list of tenant roles a caller *may* hand out (as surfaced to the UI) is consistent with the write-path check performed by `assertCanGrant`, and that structural invariants hold (e.g. `system` is never assignable, platform roles don't leak into tenant scope).

## Key elements

- **`everyTenantRole`** – derived constant: names of all `PRESET_ROLES` with `scope === 'tenant'`.
- **`assignableTenantRoles`** – derived constant: same filter minus roles marked `assignable: false` (excludes `system`).
- **`it.each` (granter → expected list)** – table-driven assertion that `admin` receives all assignable roles, while `moderator` and `support` receive `[]`.
- **`it('gives an empty list…')`** – caller with zero permissions gets `[]`.
- **`it('never offers the system actor…')`** – `grantableRoles` excludes `system`; `assertCanGrant` throws `/never assigned/` for it.
- **`it('offers no platform role in tenant scope')`** – `operator` is absent from the tenant-scope result.
- **`it.each` (cross-check)** – for every (granter, target-role) pair, asserts `grantableRoles` inclusion agrees with whether `assertCanGrant` throws or passes. This is the core read-path / write-path consistency guard.

## Relationships

- **`src/kernel/permissions.ts`** – source of `permissionsOfRole` and `PRESET_ROLES`; the test uses these to build both the permission set and the expected role lists without any DB access.
- **`src/modules/access/services/grants.ts`** – defines the two functions under test (`grantableRoles`, `assertCanGrant`).
- **`src/modules/access/services/index.ts`** – barrel re-export from which the test imports the two functions (`import { … } from '../../services'`).

## Notes

- The repository module (`../../repository`) is mocked with empty objects; no database or network is touched.
- Adding a new tenant role to `shared/authorization-roles.yaml` (or flipping its `assignable` flag) will change `assignableTenantRoles` and break the first `it.each` row unless the expected list is updated.
- The cross-check test iterates **all** tenant roles for both `admin` and `moderator`; a new role automatically becomes a new test case with no extra boilerplate.
