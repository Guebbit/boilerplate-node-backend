---
source: src/modules/access/tests/integration/access.test.ts
sha256: e94e9902b48a5e13875704c7a11d5abbf535e0c4345278e18866d3fb7a459349
generated_at: 2026-10-29T02:24:27.054425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/integration/access.test.ts

## Purpose

Integration tests for the access module's **storage layer** — membership seeding, assignment, revocation, and the invariants that guard them — run against the in-memory MongoDB wired up by `setupTestDb`. Unlike the cross-cutting conformance suite (which proves both backends *agree* on a decision), this file proves the decisions are read **from a correctly-writable store**: one role per person per tenant, no privilege escalation, no undeclared roles, and audit events fired on both success and failure.

## Key elements

- **`the preset roles`** — asserts `permissionsOfRole('support')` resolves from the shared YAML file with zero database involvement.
- **`membership across tenants`** — verifies a person can hold different roles in two tenants, that reassignment *replaces* (one row per person per place), and that `tenant` and `platform` scopes are independent.
- **`the invariants`** — the bulk of the file. Covers: refusal of undeclared roles, refusal of privilege-escalation grants, correct grant when the granter holds the keys, last-admin removal, refusal of revoke/grant by unauthorised or anonymous callers, rejection of an empty granter key-set, and surfacing a rejected `deleteById` instead of swallowing it.
- **`bootstrapAccess`** — confirms bootstrapping creates the deployment tenant (slug `DEPLOYMENT_TENANT_SLUG`), seeds no accounts, and is idempotent (second call returns the same `_id`, keeps the first name).
- **`a role lives in exactly one place, the membership row`** — null role for ungranted accounts; `it.each` over `customer` / `unverified` / `guest` to assert audiences are computed, never granted.
- **`auditing a role change`** — (truncated in source) verifies `auditPort.emitAuditEvent` is called with the correct `accessAuditActions`, actor, target, and outcome.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/access/services/index.ts` | Primary SUT: imports `accessService`, `AccessInvariantError`, `DEPLOYMENT_TENANT_SLUG`. |
| `src/modules/access/repository.ts` | Spies on `membershipRepository.deleteById` to simulate a Mongo failure. |
| `src/modules/access/audit.ts` | Imports `accessAuditActions` enum for asserting audit payloads. |
| `src/kernel/permissions.ts` | Imports `permissionsOfRole` to supply granter key-sets and to verify preset resolution. |
| `src/kernel/access/tenant.ts` | Imports `DEPLOYMENT_TENANT_ID` (referenced in bootstrap assertions). |
| `src/infrastructure/observability/audit.ts` | **Replaced** (not spied) via `jest.mock` → `auditPortMock()` from `tests/support/ports.ts`. |
| `src/infrastructure/runtime/database.ts` | Imports `withTransaction` (available for transactional test scenarios). |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` at module scope to provision the in-memory Mongo. |
| `tests/support/callers.ts` | Imports `testCallerContext` (anonymous) and `callerContextAs(role)` to fabricate caller identities. |
| `tests/support/ports.ts` | Provides `observePort` for asserting port calls and `auditPortMock` for the audit port replacement. |
| `src/modules/access/tests/factories.ts` | Imports `seedMembership` to insert baseline rows before exercising the service. |

## Notes

- **Audit port is replaced, not spied on.** The `jest.mock` factory calls `auditPortMock()` from `tests/support/ports.ts`; see that file for the rationale (deterministic port capture vs. partial spy).
- **Preset roles are immutable at runtime.** There is no `deleteRole` or per-tenant role edit anymore — `shared/authorization-roles.yaml` is the sole authority, read at import by `kernel/permissions.ts`. Tests that previously exercised editable roles have been removed.
- **`setupTestDb()` runs once at module load**, not inside a `beforeAll`; every test in the file shares that single in-memory instance. `afterEach` restores all mocks.
- **Cross-cutting vs. integration split:** the conformance suite in `tests/cross-cutting/authorization-conformance.test.ts` proves the two backends *decide identically*; this file proves the *store* those decisions are read from can be written, edited, and refused correctly. They are complementary, not redundant.
