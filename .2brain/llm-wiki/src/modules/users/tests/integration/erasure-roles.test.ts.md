---
source: src/modules/users/tests/integration/erasure-roles.test.ts
sha256: 8de07ba4650b7b02f32b37a9fdb1f2850246c37fcfceb0e0ac2ba64dd3bd6079
generated_at: 2026-10-29T06:20:17.141535+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/erasure-roles.test.ts

## Purpose

Integration test proving that a hard-delete removes a user's roles atomically via the `access` module's erase hook, and that the account (with its roles) survives if a *later* erasure hook throws. Drives the real HTTP endpoint so the module registry builds erase hooks the same way a deployment does.

## Key elements

- **`bootErasers`** — snapshot of the personal-data erasers registered at boot; used to restore state between tests.
- **`failingEraser: PersonalDataEraser`** — a deliberately-throwing eraser that simulates a module registered *after* `access` failing mid-erasure.
- **`afterEach`** — restores `bootErasers` via `setPersonalDataErasers` so tests don't leak mutations.
- **`describe('hard-deleting an account')`** — two cases:
  - *removes the role it holds, with the account* — asserts 204, empty memberships, and null user row.
  - *keeps its roles when a later step of the erasure fails* — injects `failingEraser`, asserts ≥500, non-null user row, and one membership remaining.

## Relationships

- **`tests/support/http.ts`** — `api()` and `authenticateAs()` issue real HTTP requests to the running app.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions the test database before the suite.
- **`src/modules/users/tests/factories.ts`** — `createUser()` creates a user with the `support` role; `userRepository` is used for post-condition assertions.
- **`src/modules/users/erasure-registry.ts`** — `personalDataErasers()` reads the current hook list; `setPersonalDataErasers()` swaps it (test teardown and the failure-injection case).
- **`src/kernel/registry.ts`** — source of the `PersonalDataEraser` type used to type `failingEraser`.
- **`src/modules/access/index.ts`** / **`src/modules/access/services/index.ts`** — `accessService.membershipsOf()` verifies whether the role binding survived.
- **`src/modules/users/repository.ts`** — `userRepository.findById()` confirms account row existence.

## Notes

- Tests deliberately run over HTTP (not by calling service methods) so the kernel's registry assembles the full erase-hook chain exactly as in production.
- The `failingEraser` is appended *after* the real hooks, ensuring `access`'s hook runs first and the transaction rolls back — the invariant under test.
- Mutating global state (`setPersonalDataErasers`) is the only mechanism to inject the failure; the `afterEach` guard is mandatory to avoid cross-test contamination.
