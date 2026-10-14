---
source: src/modules/access/model.ts
sha256: 665c4b2cd06f67287dac6f45b81a126b4c86524b3a9c406fc7a19611ed49778a
generated_at: 2026-10-14T08:25:56.276442+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/model.ts

## Purpose

Defines the two Mongoose collections that back the authorization domain: **Tenant** (the single shop this deployment serves) and **Membership** (which user holds which role in which scope). This file is the *data* half of the access module — it stores identity and grant rows but contains no route logic, no permission evaluation, and no write-invariant enforcement (those live in `./service.ts` and the kernel files `permissions.ts` / `ability.ts` / `access/query.ts`).

## Key elements

- **`TenantDocument` / `tenantSchema`** — One row per shop. Fields: `slug` (unique, lowercased), `name`, timestamps. The codebase is single-tenant by design (one deployment = one shop).
- **`MembershipDocument` / `membershipSchema`** — One row per (user, place, scope) triple. Fields: `userId`, `tenantId` (`null` = platform scope), `role`, `scope` (enum from `AUTHORIZATION_SCOPES`), timestamps.
- **Unique compound index** `{ userId, tenantId, scope }` — enforces "one membership per person per place per scope"; a duplicate row would be ambiguous to the resolver.
- **Single-field index** `{ userId }` — supports the resolver's per-request "what can this user do?" lookup.
- **`TenantModel` / `MembershipModel`** — exported `Model<T>` type aliases for use in repositories and services.
- **`tenantModel` / `membershipModel`** — the concrete Mongoose model instances (`model<T>('Tenant', …)` / `model<T>('Membership', …)`).

## Relationships

- **`src/types/index.ts`** — supplies `AUTHORIZATION_SCOPES` and the `AuthorizationScope` type used as the `scope` enum.
- **`src/modules/access/repository.ts`** — wraps `tenantModel` and `membershipModel` with read/write helpers; this file is the only place the raw models are registered.
- **`src/modules/access/service.ts`** — enforces write invariants (e.g. atomic grant/revoke) and calls the repository; the doc comment in this file explicitly points to `service.ts` for those invariants.
- **`src/modules/access/index.ts`** — module barrel; re-exports the models so consumers import from the module root.
- **`src/types/auth-context.ts`** — defines the auth-context shape that the resolver builds from membership rows; this file's `scope` field is what the context carries.
- **`tests/integration/signup-grant-atomicity.test.ts` / `admin-user-grant-atomicity.test.ts`** — integration tests that exercise the membership collection's uniqueness constraint and service-level atomicity.
- **`tests/integration/scenarios/demo-restore.test.ts`** — restores demo data into `Tenant` and `Membership` collections.

## Notes

- **Single-tenant, deliberately.** There is no multi-shop support; a second client gets a second stack. Don't add a "multi-tenant" abstraction here.
- **Roles ≠ permissions.** The `role` column is a free-form string label; the *permissions* a role grants are defined in `shared/authorization-roles.yaml`, not in this database. A DB row is never the source of truth for "what a role may do."
- **`tenantId: null`** is meaningful — it represents a platform-level (shop-independent) membership, the same `null` the caller carries in its auth scope.
- **Routeless by design.** This module has no Express routes of its own. It answers questions the kernel route guard asks; it does not itself guard.
