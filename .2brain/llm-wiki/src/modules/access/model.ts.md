---
source: src/modules/access/model.ts
sha256: 1f48a583bc89c39787e2e6449095d69889e06d77bb0452b801f338430bbc9aa2
generated_at: 2026-11-14T18:26:07.312509+00:00
model: ollama:qwen3.8:27b
---

# src/modules/modules/access/model.ts

## Purpose

Defines the two Mongoose schemas and exported models that back the authorization domain: **Tenant** (the single shop per deployment) and **Membership** (which user holds which role in which scope). This is the data-shape layer of the access module; it deliberately has no route of its own and is consumed by the kernel's permission resolvers, other modules, and test harnesses.

## Key elements

- **`TenantDocument` / `TenantModel` / `tenantModel`** — Schema for the shop: a unique lowercase `slug` (the deployment's identity) and a `name`. One row per database; multi-tenancy is a deployment concern, not an application one.
- **`MembershipDocument` / `MembershipModel` / `membershipModel`** — Schema for "who holds which role, where." Fields: `userId`, `tenantId` (`null` = platform scope), `role` (lowercased string), `scope` (constrained to `AUTHORIZATION_SCOPES`).
- **`membershipSchema` unique compound index** — `{ userId, tenantId, scope }` enforces one membership per person per place per scope, preventing ambiguous resolution.
- **Secondary indexes** — `{ userId }` for per-request lookups; `{ tenantId, role }` for "who holds role X in this shop" queries.
- **`AUTHORIZATION_SCOPES` import from `@types`** — provides the enum values that constrain the `scope` field.

## Relationships

- **`src/types/index.ts`** — Supplies `AUTHORIZATION_SCOPES` and the `AuthorizationScope` type used in the `scope` field definition.
- **`src/modules/access/repository.ts`** — Consumes `tenantModel` and `membershipModel` for read/write data access.
- **`src/modules/access/services/memberships.ts`** — Uses the membership model to enforce write invariants when creating or revoking role assignments.
- **`src/modules/access/index.ts`** — Barrel re-export of the models for external consumers.
- **`src/modules/access/tests/factories.ts`** — Builds `TenantDocument` / `MembershipDocument` instances for unit tests.
- **`tests/integration/scenarios/demo-restore.test.ts`** — Seeds or asserts membership/tenant state during integration scenarios.

## Notes

- **Roles are data, permissions are code.** Role *definitions* (which permissions a role grants) live in `shared/rules/authorization-roles.yaml`, not in this database. The DB stores only *assignments* (who → which role → where). Do not add a roles collection here.
- **`tenantId: null` is meaningful** — it represents a platform-level membership, distinct from any shop-scoped membership. Queries must handle the `null` explicitly rather than treating it as "missing."
- **Routeless by design.** This module answers to no Express route; the kernel files (`permissions.ts`, `ability.ts`, `access/query.ts`) are the asking, this file is the domain they ask about.
- **Single-tenant per stack.** There is exactly one Tenant row per database. A second client gets a second deployment, not a second row.
