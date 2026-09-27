---
source: src/modules/access/service.ts
sha256: 6ced567df746e62dedd8049de9aeaad9a180b65c889c838904eeafe6c75dfa01
generated_at: 2026-09-27T14:21:15.178675+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/service.ts

## Purpose

Service layer for reading and writing the authorization model (tenants, memberships, role grants). Every write path enforces two invariants at execution time — not in docs: the role must be declared in `shared/authorization-roles.yaml`, and the granter must hold every key the target role holds (one narrow exception for `users.any.create` → `customer`). Failures surface as `AccessInvariantError` (a `ConflictError` subclass → HTTP 409) or, for system callers, as an audited rejection.

## Key elements

- **`AccessInvariantError`** — extends `ConflictError`; thrown when a grant would assign an undeclared role or escalate beyond the granter's keys. Mapped to 409 by `infrastructure/http/errors.ts` via `instanceof`, without that module knowing `access` exists.
- **`SIGNUP_DEFAULT_ROLE` / `VERIFIED_CUSTOMER_ROLE`** — the two roles the public lifecycle touches (`unverified` → `customer`); hardcoded here so no caller can inject a name.
- **`ensureTenant(slug, name, id?)`** — upsert a tenant by slug; the optional `id` is only used by `bootstrapAccessModel` to pin `DEPLOYMENT_TENANT_ID` across reseeds.
- **`membershipsOf(userId)` / `membershipIn(userId, tenantId, scope)`** — read queries against the membership store.
- **`assertCanGrant(scope, roleName, granter?)`** — pre-flight validation (no write) so callers like `users/service.ts` can check before committing unrelated state.
- **`assignRole(userId, tenantId, scope, roleName, granter?, context?)`** — the write path: validates, upserts the membership row, then records an audit event on both success and failure. All logic runs inside a `Promise.resolve().then(…)` chain so synchronous throws become rejections for `.catch` callers.
- **`assignDefaultRole(userId, tenantId, scope?)`** — thin wrapper that hardcodes `SIGNUP_DEFAULT_ROLE`; deliberately has no `roleName` parameter so a signup endpoint cannot be coerced into granting an arbitrary role.
- **`promoteVerifiedCustomer(userId, tenantId)`** — one-way `unverified` → `customer` promotion; no-op if the membership already holds a different role.
- **`revokeRole`** (truncated in source) — removes a membership; intentionally allowed even for a tenant's last admin.
- **`validateGrant`** (internal) — shared validation core used by both `assertCanGrant` and `assignRole`.
- **`auditRoleChange`** (internal) — single `recordAudit` call shared by assign/revoke success/failure branches, preventing drift between near-identical blocks.

## Relationships

- **`src/kernel/permissions.ts`** — imports `findRole` to resolve a role name to its declared permissions within a scope.
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID`, the fixed id used when bootstrapping the default tenant.
- **`src/infrastructure/http/errors.ts`** — imports `ConflictError` as the base class for `AccessInvariantError`; the error interpreter in that file maps any `ConflictError` to HTTP 409.
- **`src/infrastructure/observability/audit.ts`** — imports `recordAudit` and the `AuditAction` type for structured audit logging of every grant/revoke attempt.
- **`src/modules/access/repository.ts`** — imports `membershipRepository` and `tenantRepository` for all persistence (upsert, find, remove).
- **`src/modules/access/model.ts`** — imports `MembershipDocument` and `TenantDocument` types.
- **`src/modules/access/audit.ts`** — imports `accessAuditActions` (e.g. `ROLE_ASSIGNED`) as the action enum values for audit records.
- **`src/modules/access/index.ts`** — re-exports this module's public surface as the package entry point.
- **`src/modules/access/module.ts`** — wires the service into the DI container alongside repository bindings.
- **`src/modules/account/roles.ts`** — consumes `assignRole` / `assertCanGrant` when account flows change a user's role.
- **`scenarios/users.ts` / `scenarios/accounts.ts`** — call `assignDefaultRole`, `promoteVerifiedCustomer`, or `ensureTenant` during signup and account setup flows.
- **`scripts/db/bootstrap-access.ts`** — calls `ensureTenant` with `DEPLOYMENT_TENANT_ID` to seed the fixed tenant row.
- **`scripts/db/access-grant.ts`** — invokes `assignRole` with `granter = undefined` (operator/migration path, no escalation check).
- **`src/modules/access/tests/integration/access.test.ts`** — integration tests covering grant, revoke, escalation refusal, and audit emission.

## Notes

- **All checks run inside a `Promise` chain on purpose.** `assignRole` wraps validation in `Promise.resolve().then(…)` so that synchronous throws from `validateGrant` become a *rejection*, matching the `.catch(…)` style used by every caller. A caller that `await`s still sees the same error, but one that only chains sees a rejection, never an uncaught throw.
- **`granter` is optional and means "no escalation check."** Pass `undefined` for seeders, migrations, or console operators. Passing an empty array is *not* the same as `undefined` — it would trigger the escalation check against zero held keys and reject everything.
- **The `customer`-role exemption is narrow.** A granter holding `users.any.create` may assign `customer` even without `orders.self.read` / `payments.self.read`, because those keys govern the *grantee's* own data, not the granter's shop. The exemption applies only in the `tenant` scope and only for that specific role name.
- **`assignDefaultRole` is not a general-purpose "assign the default."** It is the *only* code path a signup endpoint should use; its lack of a `roleName` parameter is the security boundary, not a documentation convention.
- **Audit is recorded on refusal, not skipped.** An escalation attempt that fails validation still emits a `failure` audit row (when `context` is provided). This is considered the most useful entry the audit vocabulary produces.
