---
source: src/modules/access/service.ts
sha256: b0339d3000c4f63c3ce75584c8915cddce67e2cbee8e33caf488e216262c5395
generated_at: 2026-09-23T17:57:48.983554+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/service.ts

## Purpose

The service layer for reading and writing the authorization model. It enforces two hard invariants on every role write — the role must be declared in the preset catalog, and the granter must already hold every permission the role grants — by raising `AccessInvariantError` rather than documenting the rules. It also owns tenant upsert, membership lookups, the self-service signup role, the verification promotion, and role revocation.

## Key elements

- **`SIGNUP_DEFAULT_ROLE`** (`'unverified'`) — the only role a signup path may assign.
- **`VERIFIED_CUSTOMER_ROLE`** (`'customer'`) — the role `unverified` promotes to after address verification.
- **`CREATE_USER_KEY`** (`'users.any.create'`) — internal constant; the exemption key that lets a granter assign `customer` without holding `orders.self.read` / `payments.self.read`.
- **`AccessInvariantError`** — thrown (as a promise rejection) when a grant references an undeclared role or exceeds the granter's permissions.
- **`ensureTenant(slug, name, id?)`** — upserts a tenant by slug; `id` is only passed by bootstrap to keep a stable id across reseed cycles.
- **`membershipsOf(userId)`** — all membership rows for a person.
- **`membershipIn(userId, tenantId, scope)`** — the single membership in a given scope, or `null`.
- **`assertCanGrant(scope, roleName, granter?)`** — synchronous dry-run of `validateGrant`; used by callers that must check *before* committing unrelated state.
- **`assignRole(userId, tenantId, scope, roleName, granter?, context?)`** — validates then upserts a membership. All checks run inside a `Promise.resolve().then(...)` chain so callers always see a **rejection**, never a synchronous throw. Audits success and failure (escalation attempts are logged as failures).
- **`assignDefaultRole(userId, tenantId, scope?)`** — thin wrapper over `assignRole` that hard-codes `SIGNUP_DEFAULT_ROLE`; has no `roleName` parameter so the caller cannot inject an arbitrary role.
- **`promoteVerifiedCustomer(userId, tenantId)`** — promotes `unverified → customer`; returns `false` (no-op) if the membership already holds any other role.
- **`revokeRole(userId, tenantId, scope, context?)`** — removes a membership. Permitted even for a tenant's last admin. (Implementation truncated in source.)

## Relationships

- **`src/kernel/permissions.ts`** — calls `findRole` to resolve a role name to its declared permission set during validation.
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID` (used by bootstrap callers of `ensureTenant`).
- **`src/modules/access/repository.ts`** — all reads/writes go through `membershipRepository` and `tenantRepository`; this service contains no direct DB access.
- **`src/modules/access/model.ts`** — type source for `MembershipDocument` and `TenantDocument`.
- **`src/modules/access/audit.ts`** — provides `accessAuditActions` enum values used when emitting audit rows.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is the final sink for every grant/revoke audit entry (success and failure).
- **`src/modules/account/controllers/get-oauth-callback.ts`** — calls `assignDefaultRole` after OAuth signup.
- **`src/modules/account/controllers/post-login-2fa.ts`** — calls `promoteVerifiedCustomer` after 2FA confirms the address.
- **`src/modules/access/index.ts`** — barrel re-export surface for this module.
- **`scripts/db/bootstrap-access.ts`** — calls `ensureTenant` with the fixed `DEPLOYMENT_TENANT_ID`.
- **`src/modules/access/tests/integration/access.test.ts`** — integration coverage for the grant/refusal/audit paths.

## Notes

- `assignRole` is **always async-by-rejection**. Every caller in the codebase uses `.catch(...)`; a synchronous `throw` would bypass that contract. The `Promise.resolve().then(...)` wrapper exists solely to guarantee this.
- `granter` is `undefined` only for seeders, migrations, and operator-console calls — the three paths with no upstream user to escalate from. Any non-`undefined` granter triggers the permission-subset check.
- `assertCanGrant` and `assignRole` share the same `validateGrant` core; use the former when you need a "would this work?" check before writing unrelated state (see `users/service.ts` → `updateSavedUser`).
- `promoteVerifiedCustomer` will **never** overwrite or downgrade a role an operator already assigned; it is strictly `unverified → customer`.
- Revoking the last admin of a tenant is intentionally allowed — the model trusts the operator and treats re-administration as a single follow-up write.
