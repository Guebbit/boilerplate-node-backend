---
source: src/modules/access/services/protection.ts
sha256: 1965899ec651df46508991e2d5b82e92d8503b10fe226ec5069da5c29a02c55f
generated_at: 2026-10-29T02:23:45.133981+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/protection.ts

## Purpose

Encapsulates the "protecting people" authorization rule: an account that holds a staff role may only be modified by a caller holding the `assign:Role` ability, and money-step operations on one's own order are flagged in the audit trail. Exposes both the pure decision logic and the async lookup helpers so services can enforce the rule consistently without duplicating the condition.

## Key elements

- **`ROLE_PROTECTED_REASON`** / **`SHOP_REFUSAL_REASONS`** — constant and readonly list used as `metadata.reason` on `security.forbidden` audit rows; consumed by the operator's incident view to filter shop-level refusals.
- **`holdsStaffRole(userId)`** — async; returns `true` if the user has any membership row (staff indicator). Reads fresh from DB, not from session, because the target is the *owner* being examined, not the caller.
- **`staffHoldersAmong(userIds)`** — batched sibling; two queries (tenant + platform scope) instead of N per-user calls. Used by the inactivity reaper and users list page.
- **`mayChangeAccount(caller, account)`** — pure, synchronous rule: allows if the account has no staff role, is the caller's own, or the caller holds `assign:Role`.
- **`canChangeAccount(context, accountId)`** — async wrapper that performs the staff-role lookup only when the fast-path shortcuts (system actor, self, `assign:Role` holder) do not already pass.
- **`roleManagementRequired()`** — builds the standard `403 ROLE_MANAGEMENT_REQUIRED` `ResponseReject` envelope with an i18n message.
- **`roleProtectedRefusal(context, accountId)`** — combines `canChangeAccount`; on denial writes a `security.forbidden` audit row (via `auditForbidden`) then returns the 403 envelope; on allowance returns `undefined`.
- **`isOwnThing(context, ownerId)`** — true when the caller (non-system) is the owner of an order/payment/return.
- **`ownOrderFlag(context, ownerId)`** — returns `{ ownOrder: true }` or `{}` for inclusion in audit metadata, flagging self-dealing at a glance.

## Relationships

- **`src/modules/access/services/memberships.ts`** — imports `membershipsOf` and `rolesOfMany` to resolve staff-role membership.
- **`src/kernel/ability.ts`** — imports `holds` to test the caller's `assign:Role` ability.
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID` for the tenant-scoped role query in `staffHoldersAmong`.
- **`src/infrastructure/http/response.ts`** — imports `generateReject` / `ResponseReject` to build the 403 envelope.
- **`src/infrastructure/i18n/index.ts`** — imports `t` for the localized error message.
- **`src/infrastructure/observability/forbidden.ts`** — imports `auditForbidden` to write the `security.forbidden` row on refusal.
- **`src/modules/access/services/index.ts`** — barrel re-export.
- **`src/modules/access/tests/unit/protection.test.ts`** — unit tests for this module.
- **`src/modules/orders/services/cancel.ts`**, **`src/modules/payments/services/refunds.ts`**, **`src/modules/payments/services/offline.ts`**, **`src/modules/payments/services/refund-settlement.ts`**, **`src/modules/returns/services/decide.ts`** — call `isOwnThing` / `ownOrderFlag` to attach the `ownOrder` audit flag when a buyer acts on their own money step.
- **`src/modules/audit-logs/service.ts`** — downstream consumer of the `security.forbidden` rows this module writes (and of `SHOP_REFUSAL_REASONS` for filtering).

## Notes

- `canChangeAccount` requires a non-optional `CallerContext` by design: a missing caller would force a fail-open or fail-closed decision, and the contract is that a path with no request behind it (e.g. self-erasure) never calls this function at all.
- `mayChangeAccount` is intentionally pure and synchronous so it can be applied row-by-row after a single batched `staffHoldersAmong` lookup (users list page) without additional I/O.
- The staff-role check reads from membership rows, not from the caller's session, because the question is always about the *account being modified*, who may be a different person than the one making the request.
