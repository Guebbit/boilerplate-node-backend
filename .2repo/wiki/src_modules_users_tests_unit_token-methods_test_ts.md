# src/modules/users/tests/unit/token-methods.test.ts

## Purpose

Unit tests for the `tokenAdd` and `tokenRemoveAll` instance methods on the user schema. They verify the critical ordering guarantee: the database write (`updateOne`) happens first, and the in-memory `tokens` array is updated only if it was loaded. This protects against a scenario where a failed in-memory push throws *after* tokens have already been revoked in the database.

## Key elements

- **`documentDouble(tokens?: Token[])`** — Builds a fake Mongoose document with a mocked `updateOne` (and a `constructor.updateOne` alias). The `tokens` parameter is intentionally optional: `undefined` simulates the ordinary `select: false` case; an array simulates a loaded list.
- **`methods`** — A typed stub of `userSchema.methods` (`tokenAdd`, `tokenRemoveAll`) obtained via `asStub`, called with `.call(document, …)` to simulate instance context.
- **`describe('tokenAdd')`** — Verifies: hashing at rest, returning the plaintext token, expiry computation, zero/negative-window → no expiry, `timestamps: false`, mirroring into a loaded array, safety when array is `undefined`, and correct `type` filed.
- **`describe('tokenRemoveAll')`** — Verifies: `$pull` by type only, other types untouched, `timestamps: false`, and safe no-op in-memory path when array is `undefined`.

## Relationships

- **`src/modules/users/model.ts`** — Source of `userSchema` (whose `.methods` are stubbed) and the `Token` type used in assertions.
- **`src/modules/users/index.ts`** — Re-exports `TokenType` and `hashToken`, both consumed directly in test expectations.
- **`tests/support/stub.ts`** — Provides `asStub`, the utility that extracts the method functions off the schema for isolated calling.

## Notes

- The `tokens` parameter of `documentDouble` is the whole point of most tests: `undefined` vs `[]` is not interchangeable. Tests explicitly cover both to lock in the "optional-chain guard" behavior.
- A `timestamps: false` option is passed as the third argument to `updateOne` in both methods; the tests assert this explicitly to prevent Mongoose from mutating `updatedAt` on a purely session-level operation.
- `tokenRemoveExpired` is deliberately **not** tested here. A trailing comment explains it was moved to `userRepository` because it resolves an HTTP status code, which belongs at the repository layer. Its tests live in `repository.test.ts` and `account/tests/unit/token-cleanup-job.test.ts`.
