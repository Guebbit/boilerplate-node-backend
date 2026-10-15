---
source: tests/cross-cutting/role-hierarchy.test.ts
sha256: cac539463f14564f5596e542e5a2d96fddf4c9ba4ad4f0ce457d73d9cd6c037d
generated_at: 2026-10-15T12:40:43.605089+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/role-hierarchy.test.ts

## Purpose

Parameterized integration test that verifies the **rank rule** (role-hierarchy authorization) against every write route in the app. For each row in `HIERARCHY_ROWS` it drives a real HTTP request through the API as every tenant role that holds the route's key, checks the owner against every level (user / staff / admin), a platform-only operator, and the caller themself, asserting the expected 200/403 outcome. It also verifies that an API key acts at its minter's level. The row list is shared with `role-hierarchy-routes.test.ts` so the 31-route count cannot drift from what is mounted.

## Key elements

- **`RANK`** – maps `RoleLevel` → numeric rank (`user: 0, staff: 1, admin: 2`) used for the "below me" comparison.
- **`TENANT_ROLES`** – filtered from `PRESET_ROLES` to only `scope === 'tenant'` roles; the universe of callers.
- **`OWNER_ROLE`** – picks one representative role name per level (first listed in YAML) to own the target resource.
- **`holdersOf(key)`** – returns all tenant role names whose permission list includes `key`; each becomes a caller in the sweep.
- **`outcomeOf(response)`** – reduces a response to `'passed'`, `'OUTRANKED'`, or `'refused:<code>'` for assertion.
- **`send(bearer, request)`** – executes one prepared `HierarchyRequest` via supertest, handling JSON body, file upload, and a random idempotency key.
- **`expectedFor(callerLevel, ownerLevel)`** – returns the expected outcome string for a given level pair.
- **`runRow(row, callerRole)`** – authenticates the caller, creates owners at each level + platform + self, fires the prepared request against each, and asserts the full outcome matrix.
- **`describe('the rank rule, row by row')`** – iterates `HIERARCHY_ROWS`, asserts row count = 31, then for each row runs the per-holder sweep and (unless `keyed === false`) a "customer lacks the key → 403 FORBIDDEN" check.
- **`describe('an API key acts at its minter's level')`** – mints a credential holding `users.any.update`, PATCHes a user-level owner (passes) and an admin-level owner (OUTRANKED).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/permissions.ts` | Source of `PRESET_ROLES`; the test filters it to tenant roles and inspects each role's `permissions` array to find key holders. |
| `src/types/index.ts` | Exports the `RoleLevel` union type consumed by `RANK`, `OWNER_ROLE`, and `expectedFor`. |
| `src/types/auth-context.ts` | Provides the `RoleLevel` type definition (re-exported through `src/types/index.ts`). |
| `tests/support/http.ts` | Supplies `api()` (supertest instance) and `authenticateAsRole()` (session bootstrap for a given role name). |
| `tests/support/role-hierarchy-rows.ts` | Provides `HIERARCHY_ROWS` (the 31-row table), `createOwner()`, and the `HierarchyRow` / `HierarchyRequest` / `Owner` types. |
| `tests/support/credentials.ts` | `credentialHolding()` mints an API key with the specified permission for the API-key sub-suite. |
| `tests/support/file-sandbox.ts` | `emptyFileSandbox` is called in `afterEach` to clear any file written by upload-carrying rows. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module top to provision a fresh in-memory DB before any row runs. |

## Notes

- The 31-row count is asserted here, but the **names** are pinned by the sibling file `tests/cross-cutting/role-hierarchy-routes.test.ts`; changing the mounted route table without updating both will fail one or the other.
- `holdersOf` relies on `PRESET_ROLES[].permissions` containing the raw key string. If a role's YAML `level:` is changed, the caller set shifts automatically — no edit in this file is needed.
- The `keyed !== false` guard on the "customer is refused by the key" test means some rows (e.g. unkeyed routes) intentionally skip that assertion.
- The self-referencing case expects `refused:FORBIDDEN` only when the row's `selfRefused` flag is true (money-step routes); otherwise it expects `'passed'`.
- File-upload rows use `supertest.attach`, which switches the Content-Type to `multipart/form-data`; the `emptyFileSandbox` afterEach is what cleans up the written file.
