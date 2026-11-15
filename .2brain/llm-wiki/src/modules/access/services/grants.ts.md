---
source: src/modules/access/services/grants.ts
sha256: 1767a65e24cc5029d2323bf064a5bd4eb923ae7b70e1618f6c901ce855029c5f
generated_at: 2026-11-14T18:27:17.940364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/grants.ts

## Purpose

Defines the authorization invariants for assigning and revoking roles. It enforces two rules as executable code: a role name must be a declared preset in the caller's scope, and the granter must hold the `assign:Role` permission. It exposes both throwing and non-throwing validation paths so callers can check before committing unrelated state, and an audited-refusal path so HTTP responses carry a typed 403/422 reason.

## Key elements

- **`ASSIGN_RULE`** (`'assign:Role'`) — the single permission that authorizes both granting and revoking staff roles.
- **`AccessInvariantError`** — extends `ConflictError`; thrown when a grant/revoke invariant is violated. The HTTP layer maps it to 409 by `instanceof` without needing to know the `access` module exists.
- **`GrantRefusal`** (interface) — discriminated union with `kind: 'not_granter' | 'unknown_role'` and an internal `message`. Used by HTTP callers to produce 403 or 422 responses.
- **`checkGrant`** (module-internal, not exported) — the single source of truth: returns `{ lowered }` or `{ refusal }` without throwing. Permission is checked *before* role existence so an unauthorized caller learns nothing about available role names.
- **`validateGrant(scope, roleName, granter)`** — throws `AccessInvariantError` or returns the lowered role name. The synchronous "will this pass?" gate used before writing.
- **`grantableRoles(scope, granter)`** — filters `PRESET_ROLES` through `checkGrant` and returns assignable role names in declaration order. Intended for client-side pickers; has no authority (the write re-checks).
- **`assertCanGrant(scope, roleName, granter)`** — void wrapper around `validateGrant`; throw-or-pass for callers that don't need the lowered name.
- **`grantRefusalAudited(scope, roleName, granter, context, userId?)`** — returns `GrantRefusal | undefined` instead of throwing. On refusal it calls `auditRoleChange` with a `'failure'` status *before* returning, so the attempt is recorded even though no membership was written.
- **`assertCanRevoke(context)`** — the mirror for revocation: passes if the caller is a system actor or holds `assign:Role` (checked via `holds`); otherwise throws `AccessInvariantError`.

## Relationships

- **`src/infrastructure/http/errors.ts`** — `AccessInvariantError` extends `ConflictError` from this module; the HTTP error interpreter recognizes it by `instanceof` and maps it to a 409.
- **`src/kernel/permissions.ts`** — provides `findRole`, `PRESET_ROLES`, and the `PermissionRuleId` type that `ASSIGN_RULE` is typed against.
- **`src/kernel/ability.ts`** — provides `holds`, used by `assertCanRevoke` to test the caller's permission set.
- **`src/kernel/access/tenant.ts`** — provides `DEPLOYMENT_TENANT_ID`, passed to `auditRoleChange` when the scope is `'tenant'`.
- **`src/modules/access/services/role-audit.ts`** — provides `auditRoleChange`, called by `grantRefusalAudited` to record a failed grant attempt (using an action identifier from `src/modules/access/audit.ts`).
- **`src/types/auth-context.ts`** (via `@types`) — source of `AuthorizationScope` and `CallerContext` types used throughout the signatures.
- **`src/modules/access/services/index.ts`** — barrel re-export for this service module.
- **`src/modules/access/tests/unit/grantable-roles.test.ts`** — unit-tests `grantableRoles` against the preset catalogue.
- **`src/modules/access/tests/integration/access.test.ts`** — exercises the full grant/refusal flow end-to-end.
- **`src/modules/access/tests/factories.ts`** — the seeder path referenced in docstrings: writes roles without going through the granter check.

## Notes

- **Permission is checked before role existence.** A caller without `assign:Role` gets `not_granter` and never learns which role names exist, preventing enumeration.
- **Roles are never caller-supplied.** The set of valid roles is closed: it comes exclusively from `PRESET_ROLES` (backed by `shared/rules/authorization-roles.yaml`). There is no role-creation endpoint in this codebase.
- **`granter` is required and typed `readonly string[]`.** There is no default; omitting the check is not an option (fail-closed by construction).
- **`grantableRoles` is advisory only.** It exists to keep the client picker and the server's 403/422 refusal in sync, but the authoritative check is always `validateGrant` / `checkGrant` on the write path.
- **`grantRefusalAudited` writes an audit row even though no membership changes.** The attempt is logged as a `'failure'` action before the refusal is returned to the caller.
- **`assertCanRevoke` accepts the system actor as an alternative to `assign:Role`.** This is the only path in this file where a caller need not hold the permission explicitly.
