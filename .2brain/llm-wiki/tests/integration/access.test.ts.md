---
source: tests/integration/access.test.ts
sha256: 2c2acdaafd01cf76ec5df6b163cb0ed93b00c26a35e935c0418c781392c56ed7
generated_at: 2026-09-23T20:02:08.877660+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/access.test.ts

## Purpose

Validates the cross-module authorization invariant of the demo seed: a role is stored **only** in the membership row (owned by the access module) and is never mirrored onto the user document (owned by the users module). This file exists because the invariant spans two modules, so it cannot be tested from within either module's own test suite.

## Key elements

- **`seedUsers()`** — local helper; calls `shopModules.users.seed()` to populate user rows before the single-source-of-truth test.
- **`describe('the seeded model')`** — three test cases:
  - *root has both jobs* — asserts `SEED_ADMIN_ID` holds exactly two memberships (`platform/operator` + `tenant/admin`) and that customer/editor/moderator each hold one tenant role.
  - *idempotent re-seed* — calls `seedAccessModel()` twice, asserts no duplicate membership rows appear.
  - *role lives in membership only* — asserts `membershipIn(...).role` is `'admin'` **and** that `userRepository.findById(SEED_ADMIN_ID)` returns a document whose `role` field is `undefined`.

## Relationships

- **`scenarios/accounts.ts`** — source of `seedAccessModel` and the `SEED_*_ID` constants used throughout.
- **`scenarios/index.ts`** — provides `shopModules`, whose `users.seed()` populates the user table.
- **`src/modules/access/index.ts`** — re-exports `membershipIn` and `membershipsOf`, the read API this file asserts against.
- **`src/kernel/access/tenant.ts`** — provides `DEPLOYMENT_TENANT_ID`, the scope constant used in every lookup.
- **`src/modules/users/tests/factories.ts`** — provides `userRepository`, used to read back the user document and verify the absence of a role field.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to provision a clean database before any test runs.
- **`tests/support/stub.ts`** — `asStub<T>()` is a type-cast helper; used here to read `role` off the user document without a dedicated type.

## Notes

- This file is explicitly the **leftover** after module-scoped access tests (writer paths, audit trail) were relocated to `src/modules/access/tests/integration/access.test.ts`. Do not add single-module assertions here.
- `setupTestDb()` runs at **import time**, not inside `beforeAll`; the DB is ready before any `it` block executes.
- The third test deliberately seeds users *before* the access model to ensure the invariant holds even when both stores already contain data — it is checking absence, not just presence.
- `asStub<{ role?: unknown }>(published).role` is a deliberate type-escape: the users module's public type does not declare `role`, so the cast documents that the field is expected to be **absent** rather than `null`.
