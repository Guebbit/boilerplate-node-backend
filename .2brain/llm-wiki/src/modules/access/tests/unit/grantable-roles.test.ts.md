---
source: src/modules/access/tests/unit/grantable-roles.test.ts
sha256: 0f5053a5fb8fb255563e8439a2ea1b2a27150b925e783c69916ca2bb86c6f695
generated_at: 2026-10-14T08:27:41.088974+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/unit/grantable-roles.test.ts

## Purpose

Unit test for `grantableRoles` that doubles as a human-reviewable table of which tenant roles each preset caller may grant. The module docblock makes this explicit: when a new role is added to `shared/authorization-roles.yaml` that shifts grant permissions, the corresponding row here is the thing to review.

## Key elements

- **`everyTenantRole`** — derived list of all tenant-scoped role names pulled from `PRESET_ROLES`, used to build expectations and drive the cross-check loop.
- **`it.each([...])` table (granter → grantable roles)** — the core specification. Locks in the expected grantable set for `admin`, `moderator`, `support`, and `customer`, and documents why `unverified` is excluded from `admin` (it holds the shopper-only `cart.self.update` key).
- **"gives an empty list to a caller holding no keys"** — edge case: zero permissions yields `[]`.
- **"offers no platform role in tenant scope"** — guards against scope leakage (e.g. `operator` appearing in a tenant grant list).
- **"agrees with the write path about \<role\>"** (`it.each(everyTenantRole)`) — cross-checks `grantableRoles` (read path) against `assertCanGrant` (write path) for every tenant role, ensuring the two implementations never diverge.

## Relationships

- **`src/kernel/permissions.ts`** — source of `permissionsOfRole` and `PRESET_ROLES`; supplies the permission keys and the role catalogue the tests assert against.
- **`src/modules/access/service.ts`** — the module under test; provides both `grantableRoles` (the function exercised directly) and `assertCanGrant` (used in the write-path cross-check).
- **`../../repository`** — mocked away (`jest.mock`) so no database access is needed; the test is fully in-memory.

## Notes

- The `it.each` table is intentionally a **literal** enumeration, not a computed expectation. That makes it a review artifact: a reviewer can diff it against `shared/authorization-roles.yaml` without running code.
- The cross-check test uses `moderator` as the fixed granter and iterates over every tenant role. This means it validates agreement across the full role set in one pass rather than re-listing every (granter, role) pair.
- `unverified` is the only tenant role that `admin` cannot grant, and the reason is a *missing* key on the granter side (`cart.self.update`), not an explicit deny rule. The test comment calls this out so it isn't "fixed" by mistake.
