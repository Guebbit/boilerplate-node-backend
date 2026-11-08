---
source: src/modules/access/services/protection.ts
sha256: 1965899ec651df46508991e2d5b82e92d8503b10fe226ec5069da5c29a02c55f
generated_at: 2026-11-08T03:58:09.214582+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/protection.ts

## Purpose

Enforces two shop-level protection rules: (1) an account that holds a staff role may only be changed by a holder of `assign:Role` (or itself), and (2) a money step performed by the order's own buyer is flagged in the audit trail as self-dealing. All guards, refusal envelopes, and audit-flag helpers live here so that order, payment, and return services share one implementation.

## Key elements

- **`ROLE_PROTECTED_REASON`** – string constant (`'role_protected'`) used as `metadata.reason` on `security.forbidden` audit rows.
- **`SHOP_REFUSAL_REASONS`** – readonly array of shop-level refusal reasons; lets the platform operator's incident view filter them out.
- **`holdsStaffRole(userId)`** – async; single membership lookup to determine if one user holds a staff role.
- **`staffHoldersAmong(userIds)`** – async; batched sibling (2 queries total) returning a `Set` of user-ids that hold a staff role. Used by the inactivity reaper and list pages.
- **`mayChangeAccount(caller, account)`** – pure synchronous predicate implementing the rule: allow if account has no staff role, is the caller's own, or caller holds `assign:Role`.
- **`canChangeAccount(context, accountId)`** – async guard; short-circuits for system actors, self, and `assign:Role` holders without a DB lookup; otherwise calls `holdsStaffRole` then delegates to `mayChangeAccount`.
- **`roleManagementRequired()`** – builds the `403 ROLE_MANAGEMENT_REQUIRED` response envelope (i18n'd message).
- **`roleProtectedRefusal(context, accountId)`** – combines `canChangeAccount` → on denial, writes a `security.forbidden` audit row (target type `user`) and returns the 403 envelope; on allow, returns `undefined`.
- **`isOwnThing(context, ownerId)`** – synchronous; true when the caller is non-system and `ownerId` matches the caller's id.
- **`ownOrderFlag(context, ownerId)`** – returns `{ ownOrder: true }` for the buyer's own order, `{}` otherwise; attached to audit metadata so reviewers see self-dealing at a glance.

## Relationships

- **`src/kernel/ability.ts`** – imports `holds` to evaluate `assign:Role` on the caller.
- **`src/kernel/access/tenant.ts`** – imports `DEPLOYMENT_TENANT_ID` for the tenant-scoped role query in `staffHoldersAmong`.
- **`src/infrastructure/i18n/index.ts`** / **`context.ts`** – imports `t` for the i18n'd 403 message.
- **`src/infrastructure/http/response.ts`** – imports `generateReject` and `ResponseReject` to build the refusal envelope.
- **`src/infrastructure/observability/forbidden.ts`** – imports `auditForbidden` to record the failed attempt.
- **`src/modules/access/services/memberships.ts`** – imports `membershipsOf` and `rolesOfMany` for role lookups.
- **`src/modules/access/services/index.ts`** – re-exports the public surface of this module.
- **`src/modules/access/tests/unit/protection.test.ts`** – unit tests for the guards and helpers.
- **`src/modules/orders/services/cancel.ts`**, **`src/modules/payments/services/offline.ts`**, **`src/modules/payments/services/refunds.ts`**, **`src/modules/payments/services/refund-settlement.ts`**, **`src/modules/returns/services/decide.ts`** – money-step services that call `ownOrderFlag` / `isOwnThing` to tag their audit rows.
- **`src/modules/audit-logs/service.ts`** – consumer of the `security.forbidden` rows and `ownOrder` metadata this module produces.

## Notes

- `mayChangeAccount` is the **single source of truth** for the protection rule; `canChangeAccount` and `roleProtectedRefusal` are thin async wrappers around it.
- A missing `CallerContext` is **not** a pass. The doc comment explicitly rejects fail-open: a path with no request behind it (e.g. self-erasure) must not call `canChangeAccount` at all.
- `ownOrderFlag` is **informational, not a denial** – a staff member acting on their own order is still allowed; the flag merely makes self-dealing visible in audit.
- `staffHoldersAmong` issues exactly two queries (tenant + platform) regardless of list size; avoid calling it in a per-row loop.
- The module is marked `@module` (no named export) and is consumed via the barrel in `services/index.ts`.
