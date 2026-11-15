---
source: src/modules/users/tests/integration/repository.test.ts
sha256: bf425e159b2ebd9ee43bfb97a0296159299b7f936ff86bc8f737fe36f3fa3695
generated_at: 2026-11-14T22:37:40.020104+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/repository.test.ts

## Purpose

Integration test suite for `userRepository`, executed against an in-memory MongoDB instance. It validates the full CRUD surface (`create`, `findById`, `findOne`, `findAll`, `save`, `deleteOne`, `updateMany`, `count`) plus the module-specific `search` and `writebackImage` methods, confirming correct filtering, pagination, soft-delete semantics, and lean-object return types.

## Key elements

- **`setupTestDb()`** — called at module scope (top-level, outside any `describe`/`it`) to start and configure the in-memory Mongo before any test runs.
- **`liveAndDeleted()`** — local helper that seeds one active user (`live@example.com`) and one soft-deleted user (`gone@example.com`, with `deletedAt` set) for the `search` tests.
- **`describe('userRepository')`** — the root suite; each nested `describe` block maps to one repository method.
- **`it.each` in `search`** — parameterized cases covering `deleted: true`, `deleted: false`, and omitted (returns both).
- **`writebackImage` block** — uses `Users.updateOne` (direct model access) to plant a `pendingImageKey`, then asserts the repository method resolves `true` (match), `true` (duplicate), or `false` (stale key).
- **`asStub`** — imported from the test-support layer solely to cast a lean object so the spec can assert the absence of a `save` method.

## Relationships

- **`src/modules/users/repository.ts`** — the system under test; every assertion targets `userRepository` methods.
- **`src/modules/users/model.ts`** — imported directly as `userModel` (aliased `Users`) to set `pendingImageKey` behind the repository in `writebackImage` tests, and to understand the Mongoose document shape.
- **`src/modules/users/tests/factories.ts`** — provides `makeUser` (factory for a user spec object), `createUser` (persists one into the test DB), and `PLAIN_PASSWORD` (to assert the pre-save hook replaced it).
- **`tests/support/setup-test-db.ts`** — wires up the in-memory MongoDB that all tests in this file run against.
- **`tests/support/stub.ts`** — exports `asStub`, used for a single type-level cast in the lean-object assertion.

## Notes

- `setupTestDb()` runs at **module load time** (top-level call), not inside any Jest lifecycle hook. This means the DB is created once for the whole file and shared across all `it` blocks; each test is expected to operate on the collection state left by prior tests (e.g., `count` tests run after `createUser` calls in other suites).
- The direct import of `userModel` from `model.ts` (bypassing the barrel) is intentional and explicitly sanctioned by `eslint-plugin-boundaries` for a spec reaching into its own module's internals.
- `findAll` is contractually a **lean** query (plain JS objects). The test pins this by asserting the returned object has no `save` method — a regression to Mongoose Documents would break callers that spread or serialize the result.
- `writebackImage` tests deliberately set `pendingImageKey` via the model layer rather than the repository, isolating the repository's key-matching logic from any write-path it might own.
