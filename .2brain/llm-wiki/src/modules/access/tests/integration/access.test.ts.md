---
source: src/modules/access/tests/integration/access.test.ts
sha256: a80135312c6adadf3eac2b5db432500ed81513c45c5c8e7f7b87a2580fb6900e
generated_at: 2026-09-23T17:58:05.731421+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/integration/access.test.ts

## Purpose

Integration test suite that exercises the access module's **storage layer** (membership rows in an in-memory Mongo) against the writers in `service.ts` and `repository.ts`. It verifies that role assignments, reassignments, revocations, tenant bootstrapping, and invariant refusals behave correctly when the data actually lives in a database. It complements the cross-cutting conformance suite (which proves both backends decide identically) by proving the data those decisions read from can be written, edited, and refused correctly.

## Key elements

- **`describe('the preset roles')`** — Confirms `permissionsOfRole` resolves from the shared YAML with no database involvement.
- **`describe('membership across tenants')`** — Verifies a person can hold different roles in different tenants, one role per person per tenant (reassignment replaces), and tenant/platform scopes are independent.
- **`describe('the invariants')`** — Asserts refusals: undeclared roles throw `AccessInvariantError`; granting permissions the granter lacks throws a privilege-escalation error; a granter can hand over exactly their own permissions; the last admin can be revoked; a failing `deleteById` propagates to the caller (not silently swallowed).
- **`describe('bootstrapAccessModel')`** — Confirms it creates the deployment tenant idempotently, keeps the original ID/name on repeat calls, and grants no roles.
- **`describe('a role lives in exactly one place…')`** — Asserts no-membership resolves to `null` roles, `assignDefaultRole` can only grant `unverified`, and undeclared role names are rejected.
- **`describe('auditing a role change')`** — Verifies `emitAuditEvent` is called with correct `action`, `outcome` (success/failure), actor, target, and metadata for grants, refused escalations, and revocations.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces `emitAuditEvent` with a `jest.fn()` and re-routes `recordAudit` through that same replacement so `observePort` spies see all audit traffic (direct and via `recordAudit`).
- **`setupTestDb()`** — Boots an in-memory Mongo for the whole suite; no per-test DB needed.

## Relationships

| Neighbor | Interaction |
|----------|-------------|
| `src/modules/access/service.ts` | Primary subject under test — all domain functions (`assignRole`, `revokeRole`, `membershipsOf`, `rolesOf`, `bootstrapAccessModel`, `ensureTenant`, `assignDefaultRole`, `AccessInvariantError`, `DEPLOYMENT_TENANT_SLUG`, etc.) are imported and exercised. |
| `src/modules/access/repository.ts` | `membershipRepository.deleteById` is spied on to simulate a Mongo failure and assert the rejection propagates. |
| `src/modules/access/audit.ts` | `accessAuditActions` enum values are used in audit assertions. |
| `src/infrastructure/observability/audit.ts` | Mocked (not spied) to capture `emitAuditEvent` calls; `recordAudit` is re-routed through the replacement. |
| `src/kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` imported for tenant identity checks. |
| `src/kernel/permissions.ts` | `permissionsOfRole` used to read preset permissions and to verify "granter hands over exactly what they hold." |
| `tests/support/setup-test-db.ts` | `setupTestDb` provides the in-memory Mongo lifecycle. |
| `tests/support/ports.ts` | `observePort` wraps the mocked `emitAuditEvent` for per-test spy assertions (the "replaced, not spied on" pattern). |
| `tests/support/callers.ts` | `testCallerContext` / `callerContextAs` fabricate actor identities for grant/revoke calls and audit assertions. |

## Notes

- The audit mock is **replaced, not spied on** (see `tests/support/ports.ts` for rationale). Because `recordAudit` in the real module closes over its own `emitAuditEvent`, the mock explicitly re-routes `recordAudit` through the replacement `jest.fn()`; without this, spying on `emitAuditEvent` would miss every `recordAudit`-originated event.
- `afterEach(() => jest.restoreAllMocks())` restores spies (e.g., `deleteById`) between tests, but the module-level `jest.mock` replacement persists for the whole file.
- The file intentionally does **not** seed demo accounts or exercise the full demo model — that is the concern of `tests/integration/access.test.ts` at the system level (referenced in the module doc-comment as a companion).
- `assignDefaultRole` is type-guarded (no role-name parameter), so the test only needs to verify it produces `unverified`; there is no "wrong role" path to test.
