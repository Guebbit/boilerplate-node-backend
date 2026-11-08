---
source: tests/integration/access.test.ts
sha256: 127aa8766115f2d7d81369248506f2ed4fed39912840ab5e9e8c9b4635ed36e2
generated_at: 2026-11-08T09:34:51.158395+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/access.test.ts

## Purpose

Integration test that verifies the seeded demo access model and enforces the cross-module invariant: a role exists **only** in the membership row and is never mirrored onto the user document. It sits outside the access module's own test suite (which covers `assignRole`, `revokeRole`, and audit internals) to pin down the boundary between `@modules/access` and `@modules/users`.

## Key elements

- **`seedUsers()`** — helper that calls `shopModules.users.seed()` to create the user rows needed by the cross-module invariant test.
- **`describe('the seeded model')`** — four test cases:
  - Root account holds two memberships (`platform/operator` + `tenant/admin`); other demo staff hold exactly one tenant role each; the customer holds none.
  - Manager, warehouse, and support each get their single shop role; the pure platform operator gets no tenant role at all.
  - `seedAccessModel()` is idempotent (running it twice still yields two memberships for admin).
  - The user document returned by `userRepository.findById` carries **no** `role` field — the membership row is the sole source of truth.

## Relationships

- **`scenarios/accounts.ts`** — supplies the `SEED_*_ID` constants and the `seedAccessModel()` function that this file exercises.
- **`scenarios/index.ts`** — provides `shopModules`, whose `users.seed()` populates the user rows for the invariant test.
- **`src/modules/access/index.ts`** — exports `accessService`, the API under test (`membershipsOf`, `membershipIn`).
- **`src/kernel/access/tenant.ts`** — exports `DEPLOYMENT_TENANT_ID`, the tenant scope used in every lookup.
- **`src/modules/users/tests/factories.ts`** — provides `userRepository` (a test factory wrapping the real repository) used to read the raw user document.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to prepare the in-test database.
- **`tests/support/stub.ts`** — `asStub<T>()` narrows the user document so the test can assert `role` is `undefined` without a full type assertion.

## Notes

- The file's doc-comment explicitly states it is **not** where the access module's own writer tests live; those are in `src/modules/access/tests/integration/access.test.ts`. This file exists only for the cross-module rule and the demo seed that spans both modules.
- The invariant test is the one that requires `seedUsers()` before `seedAccessModel()`; the other three tests seed access only.
- `asStub` is used specifically to check for the *absence* of a field on the user document, not to fake a value.
