---
source: tests/integration/access.test.ts
sha256: 127aa8766115f2d7d81369248506f2ed4fed39912840ab5e9e8c9b4635ed36e2
generated_at: 2026-10-29T06:51:50.438143+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/access.test.ts

## Purpose

Verifies the cross-module authorization invariant that a role is stored **only** in the membership row and never mirrored onto the user document. It also asserts the demo seed's concrete role assignments (dual-job root, single-role staff, roleless operator) and that re-seeding is idempotent. Module-scoped writers (`assignRole`, `revokeRole`, audit trail) are intentionally **not** tested here; they live in `src/modules/access/tests/integration/access.test.ts`.

## Key elements

- **`seedUsers()`** – local helper that calls `shopModules.users.seed()` to populate user rows where a test needs them.
- **`describe('the seeded model')`** – four integration tests:
  1. *Root dual-role placement* – confirms `SEED_ADMIN_ID` holds `platform/operator` **and** `tenant/admin`; confirms customer has no role, editor/moderator hold exactly one tenant role each.
  2. *Staff role assignments* – confirms manager/warehouse/support each map to their named shop role; confirms `SEED_OPERATOR_ID` holds only `platform/operator` (no tenant scope).
  3. *Idempotency* – calls `seedAccessModel()` twice, asserts membership count is still 2.
  4. *Single-source-of-truth* – seeds users **and** access, then asserts the membership carries `role: 'admin'` while the user document's `role` field is `undefined`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/accounts.ts` | Source of all `SEED_*` id constants and the `seedAccessModel()` function under test. |
| `scenarios/index.ts` | Provides `shopModules` whose `.users.seed()` populates user rows for test 4. |
| `src/kernel/access/tenant.ts` | Supplies `DEPLOYMENT_TENANT_ID`, the tenant key used in every `membershipIn` call. |
| `src/modules/access/index.ts` | Exports `accessService` — the system under test (`membershipsOf`, `membershipIn`). |
| `src/modules/users/repository.ts` | The user repository whose `findById` is called in test 4 to prove the document has no `role`. |
| `src/modules/users/tests/factories.ts` | Provides the `userRepository` instance used in that assertion. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module top-level to prepare a clean test database. |
| `tests/support/stub.ts` | `asStub` is used in test 4 to safely type-cast the user document and read its optional `role` field. |

## Notes

- This file is deliberately **not** the access module's integration suite; it exists solely because the "role lives in one place" rule spans two modules and cannot be asserted from either module's own test file.
- Test 4 is the load-bearing assertion: it seeds users *before* the access model so that `seedAccessModel` cannot accidentally overwrite a `role` field on the user doc.
- The `asStub` cast is a test-side escape hatch to read a field the production type does not declare (by design); it does not imply the field exists at runtime.
