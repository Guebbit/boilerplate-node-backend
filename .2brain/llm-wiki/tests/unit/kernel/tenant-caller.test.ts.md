---
source: tests/unit/kernel/tenant-caller.test.ts
sha256: 94ea2387ed2d21d70ac004b3946bf93c7c7702c5d94ba8b0f19e06d9f55238d9
generated_at: 2026-11-08T10:28:25.521822+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/tenant-caller.test.ts

## Purpose

Unit tests that pin down the "one-shop invariant" of the `Caller` discriminated union: tenant-scope callers (anonymous, system, and scoped) always carry a concrete `tenantId` (never `null`), while `null` is reserved exclusively for platform scope.

## Key elements

- **`describe('anonymousCaller')`** — asserts that `anonymousCaller()` returns `scope: 'tenant'` and `tenantId: DEPLOYMENT_TENANT_ID`.
- **`describe('SYSTEM_ACTOR')`** — asserts the exported `SYSTEM_ACTOR` constant has `tenantId: DEPLOYMENT_TENANT_ID`.
- **`describe('callerInScope')`** — two cases:
  - Tenant scope with `asRole('customer')` → `tenantId` is the caller's own ID (`TEST_TENANT_ID`).
  - Platform scope with `asOperator()` → `tenantId` is `null`, even though the operator also holds a shop role.

## Relationships

- **`src/kernel/permissions.ts`** — source of the three APIs under test: `anonymousCaller`, `callerInScope`, `SYSTEM_ACTOR`.
- **`src/kernel/access/tenant.ts`** — source of `DEPLOYMENT_TENANT_ID`, the fixed constant the invariant is written against.
- **`tests/support/callers.ts`** — provides test fixtures `asOperator`, `asRole`, and `TEST_TENANT_ID` (a distinct tenant ID used to verify a caller's *own* ID is propagated, not the deployment default).

## Notes

- The invariant is scope-driven, not role-driven: the platform-scope test deliberately uses `asOperator()` (who *does* hold a shop role) to confirm that choosing platform scope nulls the tenant regardless of the caller's roles.
- `TEST_TENANT_ID` ≠ `DEPLOYMENT_TENANT_ID`; the tests verify both the fixed default (anonymous/system) and the caller-specific ID (scoped) independently.
