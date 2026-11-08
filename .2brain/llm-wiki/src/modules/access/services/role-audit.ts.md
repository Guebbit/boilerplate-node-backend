---
source: src/modules/access/services/role-audit.ts
sha256: 55be111b36458abbce4be4fd8608f0cf0bb33d778a125b7cce7abec906048813
generated_at: 2026-11-08T03:58:20.534023+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/role-audit.ts

## Purpose

Centralises the audit-row format for every role mutation (assign, revoke, refused attempt) so that the three call-sites in `grants.ts` emit structurally identical trail entries rather than each hand-rolling a near-identical `recordAudit` block. It exists to eliminate the drift that lets one branch silently drop a field (e.g. `role`) while the others keep it.

## Key elements

- **`auditRoleChange`** — The single writer. Accepts an `AuditAction`, an `outcome` (`'success' | 'failure'`), and optional `userId`/`role` strings; calls `recordAudit` with a fixed `targetType: 'user'` and a `metadata` object that omits `role` entirely when it is `undefined` (rather than sending `undefined`).
- **`auditRoleAssigned`** — Thin wrapper around `auditRoleChange` for a committed grant. Lower-cases `roleName` before delegating. Always passes `outcome: 'success'`.
- **`auditRoleRevoked`** — Thin wrapper for a committed revoke. Passes `roleName` as-is (no lower-casing). Always passes `outcome: 'success'`.

All three are pure "fire-and-forget" `void` functions; they do not return the audit record.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Source of the `recordAudit` runtime call and the `AuditAction` type used in the `action` parameter.
- **`src/modules/access/audit.ts`** — Supplies `accessAuditActions.ROLE_ASSIGNED` / `ROLE_REVOKED` constants passed as the `action` argument.
- **`src/modules/access/services/grants.ts`** — The primary consumer: `assignRole` / `revokeRole` call the wrappers (or `auditRoleChange` directly for failure paths) after the transaction commits.
- **`src/modules/access/services/index.ts`** — Barrel file; expected to re-export the three functions so callers import from the package root.
- **`src/modules/access/services/memberships.ts`** — Sibling service; shares the same audit vocabulary and may reference `accessAuditActions` for membership-specific actions.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Provide the `CallerContext` and `AuthorizationScope` types used in every function signature.

## Notes

- **Asymmetric lower-casing:** `auditRoleAssigned` calls `roleName.toLowerCase()` before delegating; `auditRoleRevoked` does not. If callers rely on the trail being uniformly normalised, this is a latent inconsistency.
- **`tenantId: null` is meaningful** — it denotes platform-scope roles. Do not substitute `undefined`.
- **`userId` / `role` are `string | undefined`** in `auditRoleChange` (not `string`). A `null` or `undefined` here is intentional (e.g. a grant refused before the account exists) and is handled by omitting the key from `metadata` rather than serialising an undefined value.
- The module JSDoc explicitly references `docs/theory/authorization.md` for the design rationale.
