---
source: tests/unit/kernel/permissions.test.ts
sha256: 320f90aa35de3fd25c8d027ff829d521401f38277b22e5ae94c6b5fb1cf18e1c
generated_at: 2026-11-08T10:27:48.271682+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/permissions.test.ts

## Purpose

Unit tests for the permission and role system defined in `@kernel/permissions`. The file verifies that the Zod schemas correctly reject malformed authorization documents, that the real `shared/authorization-keys.yaml` and `shared/authorization-roles.yaml` files load with their expected invariants (admin completeness, scope isolation, no audience duplication on staff roles), that the `permissionModelVersion` fingerprint behaves correctly, and that the audience/role boundary is enforced.

## Key elements

- **`keysDocumentSchema` tests** — confirm the schema accepts a valid keys document and rejects bad actions, missing scopes, unknown `stepUp` tiers, and non-object `conditions`.
- **`rolesDocumentSchema` tests** — confirm the schema accepts a valid roles document and rejects unknown audience names, missing `sets`, and missing computed audience entries.
- **"the real shared authorization files" block** — smoke-tests that the YAML files imported at module load actually populated `PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, and `AUDIENCE_ROLES`; asserts admin holds every tenant rule by name (minus customer audience rules), holds no platform rule, and is unrestricted regardless of `verified`.
- **`permissionModelVersion` tests** — pin the fingerprint's invariants: changes on rule swap, unchanged on reorder, changes on add/remove, returns a non-negative integer.
- **Role management tests** — assert `assign:Role` is held only by `admin` and `system`, and no role carries a `level` field.
- **Audience roles tests** — verify `audienceOf` maps session state to the correct audience name, `isAudienceName` discriminates audiences from staff roles, customer gets `checkout:Cart` while unverified does not, `create:Example` is staff-only, and the customer audience includes every `*Own`/`*Shopping`/`*Storefront` set.
- **Fixtures** — `validKeysDocument` and `validAudience` serve as minimal valid documents that individual tests mutate to break exactly one field.

## Relationships

- **`src/kernel/permissions.ts`** — the module under test. Every exported symbol (`AUDIENCE_NAMES`, `AUDIENCE_ROLES`, `audienceOf`, `isAudienceName`, `keysInScope`, `callerInScope`, `staffRoleWithheld`, `SYSTEM_ACTOR`, `keysDocumentSchema`, `rolesDocumentSchema`, `PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `permissionModelVersion`) is imported and exercised here. If the YAML files fail schema validation at import, this entire test file fails to load.
- **`tests/support/callers.ts`** — provides the `asRole` and `callerAs` helpers used to simulate different callers (e.g., `callerAs('admin')`, `asRole('admin')`) in the audience, scope, and role-management assertions.

## Notes

- The "real shared authorization files" block is partly a load-time smoke test: its primary value is that the file would crash at import if the YAML were malformed, so the explicit `length > 0` assertions are the *visible* confirmation that loading succeeded.
- Admin completeness is guaranteed by *enumeration*, not a wildcard: admin lists every tenant rule by name except those already in the customer audience. A newly declared tenant set will be missing from admin until explicitly added — the tests catch that gap.
- `permissionModelVersion` tests assert *properties* of the fingerprint (sensitivity to swap, invariance to order) rather than pinning a specific numeric value, so the implementation can evolve.
- The audience-vs-staff separation test (`no audience rule on a staff role`) exists because the audience is unioned in at runtime; duplicating an audience set on a staff role would cause silent drift.
