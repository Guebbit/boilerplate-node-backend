# src/modules/users/tests/unit/token-methods.test.ts

## Purpose

Unit tests for the two instance methods on `userSchema` that create or destroy session tokens (`tokenAdd`, `tokenRemoveAll`). They exist in isolation because both methods operate on a `select: false` field, meaning the in-memory `tokens` array is usually `undefined`; the tests verify the database-first write order, the optional-chain guard, and the `{ timestamps: false }` write option without a real database.

## Key elements

- **`methods`** — extracted from `userSchema.methods` via `asStub`, typed as `{ tokenAdd, tokenRemoveAll }`. This is the SUT; tests call `.call(document, …)` on it.
- **`documentDouble(tokens?)`** — factory returning a minimal Mongoose-like document: `_id`, optional `tokens` array (or `undefined`), and a jest-mocked `constructor.updateOne`. Passing `undefined` simulates the ordinary `select: false` state.
- **`describe('tokenAdd')`** — nine cases covering: `$push` payload, return value, expiry calculation (positive, zero, negative window), `timestamps: false`, mirroring into a loaded array, no-throw when array is `undefined`, and correct `TokenType` filing.
- **`describe('tokenRemoveAll')`** — four cases covering: `$pull` by type, type isolation (other tokens survive), `timestamps: false`, and no-throw when array is `undefined`.
- **Trailing comment block** — documents that `tokenRemoveExpired` was promoted to `userRepository.tokenRemoveExpired` (now a repository static that rejects on failure) and whose tests live in `users/tests/integration/repository.test.ts` and `account/tests/unit/token-cleanup-job.test.ts`.

## Relationships

- **`src/modules/users/model.ts`** — imports `userSchema` (source of the methods under test) and the `Token` type used throughout the assertions.
- **`src/modules/users/index.ts`** — imports `TokenType` enum, which is the discriminator for `$push` / `$pull` and the subject of the type-isolation tests.
- **`tests/support/stub.ts`** — imports `asStub`, a helper that re-exposes schema methods with an explicit generic type parameter so the test file can call them as plain functions.

## Notes

- The central invariant under test is **write-to-DB first, update-memory second**. The `tokens: undefined` cases guard against a throw *after* the write has already revoked/added the token — which would surface to the caller as a false failure.
- `timestamps: false` is asserted explicitly on every `updateOne` call in both methods. This is a schema-level `{ timestamps: false }` option, not a Mongoose global; without it every login/logout would bump `updatedAt`.
- The `documentDouble` does not mock Mongoose internals beyond `constructor.updateOne`; it intentionally has no `save`, `markModified`, or virtual machinery.
- `tokenRemoveExpired` is **not** tested here. If you are looking for sweep tests, they are in the integration repository tests and the account cleanup-job tests noted in the trailing comment.
