---
source: src/modules/access/tests/unit/hierarchy.test.ts
sha256: 43c9fe07394ab3fb24b7852103ebef34b41f97fb7abf05da60ac725a5cf0847c
generated_at: 2026-10-14T08:28:02.969629+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/unit/hierarchy.test.ts

## Purpose
Unit-tests the rank/level rule in isolation: `levelOfUser`, `canActOn`, `outrankedRefusal`, and `ownMoneyRefusal` from the access service. Membership data is a plain in-memory `Map` (one row per case) rather than a database, so each test exercises the comparison logic without I/O. The header notes that the complementary cross-cutting "role-hierarchy" suite covers the same rule through real routes and a real database.

## Key elements
- **`Row` interface** – the shape a membership row has when returned by `findByUserId` (`userId`, `tenantId`, `role`, `scope`).
- **`memberships` (`Map<string, Row[]>`)** – shared mutable store the mocked repository reads; cleared in `beforeEach`.
- **`jest.mock('../../repository')`** – replaces `membershipRepository.findByUserId` with a synchronous lookup into `memberships`; `tenantRepository` is an empty stub.
- **`jest.mock('@infrastructure/observability/audit')`** – replaces `recordAudit` with a push into a local `recorded` array (other audit exports preserved via `requireActual`).
- **`hold(userId, tenant?, platform?)`** – helper that writes one or two `Row` entries for a user using `DEPLOYMENT_TENANT_ID`.
- **`keyAt(level)`** – builds a `CallerContext` shaped like an API-key caller with a forced `level` field.
- **`describe('levelOfUser')`** – table-driven: maps each role to its expected level; covers platform-only operator, multi-role (higher wins), and missing membership.
- **`describe('canActOn — the six rows')`** – table-driven caller/owner matrix; also tests self-ownership bypass, missing context, system actor, unowned targets, and unknown-user fallback to `user`.
- **`describe('canActOn — an API key')`** – verifies an API key acts at its minter's level and no higher.
- **`describe('outrankedRefusal')`** – asserts `undefined` when allowed; otherwise a `403 OUTRANKED` refusal plus one `security.forbidden` audit row with `reason: 'outranked'`.
- **`describe('ownMoneyRefusal')`** – asserts `403 FORBIDDEN` (reason `own`) for the caller's own resource; falls through to the rank rule for someone else's; skips on missing context / system actor / unowned target.

## Relationships
- **`src/modules/access/service.ts`** – source of the four functions under test (`canActOn`, `levelOfUser`, `outrankedRefusal`, `ownMoneyRefusal`).
- **`src/kernel/permissions.ts`** – provides `systemCallerContext`, used to verify the system-actor bypass.
- **`src/kernel/access/tenant.ts`** – provides `DEPLOYMENT_TENANT_ID`, the concrete tenant id stamped on every mocked membership row.
- **`src/types/auth-context.ts` / `src/types/index.ts`** – source of the `CallerContext` type used throughout.
- **`tests/support/callers.ts`** – provides `callerContextAs` and `testCallerContext` for building test caller contexts.

## Notes
- `DEPLOYMENT_TENANT_ID` is a kernel constant, not a runtime tenant; it exists only to give the mocked rows a non-null `tenantId` for tenant-scoped roles.
- The audit mock intentionally spreads `jest.requireActual` so any other audit exports the service imports still resolve; only `recordAudit` is intercepted.
- `memberships` is module-level mutable state; all tests depend on the `beforeEach` reset. Adding a test that forgets to call `hold()` will silently get an empty row (treated as level `user`).
- The file is explicitly *not* the integration-level hierarchy test — that lives in a separate "role-hierarchy" suite per the header comment.
