---
source: src/modules/users/tests/integration/erasure-roles.test.ts
sha256: 8de07ba4650b7b02f32b37a9fdb1f2850246c37fcfceb0e0ac2ba64dd3bd6079
generated_at: 2026-11-08T08:54:08.700749+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/erasure-roles.test.ts

## Purpose

Integration test verifying that a hard-delete of a user account atomically removes the account's roles via the `access` module's erase hook, and that if a *later* module's erasure hook fails the entire transaction rolls back (account and roles both survive). Requests are sent over real HTTP so the production module bootstrap path builds the eraser chain.

## Key elements

- **`bootErasers`** – snapshot of the erasers registered at module boot; used to restore the registry after each test.
- **`failingEraser: PersonalDataEraser`** – an always-rejecting eraser injected into the registry to simulate a later module's hook throwing.
- **`afterEach`** – calls `setPersonalDataErasers(bootErasers)` to restore the original chain.
- **`describe('hard-deleting an account')`** – two cases:
  - *removes the role it holds, with the account* – confirms 204, empty `accessService.membershipsOf`, and `null` from `userRepository.findById`.
  - *keeps its roles when a later step of the erasure fails* – injects `failingEraser`, expects ≥500, and asserts the account still exists with its single role intact.

## Relationships

- **`src/kernel/registry.ts`** – source of the `PersonalDataEraser` type used to type `failingEraser`.
- **`src/modules/access/index.ts`** – provides `accessService`, whose `membershipsOf` is the assertion target for role state.
- **`src/modules/access/services/index.ts`** – backing service layer behind `accessService`.
- **`src/modules/users/erasure-registry.ts`** – exports `personalDataErasers` (read) and `setPersonalDataErasers` (write) used to swap the eraser chain mid-test.
- **`src/modules/users/repository.ts`** – `userRepository.findById` is used to confirm account presence or absence.
- **`src/modules/users/tests/factories.ts`** – `createUser` factory builds the target user with a given role.
- **`tests/support/http.ts`** – `api` and `authenticateAs` drive the request cycle.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the in-test database before any test runs.

## Notes

- Tests are deliberately issued through the HTTP layer (not by calling service methods directly) so the real module registration path assembles the eraser hooks exactly as a deployment would.
- `setPersonalDataErasers` mutates global state; the `afterEach` restore is critical—skipping it would leak the failing eraser into subsequent tests.
- The atomicity guarantee under test is: `access`'s hook runs *before* any later module's hook, so a later failure rolls back `access`'s role removal in the same transaction.
