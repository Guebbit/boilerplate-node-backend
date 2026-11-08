---
source: src/modules/access/tests/unit/protection.test.ts
sha256: d8324f538eef19c424f9976d8fb33dd364e6e9db5c21e06bd61476d03a6feaa7
generated_at: 2026-11-08T03:59:19.901599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/unit/protection.test.ts

## Purpose
Unit-test suite for the staff-account protection rules in the access service: whether an account holds a staff role, whether a caller is permitted to modify a given account, and what refusal/audit is produced when they are not. All membership data is in-memory (a `Map`), and the audit writer is mocked, so every assertion exercises the decision logic in isolation without a database.

## Key elements
- **`hold(userId, tenant?, platform?)`** – helper that populates the in-memory `memberships` map with one tenant-scoped and/or one platform-scoped role row for a user.
- **`memberships` (Map)** – the stand-in for `membershipRepository.findByUserId` / `findByUserIds`, consumed by the jest mock of `../../repository`.
- **`recorded` (array) + audit mock** – captures `recordAudit` calls so tests can assert the exact `security.forbidden` fields without touching observability infrastructure.
- **`describe('holdsStaffRole')`** – verifies the service recognises every staff role and the platform `operator` role; rejects users with no membership.
- **`describe('staffHoldersAmong')`** – batch variant: given a page of user IDs, returns the subset holding any staff role in either scope.
- **`describe('mayChangeAccount')`** – pure-function matrix test (no async, no mocks needed beyond inputs): cross-tabulates *account holds staff role × caller is the account × caller holds `assign:Role`*.
- **`describe('canChangeAccount')`** – async service-level test: walks through caller-role vs. owner-role combinations, own-account bypass, system-actor bypass, and anonymous-caller rejection.
- **`describe('roleProtectedRefusal')`** – asserts the 403 `ROLE_MANAGEMENT_REQUIRED` response shape and the exact audit record for a denied role change; confirms no audit row for a customer account.
- **`describe('ownOrderFlag')`** – verifies `ownOrderFlag` returns `{ ownOrder: true }` only when caller ID matches the order owner ID.

## Relationships
- **`src/modules/access/services/index.ts`** – the system under test; re-exports `accessService`, `mayChangeAccount`, and `ownOrderFlag`.
- **`src/modules/access/services/protection.ts`** – implementation behind `accessService.holdsStaffRole`, `.staffHoldersAmong`, `.canChangeAccount`, `.roleProtectedRefusal`.
- **`src/kernel/access/tenant.ts`** – supplies `DEPLOYMENT_TENANT_ID`, which the `hold` helper stamps onto every tenant-scoped row.
- **`src/kernel/permissions.ts`** – supplies `systemCallerContext`, used to exercise the system-actor bypass path.
- **`tests/support/callers.ts`** – supplies `callerContextAs` (builds a caller with a given role and ID) and `testCallerContext` (an anonymous/stranger context).

## Notes
- The `hold` helper **replaces** a user's rows on each call (not append); calling it twice for the same ID overwrites the first.
- Tenant-scoped roles are always assigned `DEPLOYMENT_TENANT_ID`; there is no multi-tenant variation in this suite.
- `mayChangeAccount` is tested as a synchronous pure function with plain-object arguments, while `canChangeAccount` is the async service method that wraps it—both paths are covered separately.
- The audit mock spreads `jest.requireActual` to preserve the module's other exports; only `recordAudit` is replaced.
- `ownOrderFlag` lives in this file by convenience but tests a different concern (order ownership) than the protection rules; it shares the file only because it is exported from the same `services/index`.
