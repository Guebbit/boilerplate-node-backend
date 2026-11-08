---
source: src/modules/access/model.ts
sha256: 3e0b95be99b4249867e6cf7c0d60c853917cc9ad09aefb2b325fe8e2fdd81afe
generated_at: 2026-11-08T03:56:28.369029+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/model.ts

## Purpose

Defines the two Mongoose collections that back the authorization domain: **Tenant** (the single shop this deployment serves) and **Membership** (which user holds which role in which scope). This file is the data-shape layer only—no business logic, no route handlers. It exists as its own module because multiple unrelated modules (`account`, `api-keys`, `users`, `db` scripts, integration scenarios) share this identity-and-access domain, and splitting it out follows the same rationale as `addresses` being split from `account`.

## Key elements

- **`TenantDocument` / `tenantSchema`** — `{ slug (unique, lowercase), name }` + timestamps. Represents the single shop in a deployment.
- **`MembershipDocument` / `membershipSchema`** — `{ userId, tenantId (nullable for platform scope), role (lowercase), scope (enum from `AUTHORIZATION_SCOPES`) }` + timestamps. One row = one person's one role in one place.
- **Unique compound index** on `(userId, tenantId, scope)` — enforces "one membership per person per place"; a duplicate would be ambiguous for the resolver.
- **Secondary indexes** — `(userId)` for per-request lookups; `(tenantId, role)` for audience queries (e.g. staff notices).
- **`tenantModel` / `membershipModel`** — the exported Mongoose model instances used by the store layer.
- **`TenantModel` / `MembershipModel`** — type aliases for typed store interactions.

## Relationships

- **`src/types/index.ts`** — supplies `AUTHORIZATION_SCOPES` and the `AuthorizationScope` type used as the `scope` enum.
- **`src/modules/access/repository.ts`** — consumes `tenantModel` / `membershipModel` to perform queries.
- **`src/modules/access/services/memberships.ts`** — uses the models for write operations that enforce domain invariants.
- **`src/modules/access/index.ts`** — module barrel that re-exports these symbols to other parts of the codebase.
- **`src/modules/access/tests/factories.ts`** — builds test fixtures against these schemas.
- **`tests/integration/scenarios/demo-restore.test.ts`** — integration scenario that reads/writes both collections.

## Notes

- **Single-tenant by design.** The `Tenant` collection holds exactly one document per deployment; multi-client support is a deployment concern (separate stack + DB), not an application concern.
- **Roles are data, permissions are code.** Role *names* appear here as free-form strings; the actual permission sets live in `shared/authorization-roles.yaml`, not in a database row. `Membership` records *who* holds a role—never *what* a role grants.
- **`tenantId: null`** is the sentinel for a platform-level membership, matching the `null` scope value the caller passes.
- **Routeless on purpose.** The route guard and its helpers (`permissions.ts`, `ability.ts`, `access/query.ts`) remain in the kernel; this module is the domain they query, not the asking mechanism itself.
