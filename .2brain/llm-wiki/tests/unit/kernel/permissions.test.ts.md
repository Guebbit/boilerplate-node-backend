---
source: tests/unit/kernel/permissions.test.ts
sha256: f2f962cb3a80bdc878f55480a1fb15af0bb3b214089d8dc476def2aded03880a
generated_at: 2026-10-15T13:22:41.765780+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/permissions.test.ts

## Purpose

Unit tests for the permission model exported by `@kernel/permissions`. Validates that the Zod schemas for the shared `authorization-keys.yaml` and `authorization-roles.yaml` documents reject malformed input with descriptive errors, that the real loaded YAML data satisfies invariants (admin key coverage, shopper-only key isolation, platform/tenant separation), that `permissionModelVersion` behaves as an order-independent content fingerprint, and that the role-level hierarchy and helper functions (`levelOfRole`, `levelOfRoles`, `isBelowLevel`) work as specified.

## Key elements

- **`validKeysDocument`** — a minimal, valid keys-document object used as the base for mutation tests in the `keysDocumentSchema` suite.
- **`describe('keysDocumentSchema')`** — asserts `safeParse` accepts a well-formed doc and rejects bad action values, missing `scope`, unknown `stepUp` tiers, and non-object `conditions`.
- **`describe('rolesDocumentSchema')`** — same pattern for the roles document: accepts valid shape, rejects missing `permissions` array, missing `level`, invalid level values, and an anonymous entry without `level`.
- **`describe('the real shared authorization files')`** — integration-style assertions against the actually-loaded `PERMISSION_KEYS`, `PRESET_ROLES`, and `ANONYMOUS_ROLE`. Verifies admin holds every non-shopper tenant key by name, shopper-only keys (`cart.self.checkout`, `cart.self.update`) are held only by `customer` and `unverified`, admin is `unrestricted` (via `callerAs`), and admin holds no platform-scoped key.
- **`describe('permissionModelVersion')`** — pins the fingerprint's properties: changes on key swap/add/remove, invariant under reordering, returns a non-negative integer.
- **`describe('role levels')`** — asserts the full `name → level` table for all preset roles, null/unknown role defaults to `'user'`, multi-role resolution picks the highest level, and `isBelowLevel` is strictly ordered (user < staff < admin).

## Relationships

- **`src/kernel/permissions.ts`** — the module under test. This file imports its Zod schemas (`keysDocumentSchema`, `rolesDocumentSchema`), constants (`PERMISSION_KEYS`, `PRESET_ROLES`, `ANONYMOUS_ROLE`), and functions (`permissionModelVersion`, `levelOfRole`, `levelOfRoles`, `isBelowLevel`, `ANONYMOUS_ROLE`). A schema parse failure at import time would prevent this test file from loading at all.
- **`tests/support/callers.ts`** — provides the `callerAs` helper, used in the admin/manager `unrestricted` assertion.

## Notes

- The file doubles as a smoke test: if either YAML file failed its Zod schema, the import of `@kernel/permissions` would throw and the entire test file would fail to load. The "real shared authorization files" suite is the visible confirmation that did not happen.
- The `EXPECTED` level table in the `role levels` suite is written out explicitly (not derived from the data) so that any re-levelling decision is visible in code review as a diff.
- Tests that assert on error messages use `z.prettifyError(result.error)` and check that the offending field name appears in the string, keeping tests coupled to *which* field is rejected rather than exact wording.
- The file is truncated in this snapshot; the `isBelowLevel` suite likely continues with the remaining comparison pairs.
