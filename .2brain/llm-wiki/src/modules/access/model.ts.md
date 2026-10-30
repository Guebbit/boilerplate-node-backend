---
source: src/modules/access/model.ts
sha256: 3e0b95be99b4249867e6cf7c0d60c853917cc9ad09aefb2b325fe8e2fdd81afe
generated_at: 2026-10-29T02:22:18.103924+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/model.ts

## Purpose

Defines the two Mongoose collections that persist the authorization domain: **Tenant** (the single shop this deployment serves) and **Membership** (which user holds which role in which scope). It is the data-layer anchor for the `access` module — the "what is stored" that the services in `./services/` enforce write-invariants on and that the kernel resolver reads on every authenticated request.

## Key elements

- **`TenantDocument` / `MembershipDocument`** – TypeScript interfaces extending Mongoose `Document`; define the shape of each row.
- **`tenantSchema`** – Mongoose schema for Tenant (`slug` unique + lowercase + trim, `name` required; timestamps on).
- **`membershipSchema`** – Mongoose schema for Membership (`userId`, `tenantId` nullable, `role` lowercase + trim, `scope` constrained to `AUTHORIZATION_SCOPES` enum; timestamps on).
- **Indexes on `membershipSchema`:**
  - `{ userId, tenantId, scope }` — **unique**; enforces at most one membership per person per place per scope.
  - `{ userId }` — per-request lookup by the resolver.
  - `{ tenantId, role }` — "who holds this role in this shop" (e.g. staff notices).
- **`tenantModel: TenantModel`** / **`membershipModel: MembershipModel`** – the exported, ready-to-use Mongoose models (singletons).
- **`TenantModel` / `MembershipModel`** – type aliases (`Model<TenantDocument>`, `Model<MembershipDocument>`) for typing stores or repositories.

## Relationships

- **`src/types/index.ts`** – Source of `AUTHORIZATION_SCOPES` and `AuthorizationScope`; the `scope` field's enum and type both come from here.
- **`src/types/auth-context.ts`** – Defines the runtime auth context shape that consumes the `scope` / `tenantId` / `role` values stored here.
- **`src/modules/access/repository.ts`** – Reads and writes through `tenantModel` / `membershipModel`; this file is the collection it talks to.
- **`src/modules/access/services/memberships.ts`** – Implements the write invariants (create, update, revoke) on top of `membershipModel`; the unique index here is what makes those invariants enforceable at the DB level.
- **`src/modules/access/index.ts`** – Module barrel; re-exports the models and types defined here so consumers import from the module root.
- **`src/modules/access/tests/factories.ts`** – Builds seeded Tenant/Membership documents using the same interfaces for unit and integration tests.
- **`tests/integration/scenarios/demo-restore.test.ts`** – Integration scenario that exercises restore/seed logic against these collections.

## Notes

- **Single-tenant by design.** The file deliberately models exactly one `Tenant` row per deployment; multi-client support is a deployment concern (second stack, second DB), not a schema concern.
- **`tenantId: null` = platform membership.** The same `null` the caller carries in the auth context when acting in the platform scope.
- **Roles are data, permissions are code.** The `role` string here is an opaque reference into `shared/authorization-roles.yaml`; this file never stores *what* a role permits. Drift between a DB row and the YAML file would be a bug, so permissions live only in YAML.
- **Routeless on purpose.** The kernel files (`permissions.ts`, `ability.ts`, `access/query.ts`) that *ask* questions stay in the kernel; this module only *answers* them with data. Do not add route-level logic here.
