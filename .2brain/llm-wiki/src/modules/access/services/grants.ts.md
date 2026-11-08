---
source: src/modules/access/services/grants.ts
sha256: 59218d3315e3460387e6c4d7ed132e4cb0e876cedeb575b167c95b7c6674cb42
generated_at: 2026-11-08T03:57:20.764643+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/grants.ts

## Purpose

Enforces the two invariants that gate every role assignment: the granter must hold `assign:Role`, and the role must exist (and be assignable) in the target scope. Every public function here is a refusal mechanism rather than a permission grant — the file answers "may this write proceed?" and, when the answer is no, names the broken invariant. It provides both throwing and non-throwing variants so callers can validate before committing unrelated state.

## Key elements

- **`ASSIGN_RULE`** – Constant (`'assign:Role'`); the single permission that authorises role hand-out and account modification.
- **`AccessInvariantError`** – Extends `ConflictError`; represents a write that would violate an access invariant. Mapped to HTTP 409 by the infrastructure error interpreter.
- **`GrantRefusal`** – Discriminated interface (`'not_granter' | 'unknown_role'`) carrying the internal message. Never sent verbatim to a client.
- **`checkGrant`** (internal) – The single decision core. Checks granter permission first, then role existence/scope, then assignability. Returns a `GrantVerdict` (lowered name or refusal) without throwing.
- **`validateGrant`** – Synchronous gate: calls `checkGrant`, throws `AccessInvariantError` on refusal, returns the lowered role name on success.
- **`grantableRoles`** – Filters `PRESET_ROLES` in the given scope through `checkGrant` to list assignable role names. Used by clients to build a role picker; carries no authority of its own.
- **`assertCanGrant`** – Side-effect-free "would this succeed?" probe for callers that need to validate before committing other state (e.g. `users/services/update.ts`).
- **`grantRefusalAudited`** – Like `assertCanGrant` but returns the `GrantRefusal` instead of throwing, and writes a failure audit row via `auditRoleChange` before returning. Intended for create/update paths that must open a transaction.
- **`assertCanRevoke`** – Mirror check for the revoke side: requires the caller to be the system actor or to hold `assign:Role` (checked via `holds`).

## Relationships

- **`src/kernel/permissions.ts`** – Supplies `findRole`, `PRESET_ROLES`, and the `PermissionRuleId` type; the source of truth for what roles exist and their scopes.
- **`src/kernel/ability.ts`** – `holds` is used in `assertCanRevoke` to test permission ownership on a `CallerContext`.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` is passed to `auditRoleChange` when the scope is `'tenant'`.
- **`src/infrastructure/http/errors.ts`** – `ConflictError` is the base class of `AccessInvariantError`; the HTTP layer maps any `ConflictError` instance to a 409 response.
- **`src/modules/access/services/role-audit.ts`** – `auditRoleChange` is called by `grantRefusalAudited` to record the failed attempt.
- **`src/modules/access/audit.ts`** – Provides `accessAuditActions.ROLE_ASSIGNED` used as the audit action key.
- **`src/types/auth-context.ts`** (via `@types`) – Source of `AuthorizationScope` and `CallerContext` types used throughout.
- **`src/modules/access/tests/unit/grantable-roles.test.ts`** – Unit-tests `grantableRoles` behaviour.
- **`src/modules/access/tests/factories.ts`** – Seeder/test-factory path that writes roles without a granter (bypasses `checkGrant` by design).

## Notes

- **Check order is intentional.** The granter-permission test runs before the role-existence test so that a caller without `assign:Role` cannot enumerate valid role names by observing different refusal messages.
- **`checkGrant` uses `Array.includes`** for the granter check, while `assertCanRevoke` uses the `holds` helper from `@kernel/ability`. Do not "unify" these without confirming both paths are equivalent.
- **`grantableRoles` is advisory only.** The write path re-invokes `validateGrant`/`checkGrant`; a stale or tampered picker list does not bypass the invariant.
- **Refusals in `grantRefusalAudited` are audited as `'failure'`** on the `ROLE_ASSIGNED` action before the refusal is returned, so the attempt leaves an audit trail even though no membership row is written.
- **Seeded/factory roles skip grant checks entirely** (documented in `checkGrant`'s param docs). This is by design — a seeder has no caller to validate against.
