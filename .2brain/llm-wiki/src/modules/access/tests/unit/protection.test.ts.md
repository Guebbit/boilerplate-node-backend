---
source: src/modules/access/tests/unit/protection.test.ts
sha256: d8324f538eef19c424f9976d8fb33dd364e6e9db5c21e06bd61476d03a6feaa7
generated_at: 2026-10-29T02:24:55.708364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/unit/protection.test.ts

## Purpose

Unit tests for the staff-account protection logic in the access module. It verifies that `holdsStaffRole`, `staffHoldersAmong`, `mayChangeAccount`, `canChangeAccount`, `roleProtectedRefusal`, and `ownOrderFlag` enforce the rule that only a holder of `assign:Role` (or the account owner, or the system actor) may modify a staff account, and that a refusal is both returned and audited. All repository and audit I/O is mocked so the tests exercise pure decision logic in isolation.

## Key elements

- **`Row` interface** — the shape of a single membership record (`userId`, `tenantId`, `role`, `scope`) returned by the mocked repository.
- **`memberships` (module-level `Map`)** — in-memory stand-in for the membership table; the sole data source the mocked `findByUserId` / `findByUserIds` read from.
- **`hold(userId, tenant, platform?)`** — helper that inserts one tenant-scoped and/or one platform-scoped row for a user, always using `DEPLOYMENT_TENANT_ID`.
- **`recorded` array + mocked `recordAudit`** — captures audit-field objects so tests can assert the exact payload of a `security.forbidden` event.
- **`jest.mock('../../repository', …)`** — replaces `membershipRepository` with the in-memory `Map` and stubs out `tenantRepository`.
- **`jest.mock('@infrastructure/observability/audit', …)`** — keeps the real module shape but swaps `recordAudit` for a push-into-`recorded` spy.
- **`describe('holdsStaffRole')`** — table-driven check that every listed tenant role and the platform `operator` role register as staff; a user with no membership does not.
- **`describe('staffHoldersAmong')`** — verifies the batch helper returns a `Set` of user IDs holding any staff role across both scopes.
- **`describe('mayChangeAccount')`** — pure-function truth table over `[holdsStaffRole, own, holdsAssignRole]`; also asserts anonymous callers are denied.
- **`describe('canChangeAccount')`** — async integration-style checks through `accessService`, covering role-hierarchy cases, self-service, the system actor bypass, and the "stranger" (`testCallerContext`) case.
- **`describe('roleProtectedRefusal')`** — asserts the 403 `ROLE_MANAGEMENT_REQUIRED` refusal object and the exact `security.forbidden` audit record; also confirms no refusal/audit for customer accounts.
- **`describe('ownOrderFlag')`** — verifies `ownOrderFlag` returns `{ ownOrder: true }` only when the caller ID matches the target ID.

## Relationships

- **`src/modules/access/services/protection.ts`** — the implementation under test; all `accessService.*` calls and the `mayChangeAccount` / `ownOrderFlag` imports resolve here through the services barrel.
- **`src/modules/access/services/index.ts`** — barrel re-export that this file imports `accessService`, `mayChangeAccount`, and `ownOrderFlag` from (`../../services`).
- **`src/kernel/permissions.ts`** — provides `systemCallerContext`, used in the system-actor bypass and `ownOrderFlag` tests.
- **`src/kernel/access/tenant.ts`** — provides `DEPLOYMENT_TENANT_ID`, the constant `hold()` stamps onto every tenant-scoped row.
- **`tests/support/callers.ts`** — provides `callerContextAs` and `testCallerContext`, the synthetic caller identities used throughout.

## Notes

- `mayChangeAccount` is tested as a **synchronous pure function** (no `await`), while `canChangeAccount` is **async** because it reads the mocked membership repo. Don't accidentally `await` the former or drop the `await` on the latter.
- `hold()` always writes the tenant row with `DEPLOYMENT_TENANT_ID`; there is no way to set an arbitrary `tenantId` through this helper. If a test needs a different tenant, it must insert into `memberships` directly.
- `testCallerContext` (imported from `tests/support/callers.ts`) represents a "stranger" — a caller with no real identity. The `canChangeAccount` test asserts it is denied, distinguishing it from an explicit anonymous (`id: null`) check in the `mayChangeAccount` suite.
- The `recorded` array is cleared in `beforeEach` alongside `memberships`; forgetting to reset either will cause cross-test contamination because both are module-level.
