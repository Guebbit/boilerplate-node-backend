---
source: src/modules/access/model.ts
sha256: 347d20d7d4cfd7c0b633f1f3ca5b55c5c4609d670c734f7a8992aa270edc01f3
generated_at: 2026-09-23T17:57:13.645364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/model.ts

## Purpose

Defines the two Mongoose collections that store the identity-and-access domain: **Tenant** (the single shop) and **Membership** (who holds which role in which scope). This is a routeless domain module — the *data* that kernel files (`permissions.ts`, `ability.ts`, `access/query.ts`) read at request time — not the asking itself. It is shared by `account`, `api-keys`, `users`, `db` scripts, and `scenarios`.

## Key elements

- **`TenantDocument` / `MembershipDocument`** – TypeScript interfaces describing the two row shapes. `MembershipDocument.scope` is an `AuthorizationScope` (`'tenant' | 'platform'`); `tenantId` is `null` for platform-level memberships.
- **`tenantSchema`** – `slug` (unique, lowercased, trimmed) and `name`; auto-timestamps.
- **`membershipSchema`** – `userId`, `tenantId` (defaults `null`), `role`, `scope` (enum); auto-timestamps.
- **Compound unique index** `{ userId, tenantId, scope }` – enforces one membership per person per place per scope; a second row would create an ambiguous grant.
- **`{ userId: 1 }` index** – supports the per-request resolver lookup.
- **`TenantModel` / `MembershipModel`** – typed `Model<T>` aliases for consumers.
- **`tenantModel` / `membershipModel`** – the exported Mongoose model instances (registered names: `"Tenant"`, `"Membership"`).

## Relationships

- **`src/types/auth-context.ts`** – supplies the `AuthorizationScope` type used by `MembershipDocument.scope`.
- **`src/modules/access/service.ts`** – applies write invariants (e.g. membership creation/revocation) on top of these models.
- **`src/modules/access/repository.ts`** – data-access layer that queries these collections.
- **`src/modules/access/index.ts`** – module barrel; re-exports these symbols to consumers.
- **`tests/integration/app/demo-restore.test.ts`** – integration test that seeds/reads Tenant and Membership rows.
- **`tests/integration/signup-grant-compensation.test.ts`** – exercises the signup flow that writes a Membership row and verifies compensation on failure.

## Notes

- **Single-tenant by design.** The deployment holds exactly one `Tenant` row; a second client gets a second stack/database, not a second row.
- **Roles are data, permissions are code.** Role *permissions* live solely in `shared/authorization-roles.yaml` (read byte-for-byte by the PHP twin). The DB stores only *who* holds a role, never *what* a role grants.
- **`tenantId: null` is meaningful.** It denotes a platform-scope membership, matching the `null` the caller carries in its auth context.
- **Routeless on purpose.** Kernel files that *ask* about access (`permissions.ts`, `ability.ts`, `access/query.ts`) are intentionally kept out of this module so the domain model stays decoupled from the route-guard mechanism.
