---
source: src/modules/access/services/grants.ts
sha256: 5814753da552c8df0aacf9f8e37f13459e9c375ebedec0651ed79383ab930c1b
generated_at: 2026-10-29T02:22:59.918270+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/grants.ts

## Purpose

Defines the authorization rules for assigning and revoking roles. Enforces two invariants at the code level (not documentation): a grant is refused if the role name is not declared in the preset catalog for the target scope, or if the granter does not hold the `assign:Role` permission. Exposes several entry points — throwing, non-throwing, and audited — so callers in different contexts (synchronous validation, HTTP error mapping, pre-transaction checks) can pick the right shape.

## Key elements

- **`ASSIGN_RULE`** (`'assign:Role'`) — the single permission that gates role assignment and revocation.
- **`AccessInvariantError`** — extends `ConflictError`; thrown on any refused grant or revoke. The HTTP layer maps it to 409 by `instanceof`.
- **`GrantRefusal`** — discriminated union (`not_granter` | `unknown_role`) describing *why* a grant was refused; carries an internal-only message.
- **`checkGrant`** (module-private) — the shared boolean core. Returns either `{ lowered }` or `{ refusal }` without throwing, so it can be called repeatedly (e.g. once per preset role in `grantableRoles`).
- **`validateGrant`** — calls `checkGrant`, throws `AccessInvariantError` on refusal, returns the lowered role name. Used when the caller will act on the result.
- **`grantableRoles`** — filters `PRESET_ROLES` for a scope and granter, returning the subset the write path would accept. Powers the client-side role picker.
- **`assertCanGrant`** — void wrapper around `validateGrant`; used before committing other state (e.g. in `users/services/update.ts` → `saveWithRole`).
- **`grantRefusalAudited`** — calls `checkGrant`; on refusal, writes an audit row (via `auditRoleChange`) *then* returns the refusal instead of throwing, so the HTTP layer can distinguish 403 from 422.
- **`assertCanRevoke`** — the mirror check for removing a role; allows the system actor or any holder of `assign:Role`, throws `AccessInvariantError` otherwise.

## Relationships

- **`@infrastructure/http/errors`** — `AccessInvariantError` extends `ConflictError`; the HTTP interpreter maps it to 409 without knowing this module exists.
- **`@kernel/ability`** — `holds()` is called in `assertCanRevoke` to check the caller's `assign:Role` permission.
- **`@kernel/permissions`** — `findRole()` resolves a role name to its definition; `PRESET_ROLES` is the catalog `grantableRoles` filters over.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` is passed to the audit call in `grantRefusalAudited` when the scope is `'tenant'`.
- **`@modules/access/audit`** — `accessAuditActions.ROLE_ASSIGNED` names the audit action recorded on refused grants.
- **`@modules/access/services/role-audit`** — `auditRoleChange` is called by `grantRefusalAudited` to persist the refusal.
- **`@types`** (`auth-context.ts` / `index.ts`) — provides the `CallerContext` and `AuthorizationScope` types used in every public signature.
- **`@modules/access/services/index.ts`** — barrel re-exports this module's public API.
- **`@modules/access/services/memberships.ts`**, **`@modules/users/services/role-refusal.ts`**, **`@modules/account/controllers/get-my-abilities.ts`** — downstream consumers that call `validateGrant`, `grantRefusalAudited`, `grantableRoles`, or `assertCanRevoke`.
- **Tests** (`grantable-roles.test.ts`, `access.test.ts`, `factories.ts`) — exercise the public functions and seed data through the factories.

## Notes

- `checkGrant` deliberately checks the granter's permission **before** looking up the role, so an unauthorized caller learns nothing about which role names exist.
- `grantableRoles` is read-only and carries no authority; the write path always re-checks via `validateGrant` or `assertCanGrant`.
- Roles marked `assignable: false` in the preset catalog (e.g. `customer`, `unverified`, `guest`) are computed, never granted; `checkGrant` refuses them with the `unknown_role` kind.
- The `granter` parameter is intentionally required (not optional): a missing granter must not silently mean "no check." Seeders that write roles without a human granter bypass this module and go through `factories.ts`.
- `grantRefusalAudited` writes the audit row **before** returning, so a refused attempt is visible in the log even though no membership was created or modified.
