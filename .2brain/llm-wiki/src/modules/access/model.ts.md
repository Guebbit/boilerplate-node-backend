---
source: src/modules/access/model.ts
sha256: 1756c642ff0f078f52c6d28429a63a912ed5bfb93b57790e290a02602445ba74
generated_at: 2026-09-27T14:20:45.334638+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/model.ts

## Purpose

Defines the two Mongoose collections that back the authorization domain: **Tenant** (the single shop this deployment serves) and **Membership** (which user holds which role in which scope). This file is intentionally routeless — it holds the data shapes and indexes that `permissions.ts`, `ability.ts`, and `access/query.ts` (kernel) read, and that `repository.ts` / `service.ts` (this module) write.

## Key elements

- **`TenantDocument`** — interface for a shop row: `slug` (unique, lowercased), `name`, timestamps.
- **`MembershipDocument`** — interface for a user–role–scope row: `userId`, `tenantId` (nullable; `null` = platform scope), `role`, `scope` (`'tenant' | 'platform'`), timestamps.
- **`tenantSchema` / `membershipSchema`** — Mongoose schemas; membership enforces a **unique compound index** on `{ userId, tenantId, scope }` (one membership per person per place) and a secondary index on `userId` for the per-request resolver lookup.
- **`TenantModel` / `MembershipModel`** — exported `Model<…>` type aliases.
- **`tenantModel` / `membershipModel`** — the registered Mongoose model instances, the primary exports consumed by the repository and service layers.

## Relationships

- **`src/modules/access/repository.ts`** — imports `tenantModel` / `membershipModel` to perform the actual Mongo reads and writes.
- **`src/modules/access/service.ts`** — imports the repository (and transitively these models) to enforce write invariants (e.g., unique-membership constraint, role-grant compensation).
- **`src/modules/access/index.ts`** — re-exports the public surface of the module, including the model instances and document interfaces.
- **`src/types/auth-context.ts`** — source of the `AuthorizationScope` type imported here for the `scope` field.
- **`src/types/index.ts`** — the barrel the file imports via `@types`.
- **`tests/integration/signup-grant-compensation.test.ts`** — exercises the membership-write path (grant + compensating rollback) through the service, touching these models indirectly.
- **`tests/integration/app/demo-restore.test.ts`** — verifies restored demo data lands in the tenant/membership collections.

## Notes

- **One tenant per deployment.** The model supports a single row by convention, not by constraint; multi-tenancy is a deployment/topology choice, not an app-level one.
- **Roles live in `shared/authorization-roles.yaml`, not here.** The `role` column stores only a *name* (the key into that YAML file). Storing permission lists in the DB would create a second, drift-prone definition of the same fact.
- **`tenantId: null` is meaningful.** It marks a *platform*-scope membership; the resolver treats it identically to the caller's `null` scope token.
- **The unique compound index is an invariant, not a convenience.** A duplicate row would be ambiguous to the resolver ("which answer wins?"), so the DB rejects it outright.
