---
source: src/modules/access/service.ts
sha256: 1dcfd77c970f6b15196ac381ddc8f2c5297e7f5446f064a27ef1c15a1c709b3d
generated_at: 2026-10-14T08:26:59.739043+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/service.ts

## Purpose

The service layer for the authorization model: it reads roles and memberships, writes them, and refuses any write that would break a structural invariant (an undeclared role, or a grant the granter cannot make themselves). It sits between the HTTP/API layer and the repository, translating business rules into either a committed write or a thrown `AccessInvariantError` (HTTP 409).

## Key elements

- **`SIGNUP_DEFAULT_ROLE` / `VERIFIED_CUSTOMER_ROLE`** – Re-exported constants read from `shared/authorization-roles.yaml` (via `@kernel/permissions`); the only role signup may grant, and the role it promotes to after verification.
- **`CREATE_USER_KEY`** (`'users.any.create'`) – Private constant identifying the key that exempts `VERIFIED_CUSTOMER_ROLE` from the "granter must hold every key" check, since creating an account is distinct from managing the grantee's own data.
- **`AccessInvariantError`** – Extends `ConflictError` so the HTTP error interpreter maps it to 409 via `instanceof`; carries a human-readable explanation of which invariant was violated.
- **`ensureTenant(slug, name, id?)`** – Upserts a tenant by lowercased slug. The optional `id` is passed only by the bootstrap script to keep a stable `DEPLOYMENT_TENANT_ID` across reseed cycles.
- **`membershipsOf(userId)` / `membershipIn(userId, tenantId, scope)`** – Read helpers returning all of a user's role rows, or the single row for a given scope.
- **`checkGrant(scope, roleName, granter?)`** – Private, pure function and the single source of truth for grant validation. Returns `{ lowered }` or `{ refusal }`. Two refusal reasons: role not declared in any preset for that scope, or the role holds keys the granter lacks (with the `CREATE_USER_KEY` exemption).
- **`validateGrant`** – Wraps `checkGrant` in a throw; returns the lowered role name on success.
- **`grantableRoles(scope, granter)`** – Filters `PRESET_ROLES` through `checkGrant` to produce the list a UI role-picker shows. Read-only; the write path re-validates.
- **`assertCanGrant`** – Pre-commit validation that throws before a caller commits unrelated state (used by `users/services/update.ts`).
- **`assertCanGrantAudited`** – Same check, but on refusal emits a failure audit row *before* throwing, so the attempt is recorded even though nothing was written.
- **`auditRoleAssigned`** – Emits a success audit row after the caller's transaction has committed.
- **`auditRoleChange`** (private) – Shared emitter for both assign and revoke, success and failure, to prevent the four near-identical blocks from drifting (e.g., one dropping `role` from metadata).

## Relationships

- **`src/kernel/permissions.ts`** – Source of `PRESET_ROLES`, `findRole`, `isBelowLevel`, `levelOfRoles`, and the two role-name constants. The service treats this module (and the YAML it encodes) as the sole authority on what roles and keys exist.
- **`src/kernel/access/tenant.ts`** – Provides `DEPLOYMENT_TENANT_ID`, used in audit rows for tenant-scope events and by `ensureTenant`'s bootstrap caller.
- **`src/infrastructure/http/errors.ts`** – `AccessInvariantError` extends `ConflictError`; the error interpreter maps any `ConflictError` to 409 without knowing this module exists.
- **`src/infrastructure/http/response.ts`** – `generateReject` / `ResponseReject` imported for building rejection payloads (used by truncated portion of the file).
- **`src/infrastructure/i18n/index.ts`** – `t()` for localizing refusal messages surfaced to callers.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit`, `coreAuditActions`, and the `AuditAction` type; all audit emissions in this file funnel through these.
- **`src/modules/access/repository.ts`** – `tenantRepository` and `membershipRepository` are the only persistence access this service uses; no direct Mongoose calls.
- **`src/modules/access/model.ts`** – `TenantDocument` and `MembershipDocument` types returned by the read helpers and consumed by callers.
- **`src/modules/access/audit.ts`** – `accessAuditActions` enum providing the action identifiers (`ROLE_ASSIGNED`, etc.) passed to `auditRoleChange`.
- **`src/modules/access/index.ts`** – Re-exports the public surface of this file so other modules import from the module barrel.
- **`src/modules/access/module.ts`** – Registers this service (and its dependencies) in the DI / module graph.
- **`scripts/db/bootstrap-access.ts`** – Calls `ensureTenant` with the fixed `DEPLOYMENT_TENANT_ID` to seed the platform tenant on a fresh database.
- **`scenarios/accounts.ts` / `scenarios/users.ts`** – Integration-test scenarios that exercise signup, verification, and role-assignment flows through this service's public API.

## Notes

- **Refusal over documentation.** The file's header states explicitly: an invariant that is only documented will drift; the check that is not executed is not true. Every guard here is a `throw`, not a comment.
- **`checkGrant` is the single decision point.** `validateGrant`, `grantableRoles`, `assertCanGrant`, and `assertCanGrantAudited` all delegate to it. Adding a new rule means editing one function.
- **`grantableRoles` is advisory, not authoritative.** A client builds its picker from it, but the write path re-runs `checkGrant`. The two can never disagree because they call the same function, but the picker is not a permission grant.
- **Audit-before-throw in `assertCanGrantAudited`.** A refused grant on a new account (admin create) still leaves an audit row. `assignRole`'s success path, by contrast, audits only *after* the caller's transaction commits (via `auditRoleAssigned`), because the write isn't durable until then.
- **`ensureTenant`'s `id` parameter is intentional.** Only the bootstrap script passes it. This keeps the platform tenant row at a fixed ID across `emptyDatabase()` + reseed, so any cached reference (including `DEPLOYMENT_TENANT_ID`) remains valid.
- **The `CREATE_USER_KEY` exemption is narrow.** It applies only when scope is `tenant`, the role is `VERIFIED_CUSTOMER_ROLE`, and the granter holds `users.any.create`. It does *not* relax the undeclared-role check.
