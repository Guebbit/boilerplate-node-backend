---
source: src/modules/access/tests/unit/protection.test.ts
source_sha256: e54862f8fa8b9caf0fe8ab235cda972070900c0cc067b828098c5d3ad699a777
context_sha256: db71d25e499218a7d20fee185875cd9dca316296d37988e7b59df27cf31d745c
generated_at: 2026-11-22T03:19:03.179607+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/tests/unit/protection.test.ts

## Purpose
Unit tests for the protection of staff accounts in the access module. They cover how `accessService` decides whether an account holds a staff role and whether a caller may change that account (only a holder of `assign:Role` may change a staff account). Membership rows are a mocked in-memory table, so each case is pure. The same rule through real routes and a database is covered by the integration users suite.

## Key elements
- `Row` / `memberships` map: the shape of a membership row and the table the mocked `membershipRepository` (`findByUserId`, `findByUserIds`) reads. `tenantRepository` is mocked as an empty object.
- `recorded`: collects the fields passed to the mocked `recordAudit`, which is the only part of the audit module replaced. The rest comes from `jest.requireActual`.
- `hold(userId, tenant, platform?)`: seeds a tenant-scope row (under `DEPLOYMENT_TENANT_ID`) and/or a platform-scope row (`tenantId: null`).
- `beforeEach`: clears `memberships` and `recorded`.
- Test groups:
  - `holdsStaffRole`: `manager`, `warehouse`, `support`, `editor`, `moderator` and `admin` count as staff. A platform `operator` with no shop role also counts. A user with no membership does not.
  - `staffHoldersAmong`: returns a `Set` of the staff holders in a list, across both scopes.
  - `mayChangeAccount` (domain): truth table over (account holds staff role, caller holds `assign:Role`).
  - `canChangeAccount`: table of caller role against account role.
    - Support cannot change moderator or admin accounts.
    - A moderator cannot change an admin or a platform-only operator.
    - An admin can change anyone.
    - A caller's own account is judged like any other.
    - `systemCallerContext('User')` skips the check.
    - An anonymous `testCallerContext` is refused for staff accounts.
  - `roleProtectedRefusal`: returns `undefined` for a customer account. For a protected account it returns a 403 with code `ROLE_MANAGEMENT_REQUIRED` and records a failed `security.forbidden` audit row with `metadata.reason: 'role_protected'`.
  - `ownOrderFlag` (domain): returns `{ ownOrder: true }` only when the caller context's user id matches the order owner. It returns `{}` for another user, an undefined owner, an undefined context, or the system actor.

## Relationships
- Exercises `accessService` from `../../services` and `mayChangeAccount` / `ownOrderFlag` from `../../domain`. The protection logic lives in `src/modules/access/domain/protection.ts`.
- Uses `callerContextAs` and `testCallerContext` from `tests/support/callers.ts` to build callers.
- Uses `systemCallerContext` from `src/kernel/permissions.ts` for the system actor.
- Uses `DEPLOYMENT_TENANT_ID` from `src/kernel/access/tenant.ts` to scope tenant-level membership rows.
- Mocks `../../repository` and `@infrastructure/observability/audit`, so no database or audit write happens.
- `src/modules/inventory/services/allocate.ts` and `src/modules/users/services/purchase-hold.ts` are graph neighbors, but this file does not reference them directly.

## Notes
- The `jest.mock` factories read `memberships` and `recorded` lazily, at call time, so the module-level variables are safe to use inside them.
- In the `canChangeAccount` table, the owner role `'operator'` is seeded as a platform-only membership. Any other owner role is seeded as a tenant role, and `null` means the owner has no membership.
