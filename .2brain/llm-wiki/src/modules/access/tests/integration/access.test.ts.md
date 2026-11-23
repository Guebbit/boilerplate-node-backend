---
source: src/modules/access/tests/integration/access.test.ts
source_sha256: 3917e0ffc12a22cdf7f455fd17d25f9b426770a88f2d0a5673f68e968df66aef
context_sha256: 89bb661353d787a386b401e5903803ae5d95d551b4e5cb0b7039546dc69188c4
generated_at: 2026-11-22T03:18:35.601662+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/tests/integration/access.test.ts

## Purpose
Integration tests for the access module's membership storage. They run against the in-memory Mongo that `setupTestDb` provides and exercise the module's own writers (`src/modules/access/services/` and `src/modules/access/repository.ts`) and the invariants those writers enforce. The file complements the conformance suite, which checks that the two authorization backends decide alike. This file checks that the data those decisions are read from can be written, edited and refused correctly.

## Key elements
- **Setup**
  - `setupTestDb()` provisions the test database.
  - `jest.mock` replaces `@infrastructure/observability/audit` with `auditPortMock()` from `@tests/ports`.
  - `afterEach(jest.restoreAllMocks)` undoes spies after every test.
- **`describe('the preset roles')`**: checks that `permissionsOfRole('support')` returns an array straight from the shared YAML, with no database involved.
- **`describe('membership across tenants')`**
  - One person can hold different roles in two tenants.
  - Reassigning a role in the same place replaces the existing row.
  - The `tenant` and `platform` scopes are kept separate.
- **`describe('the invariants')`**
  - `assignRole` rejects an undeclared role with `AccessInvariantError`.
  - `assignRole` rejects a granter who lacks `assign:Role`, with a "privilege-escalation" error. An empty granter key set is also rejected.
  - A granter holding `assign:Role` can assign a tenant role.
  - `revokeRole` can remove the last admin of a shop.
  - `revokeRole` by a moderator or an anonymous caller throws `AccessInvariantError`. The moderator case is also audited as a role-revoked event with outcome `failure`.
  - A rejecting repository `deleteById` propagates to the caller instead of being swallowed.
- **`describe('bootstrapAccess')`**
  - It creates the deployment tenant (`DEPLOYMENT_TENANT_SLUG`) and grants no memberships.
  - It is idempotent: the id and name from the first insert are kept.
- **`describe('a role lives in exactly one place, the membership row')`**
  - An account with no membership resolves to `null` for both `tenant` and `platform` roles in `rolesOf`.
  - `assignRole` refuses the computed audiences `customer`, `unverified` and `guest`, via `it.each`.
  - The rest of this block is not shown here.

## Relationships
- **`src/modules/access/services/index.ts`**: supplies `accessService`, `AccessInvariantError`, `assertCanGrant` and `DEPLOYMENT_TENANT_SLUG`.
- **`src/modules/access/repository.ts`**: its `membershipRepository` is imported, and its `deleteById` is spied on to simulate a database failure.
- **`src/modules/access/services/grants.ts`**: a graph neighbor of this file, part of the services the tests exercise.
- **`src/modules/access/tests/factories.ts`**: `seedMembership` inserts memberships directly.
- **`src/kernel/permissions.ts`**: `permissionsOfRole` supplies granter key sets and the preset lookup.
- **`src/kernel/access/tenant.ts`**: `DEPLOYMENT_TENANT_ID` is imported.
- **`src/modules/access/audit.ts`**: `accessAuditActions` is imported, and its role-revoked action is the one asserted on.
- **`src/infrastructure/observability/audit.ts`**: mocked, and `emitAuditEvent` is observed.
- **`tests/support/ports.ts`**: `auditPortMock` and `observePort`.
- **`tests/support/callers.ts`**: `testCallerContext` (anonymous) and `callerContextAs(role)`.
- **`tests/support/setup-test-db.ts`**: provides the in-memory Mongo.
- **`src/infrastructure/runtime/database.ts`**: `withTransaction` is imported.

## Notes
- Role permissions come only from `shared/rules/authorization-roles.yaml`, so there are no role rows to seed or edit. This file covers membership storage only.
- Seeding the full demo model, and the invariant that a role lives only in this collection, belong to the system-level companion `tests/integration/access.test.ts`. The YAML itself is exercised in `tests/cross-cutting/authorization-conformance.test.ts`.
- The audit port is replaced with `jest.mock` rather than spied on; the reason is documented in `tests/support/ports.ts`.
- The test that revokes the last admin documents that a shop can currently be left with no administrators.
- `assertCanGrant`, `DEPLOYMENT_TENANT_ID` and `withTransaction` are imported, but their use is not visible in the portion of the file shown.
