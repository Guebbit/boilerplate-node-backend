---
source: tests/unit/kernel/tenant-caller.test.ts
sha256: 94ea2387ed2d21d70ac004b3946bf93c7c7702c5d94ba8b0f19e06d9f55238d9
generated_at: 2026-09-23T20:28:24.585185+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/tenant-caller.test.ts

## Purpose

Verifies the **one-shop invariant**: every tenant-scope `Caller` (anonymous stranger, `SYSTEM_ACTOR`, and any caller resolved via `callerInScope`) must carry the fixed `DEPLOYMENT_TENANT_ID`, and `null` for `tenantId` is reserved exclusively for platform scope. The file exists to lock this discriminated-union contract against accidental regression.

## Key elements

- **`describe('anonymousCaller')`** — asserts that `anonymousCaller()` returns a caller with `scope: 'tenant'` and `tenantId: DEPLOYMENT_TENANT_ID`.
- **`describe('SYSTEM_ACTOR')`** — asserts that the exported `SYSTEM_ACTOR` constant carries `DEPLOYMENT_TENANT_ID` (not `null`).
- **`describe('callerInScope')`** — two cases:
    - Tenant scope: `callerInScope(asRole('customer'), 'tenant')` yields the resolved caller's own tenant id (`TEST_TENANT_ID`).
    - Platform scope: `callerInScope(asOperator(), 'platform')` yields `tenantId: null`, even when the underlying caller holds a shop role.

## Relationships

- **`src/kernel/permissions.ts`** — source of the units under test: `anonymousCaller`, `callerInScope`, `SYSTEM_ACTOR`.
- **`src/kernel/access/tenant.ts`** — provides the `DEPLOYMENT_TENANT_ID` constant used as the expected tenant id in all tenant-scope assertions.
- **`tests/support/callers.ts`** — provides test fixtures `asOperator`, `asRole`, and `TEST_TENANT_ID` used to construct caller inputs and set expectations.

## Notes

- The module doc comment frames the invariant as a _proof obligation_: `null` tenantId must appear **only** in platform scope. If a future refactor introduces a path where a tenant-scope caller receives `null`, these tests are the guard.
- `TEST_TENANT_ID` (from `tests/support/callers.ts`) and `DEPLOYMENT_TENANT_ID` (from `src/kernel/access/tenant.ts`) are **different values** used in different assertions. Tenant-scope _caller_ assertions compare against the caller's own tenant; the anonymous/system-actor assertions compare against the deployment-level constant.
