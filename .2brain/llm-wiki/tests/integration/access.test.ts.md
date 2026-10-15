---
source: tests/integration/access.test.ts
sha256: 776468016e2b5da5952c02905f8b9cccc2743dd2cc621a1b267708b37ad7bfab
generated_at: 2026-10-15T12:43:03.862396+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/access.test.ts

## Purpose

Integration test for the cross-module authorization invariant: a role is stored **only** in the membership row (access module) and never mirrored onto the user document (users module). It verifies the demo seed (`seedAccessModel`) places the right roles in the right scopes and that re-seeding is idempotent. It lives at the repo-level integration path rather than inside the access module because it asserts a rule that spans two modules and depends on the demo scenario seeding both.

## Key elements

- **`seedUsers()`** – one-liner that calls `shopModules.users.seed()` to create user rows (needed only by the final test case).
- **`describe('the seeded model')`** – four test cases:
  - *root has two jobs* – asserts `SEED_ADMIN_ID` holds both `platform/operator` and `tenant/admin`; asserts `SEED_USER_ID`, `SEED_EDITOR_ID`, `SEED_MODERATOR_ID` each hold exactly one tenant role.
  - *staff roles + operator isolation* – asserts manager/warehouse/support each get their one tenant role; asserts `SEED_OPERATOR_ID` holds **only** `platform/operator` with no tenant membership.
  - *idempotency* – calls `seedAccessModel()` twice and confirms membership count is unchanged.
  - *single source of truth* – after seeding both users and access, asserts the membership row carries the role while `userRepository.findById` returns a user document with **no** `role` field (checked via `asStub`).

## Relationships

- **`scenarios/accounts.ts`** – source of all `SEED_*` ID constants and the `seedAccessModel` function under test.
- **`scenarios/index.ts`** – provides `shopModules` whose `.users.seed()` creates the user rows for the last case.
- **`src/modules/access/index.ts`** – exports `membershipIn` and `membershipsOf`, the read-only query API used to assert seeded state.
- **`src/modules/access/service.ts`** – implementation behind those query functions (and the writers `assignRole`/`revokeRole` that this file deliberately does **not** test).
- **`src/kernel/access/tenant.ts`** – supplies `DEPLOYMENT_TENANT_ID` for scope-qualified lookups.
- **`src/modules/users/repository.ts`** – the `findById` call in the final case proves the user document carries no role.
- **`src/modules/users/tests/factories.ts`** – provides the `userRepository` instance used in that same final case.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` runs once at module load to prepare a clean database.
- **`tests/support/stub.ts`** – `asStub` is used to safely read a possibly-absent field (`role`) on the user document and assert it is `undefined`.

## Notes

- The header comment explicitly directs module-scoped writer tests (`assignRole`, `revokeRole`, audit trail) to `src/modules/access/tests/integration/access.test.ts`. This file is the residue: the cross-module rule plus the demo seed that exercises it.
- The final test asserts **absence** of a field, not merely a specific value. `asStub` is used so the assertion is "the key does not exist (or is undefined)" rather than a truthy/falsy check.
- Scope values (`'platform'` vs `'tenant'`) are string literals matched exactly; they are not imported constants beyond `DEPLOYMENT_TENANT_ID` for the tenant scope.
