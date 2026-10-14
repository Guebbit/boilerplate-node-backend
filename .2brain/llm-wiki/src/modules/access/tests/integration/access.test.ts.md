---
source: src/modules/access/tests/integration/access.test.ts
sha256: 24d18c7028ef7a573318344764a51a7637ac94b5da532c4ae8a279e21f1ccf6e
generated_at: 2026-10-14T08:27:25.113276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/integration/access.test.ts

## Purpose

Integration tests for the authorization model's **storage layer** — membership rows in an in-memory Mongo (wired by `setupTestDb`). Proves the service writers (`service.ts`, `repository.ts`) can create, replace, and refuse memberships correctly, and that every invariant is enforced at write time. Complements `tests/cross-cutting/authorization-conformance.test.ts` (which proves both backends decide identically) and `tests/integration/access.test.ts` (which seeds the full demo model).

## Key elements

- **`jest.mock('@infrastructure/observability/audit')`** — Replaces `emitAuditEvent` with a spy and re-routes `recordAudit` (which closes over its own module's reference) through the replacement so both call paths are observable.
- **`describe('the preset roles')`** — Confirms `permissionsOfRole` resolves purely from `shared/authorization-roles.yaml` with no database involvement.
- **`describe('membership across tenants')`** — Verifies per-tenant role isolation, one-role-per-person-per-tenant (reassignment replaces), and `tenant`/`platform` scope separation.
- **`describe('the invariants')`** — Refusal of undeclared roles, privilege-escalation rejection, last-admin revocation, and that a rejected `deleteById` surfaces to the caller (not lost as an unhandled rejection).
- **`describe('bootstrapAccessModel')`** — Idempotent shop creation; no accounts seeded; name from first insert wins.
- **`describe('a role lives in exactly one place')`** — No-membership resolves to `null`; `assignDefaultRole` can only ever grant `unverified` (type guard: no role-name parameter); unknown role names throw `AccessInvariantError`.
- **`describe('auditing a role change')`** — Asserts `emitAuditEvent` is called with correct `action`, `outcome` (success/failure), `actorUserId`, `targetId`, and `metadata.role` for grants, refusals, and revokes.

## Relationships

- **`src/modules/access/service.ts`** — Primary subject under test; imports `assignRole`, `revokeRole`, `ensureTenant`, `membershipsOf`, `rolesOf`, `bootstrapAccessModel`, `assignDefaultRole`, `AccessInvariantError`, and friends.
- **`src/modules/access/repository.ts`** — `membershipRepository.deleteById` is spied on to simulate a Mongo failure.
- **`src/modules/access/audit.ts`** — `accessAuditActions` constants used in audit-event assertions.
- **`src/kernel/permissions.ts`** — `permissionsOfRole` called to confirm YAML-based resolution and to derive a granter's key set.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` constant referenced.
- **`src/infrastructure/observability/audit.ts`** — Mocked; `emitAuditEvent` and `recordAudit` replaced with spy-compatible versions.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` imported (available for transactional test scenarios).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` boots the in-memory Mongo fixture for every test.
- **`tests/support/ports.ts`** — `observePort` wraps the mocked `emitAuditEvent` spy for assertions.
- **`tests/support/callers.ts`** — `testCallerContext` and `callerContextAs` build synthetic actor contexts for audit tests.

## Notes

- **Audit mock is a replacement, not a spy.** `recordAudit` closes over its module-local `emitAuditEvent`, so a plain `jest.spyOn` would miss calls routed through it. The mock factory re-wires `recordAudit` to call the replacement `emitAuditEvent` directly. See `tests/support/ports.ts` for the convention.
- **Preset roles have no DB row.** They live solely in `shared/authorization-roles.yaml` and are read at import time via `kernel/permissions.ts`. There is no seed, no edit, no delete at runtime — the old `deleteRole` path is gone.
- **`assignDefaultRole` is safe by type, not by check.** Its signature accepts no role-name parameter, so a caller literally cannot express "grant admin" through it.
- **The "rejecting delete" test documents a past bug** where `membershipRepository.deleteById` was fired with `void` (unawaited), turning a Mongo failure into a silent unhandled rejection. The current code awaits and re-throws.
- **`afterEach(() => jest.restoreAllMocks())`** ensures the audit replacement and any inline spies do not leak between tests.
