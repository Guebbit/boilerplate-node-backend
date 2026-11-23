---
source: src/modules/access/services/protection.ts
source_sha256: 0b8f3a2d8ba3a7aca809601373c3d84c4d7c089a699ab47cbd083fad5ed7043e
context_sha256: db51e2c22c88854ed9983d3d80ab3d46b21d0d8bb5638393ea226f3be4b92cf4
generated_at: 2026-11-22T03:17:58.958564+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/services/protection.ts

## Purpose
Implements the "protection of people" rule: an account that holds a staff role may be changed only by a holder of `assign:Role`. It also provides the refusal envelope and a `security.forbidden` audit record for blocked attempts.

## Key elements
- `ROLE_PROTECTED_REASON` (`'role_protected'`): the `metadata.reason` written on a `security.forbidden` row for this refusal.
- `SHOP_REFUSAL_REASONS`: the list of reasons written by the shop's own rules (currently only `ROLE_PROTECTED_REASON`). The platform operator's incident view leaves these out.
- `holdsStaffRole(userId)`: true if the user has any membership rows, in the shop or over the installation. It reads fresh from the database, not from a session, because it is asked about the owner of an account, who is not the one making the request.
- `staffHoldersAmong(userIds)`: batched version of `holdsStaffRole`. It runs two queries in total (tenant, with `DEPLOYMENT_TENANT_ID`, and platform) and returns a `Set` of the ids that hold a staff role. The doc comment names the inactivity reaper and users list pages as its consumers.
- `canChangeAccount(context, accountId)`: the core decision.
  - It answers yes without a lookup for the system actor or a holder of `assign:Role`.
  - Otherwise it looks up whether the target holds a staff role and passes the result to the domain rule `mayChangeAccount`.
  - The caller's own account is judged like any other.
- `roleManagementRequired()`: builds the `403 ROLE_MANAGEMENT_REQUIRED` envelope with a translated message (`generic.error-role-management-required`). It is the answer to anything that needs `assign:Role` and lacks it.
- `roleProtectedRefusal(context, accountId)`: wraps `canChangeAccount` for services. It resolves to `undefined` to carry on, or to the 403 envelope. Before refusing, it calls `auditForbidden` with `targetType: 'user'`, `targetId: accountId` and `metadata.reason = ROLE_PROTECTED_REASON`.

## Relationships
- `src/modules/access/domain/index.ts` (and `src/modules/access/domain/protection.ts`): supplies the pure rule `mayChangeAccount`, imported from `../domain`. This file gathers the facts (`holdsAssignRole`, `holdsStaffRole`) and delegates the decision.
- `src/modules/access/services/memberships.ts`: `membershipsOf` and `rolesOfMany` provide the staff-role lookups.
- `src/kernel/ability.ts`: `holds` checks whether the caller has `assign:Role`.
- `src/kernel/access/tenant.ts`: `DEPLOYMENT_TENANT_ID` scopes the tenant-role query.
- `src/infrastructure/observability/forbidden.ts`: `auditForbidden` records the refused attempt.
- `src/infrastructure/http/response.ts`: `generateReject` and the `ResponseReject` type build the 403 envelope.
- `src/infrastructure/i18n/index.ts`: `t` translates the error message (`src/infrastructure/i18n/context.ts` is a neighbor in the same area).
- `src/types/auth-context.ts` (via `src/types/index.ts`): provides `CallerContext`.
- Neighbors such as `src/modules/users/services/role.ts`, `src/modules/users/services/role-refusal.ts`, `src/modules/audit-logs/service.ts` and `src/modules/access/services/index.ts` sit in the same dependency graph. This file does not import them, so the dependency direction is not visible here.

## Notes
- The caller is required, not optional. The doc comment says a missing caller would have to answer yes or no, and a default "yes" would make the protection fail open. Paths with no request behind them (self-erasure) do not call this at all.
- Ask `canChangeAccount` after the route's own permission check. A moderator who may erase accounts may erase customers, but not the administrator.
- A staff member without `assign:Role` cannot change their own account. A key cannot change the account of the person who minted it.
- The "worst case" shortcut calls `mayChangeAccount` with `holdsStaffRole: true`. If that passes, no database lookup is made.
- `auditForbidden` is called without being awaited or chained. The refusal envelope is returned either way.
- The module doc also says a money step on one's own order is flagged in the audit trail. No such code appears in this file.
