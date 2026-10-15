---
source: src/modules/users/tests/integration/erasure-roles.test.ts
sha256: 89534e230eb4135823df5ad00515ddaca1d53dd3784dbafd1d8a0c9ee973abe0
generated_at: 2026-10-15T12:13:15.793246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/erasure-roles.test.ts

## Purpose
Integration test that proves a hard delete of a user removes their roles in the same transaction via `access`'s erase hook, and that a failure in a *later* eraser rolls everything back so roles survive. Driven over HTTP so the real module registry builds the erase-hook chain, matching production boot.

## Key elements
- **`bootErasers`** — snapshot of the erasers registered at boot; restored in `afterEach` to prevent cross-test leakage.
- **`failingEraser`** — a `PersonalDataEraser` that always rejects, standing in for a later module's hook that would fail after `access` has already run.
- **`describe('hard-deleting an account')`** — two cases:
  - *removes the role it holds, with the account* — asserts 200, empty `membershipsOf`, and null user row.
  - *keeps its roles when a later step of the erasure fails and the account stays* — injects `failingEraser`, asserts ≥500, user row still present, memberships intact (length 1).

## Relationships
- **`tests/support/http.ts`** — `api` and `authenticateAs` provide the HTTP client and admin bearer token used to hit the real endpoint.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to prepare a clean database for the file.
- **`src/modules/users/tests/factories.ts`** — `createUser` provisions the target account (with a `customer` role); `userRepository.findById` is used to assert the account's presence or absence.
- **`src/modules/users/erasure-registry.ts`** — `personalDataErasers()` reads the registered eraser list; `setPersonalDataErasers` swaps it to inject the failing hook.
- **`src/modules/access/index.ts`** — `membershipsOf` queries the resulting role assignments to verify cleanup or rollback.
- **`src/kernel/registry.ts`** — supplies the `PersonalDataEraser` type that `failingEraser` is annotated against.

## Notes
- `failingEraser` is **appended after** `bootErasers`, so `access`'s hook executes first (succeeds) and only then does the fake hook throw. This is the exact ordering that makes the transaction rollback observable.
- `setupTestDb()` runs once at import time (module scope), not per-test; the `afterEach` only restores the eraser list.
- The test deliberately avoids calling the service layer directly; the HTTP path is the contract under test.
