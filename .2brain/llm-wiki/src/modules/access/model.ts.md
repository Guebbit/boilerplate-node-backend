---
source: src/modules/access/model.ts
source_sha256: 7702c8f10cb30dcbac4418f4ea46af5c58ab9aa482f89259eeeaeaad9380a6dc
context_sha256: 6d6f0f0cac8fb4d17bbf2cb69372bd3fd3f8284370b868403e98940b1532c7cb
generated_at: 2026-11-22T03:16:21.176838+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/model.ts

## Purpose
Defines the two Mongoose collections that store the authorization model: tenants (the shops) and memberships (who holds which role, where). It belongs to the `access` module, which has no routes of its own. The module owns the identity-and-access domain, and its write invariants live in `./services/`. Role definitions are not stored here. They live in `shared/rules/authorization-roles.yaml`, so this database holds only *who* has a role, never *what* a role grants.

## Key elements
- `TenantDocument`: interface with `slug`, `name` and optional timestamps. A deployment holds exactly one shop.
- `MembershipDocument`: interface with `userId`, `tenantId` (`string | null`), `role`, `scope` (`AuthorizationScope`) and optional timestamps. It represents one person holding one role in one place.
- `tenantSchema`: `slug` is required, unique, lowercased and trimmed. `name` is required and trimmed. Timestamps are enabled.
- `membershipSchema`:
  - `userId` is required.
  - `tenantId` defaults to `null`.
  - `role` is required, lowercased and trimmed.
  - `scope` is required and restricted by enum to `AUTHORIZATION_SCOPES`.
  - Timestamps are enabled.
- Membership indexes:
  - Unique on `{ userId, tenantId, scope }`, so there is one membership per person per place.
  - `{ userId }`, for the resolver's lookup on every authenticated request.
  - `{ tenantId, role }`, for finding who holds a role in a shop, such as a staff notice's audience.
- `TenantModel` and `MembershipModel`: type aliases for `Model<...>`.
- `tenantModel` (registered as `'Tenant'`) and `membershipModel` (registered as `'Membership'`): the exported models.

## Relationships
- Imports `AUTHORIZATION_SCOPES` and `AuthorizationScope` from `@types` (`src/types/index.ts`).
- The neighbors `src/modules/access/index.ts`, `src/modules/access/repository.ts`, `src/modules/access/services/memberships.ts`, `src/modules/access/tests/factories.ts` and `tests/integration/scenarios/demo-restore.test.ts` are linked in the dependency graph. The file's content doesn't show how each uses these models.
- The header says the data is consumed by the `account`, `api-keys` and `users` modules, plus `db` scripts and `scenarios`.
- The header says the route guard's permission, ability and query files stay in the kernel rather than in this module. They ask about this domain; they are not part of it.

## Notes
- Because `tenantId` is `null` for a platform membership, the unique index treats the pair `(userId, null, scope)` as a single slot.
- Role permissions are deliberately kept out of Mongo. The header gives the reason: a runtime-editable row would be a second definition that could drift from the YAML file the PHP twin reads.
- The single-tenant design is intentional. A second client gets its own stack and database. The `tenantId` columns remain in the schema.
