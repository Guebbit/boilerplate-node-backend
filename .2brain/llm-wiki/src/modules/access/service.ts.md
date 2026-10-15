---
source: src/modules/access/service.ts
sha256: 7168a29c736af671f0fcc6899dafb948b81ff9018d39e825e19091d47abd3778
generated_at: 2026-10-15T09:52:55.485141+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/service.ts

## Purpose

Service layer for the authorization model: it reads tenants and memberships, validates and writes role grants, and enforces two invariants as hard refusals (not warnings) — that every assigned role is declared in `shared/authorization-roles.yaml`, and that a granter cannot hand out permissions they do not themselves hold. It sits between the HTTP/routing layer and the repository layer, adding the business rules that make a role write safe.

## Key elements

- **`AccessInvariantError`** — extends `ConflictError` (from `infrastructure/http/errors.ts`); the single throw type for both refusal reasons. Infrastructure maps it to HTTP 409 via `instanceof`.
- **`SIGNUP_DEFAULT_ROLE` / `VERIFIED_CUSTOMER_ROLE`** — exported constants re-read from `@kernel/permissions` preset metadata; the only roles a self-service or verified-customer flow may ever assign.
- **`ensureTenant(slug, name, id?)`** — upserts a tenant by slug; the optional `id` is used only by the bootstrap seeder to keep a stable ID across reseeds.
- **`membershipsOf(userId)` / `membershipIn(userId, tenantId, scope)`** — read paths returning all or a single membership row.
- **`checkGrant(scope, roleName, granter?)`** (internal) — pure verdict: `{ lowered }` or `{ refusal }`. Encodes the two invariants (undeclared role, privilege escalation) and the `CREATE_USER_KEY` exemption for `VERIFIED_CUSTOMER_ROLE`.
- **`validateGrant(scope, roleName, granter?)`** (internal) — wraps `checkGrant`; throws `AccessInvariantError` on refusal, returns the lowered role name.
- **`grantableRoles(scope, granter)`** — lists preset roles the granter *would* be allowed to assign; intended for client-side role pickers so the picker and the 409 path agree.
- **`assertCanGrant(scope, roleName, granter?)`** — synchronous, throw-only check for callers that must validate *before* committing unrelated state (e.g. `users/services/update.ts` `saveWithRole`).
- **`assertCanGrantAudited(scope, roleName, granter, context, userId?)`** — same check, but audits the refusal as a failed grant *before* throwing, so the attempt leaves an audit row even when nothing is written.
- **`auditRoleAssigned(context, userId, roleName, tenantId, scope)`** — records a *committed* successful grant; called by the caller after its transaction commits, not by the assign path itself.
- **`auditRoleChange(...)`** (internal) — single shared emitter for all four role-change audit shapes (assign/revoke × success/failure), eliminating the near-duplicate `emitAuditEvent` blocks that previously allowed metadata drift.
- **`assignRole` / `revokeRole`** — the actual write paths (truncated in the excerpt above but referenced throughout); they write through the repositories and delegate audit to the helpers above.

## Relationships

- **`src/kernel/permissions.ts`** — source of truth for role presets, `findRole`, level helpers, and the two role-name constants re-exported here.
- **`src/kernel/access/tenant.ts`** — supplies `DEPLOYMENT_TENANT_ID` used as the fixed tenant key in platform-scope grants and audit rows.
- **`src/infrastructure/http/errors.ts`** — `ConflictError` base class; `AccessInvariantError` inherits from it so the HTTP layer maps it to 409 without knowing about the access module.
- **`src/infrastructure/http/response.ts`** — imports `generateReject` / `ResponseReject` for structured error responses.
- **`src/infrastructure/i18n/index.ts`** — imports `t` for localised user-facing messages.
- **`src/infrastructure/observability/audit.ts`** — imports `recordAudit`, `coreAuditActions`, and the `AuditAction` type used by all audit helpers.
- **`src/modules/access/repository.ts`** — `membershipRepository` and `tenantRepository` are the only write/read sinks this file talks to for persistence.
- **`src/modules/access/model.ts`** — provides `MembershipDocument` and `TenantDocument` types.
- **`src/modules/access/audit.ts`** — provides `accessAuditActions` (the action-name constants used in audit rows).
- **`src/modules/access/index.ts`** — barrel re-export; external consumers import from here rather than from `service.ts` directly.
- **`src/modules/access/module.ts`** — module registration / wiring that binds this service to the module container.
- **`scripts/db/bootstrap-access.ts`** — seeder that calls `ensureTenant` with a fixed `DEPLOYMENT_TENANT_ID` to keep the tenant row stable across `emptyDatabase()` + reseed cycles.
- **`scenarios/accounts.ts` / `scenarios/users.ts`** — end-to-end test scenarios that exercise the grant/refusal paths and assert the 409 + audit-row side effects.

## Notes

- **No caller-supplied permission lists.** A role's permissions come exclusively from `shared/authorization-roles.yaml` presets. There is no dynamic role editor in this codebase; `checkGrant` relies on that invariant rather than re-validating every permission key on each grant.
- **Two-layer validation pattern.** `checkGrant` is a pure function returning a verdict object; `validateGrant` is the throwing wrapper; `grantableRoles` reuses the verdict non-throwingly. This lets the same logic serve the write path, the pre-commit assertion, and the UI picker without duplication.
- **Audit of refusal vs. success.** `assignRole` audits only *failures* inline (the grant has not committed yet). The caller is responsible for calling `auditRoleAssigned` after its transaction succeeds. `assertCanGrantAudited` is the variant for flows that open a transaction *after* the check (account create/update), where the refusal itself must be audited before the throw.
- **`CREATE_USER_KEY` exemption.** Granting `VERIFIED_CUSTOMER_ROLE` is permitted even if the granter lacks `orders.self.read` / `payments.self.read`, because those keys protect the *grantee's* data, not the granter's shop. The exemption is narrow: it requires the granter to hold `users.any.create`.
- **Philosophy (from the file header).** Invariants are enforced as executable refusals, not documented prose. The docblock explicitly warns that "the check that is not executed is the check that is not true."
