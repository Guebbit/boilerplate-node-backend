---
source: tests/unit/kernel/permissions.test.ts
sha256: 07b240a5fe07e93c8b7c8c0f99932913824111d5fb73f683c62c7a4f86fe1106
generated_at: 2026-09-23T20:27:40.769658+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/permissions.test.ts

## Purpose

Unit tests for the Zod schemas and derived exports in `@kernel/permissions`. Verifies that the authorization keys/roles documents are validated strictly (not merely cast), that the real shared YAML files loaded successfully at import, that the `admin` preset role is correctly tenant-scoped, and that the `permissionModelVersion` fingerprint changes on key swaps but not on reorders.

## Key elements

- **`validKeysDocument`** — a minimal, otherwise-valid keys document used as the base fixture that each schema-rejection test mutates in exactly one field.
- **`describe('keysDocumentSchema')`** — five cases: accepts a well-formed doc; rejects an action outside the declared vocabulary (asserting the error names both `keys` and `action` via `z.prettifyError`); rejects a key missing `scope`; rejects an unknown `stepUp` tier; rejects non-object `conditions`.
- **`describe('rolesDocumentSchema')`** — two cases: accepts a well-formed roles doc (including `anonymous`); rejects a role entry that omits the `permissions` array.
- **`describe('the real shared authorization files')`** — three cases: asserts `PERMISSION_KEYS`, `PRESET_ROLES`, and `ANONYMOUS_ROLE` are non-empty (i.e. the import-time schema parse didn't throw); asserts `admin` holds every declared tenant key by name; asserts `admin` holds **no** platform key.
- **`describe('permissionModelVersion')`** — four cases: version changes when a key is swapped (same count, different identity); version is stable under reorder; version changes on add/remove; result is a non-negative integer.

## Relationships

- **`src/kernel/permissions.ts`** (`@kernel/permissions`) — sole production dependency. Imports `ANONYMOUS_ROLE`, `keysDocumentSchema`, `permissionModelVersion`, `PERMISSION_KEYS`, `PRESET_ROLES`, `rolesDocumentSchema`. The schemas are exercised via `.safeParse()`; the constants are asserted on directly.
- **`zod`** — imported solely for `z.prettifyError` to inspect schema-error messages in one test.

## Notes

- The "real shared authorization files" suite is effectively an **import-time guard**: if `shared/authorization-keys.yaml` or `shared/authorization-roles.yaml` failed its Zod schema, the `import { … } from '@kernel/permissions'` at the top of this file would throw and the entire test module would fail to load. The explicit assertions are the visible confirmation that didn't happen.
- There is intentionally **no wildcard** in the admin role. Admin is unrestricted within its tenant scope only because it lists every tenant key by name; a newly declared key would be silently missing from admin otherwise, which the "grants admin every declared tenant key" test catches.
- The `permissionModelVersion` tests (annotated "B14") exist because a plain `.length` check cannot distinguish "same keys" from "different keys of the same count" — a rename or key-for-key swap would leave a length-based version unchanged and let a client's cached rules go stale.
