---
source: tests/unit/infrastructure/persistence/mongo-errors.test.ts
sha256: bdea8faa88b25e7a8d221066669c2e460ecc8f368761863adf6367d33d90aee0
generated_at: 2026-09-23T20:25:45.238363+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/mongo-errors.test.ts

## Purpose

Unit tests for the two predicate helpers (`isDuplicateKey`, `isBadObjectId`) exported from `src/infrastructure/persistence/mongo-errors.ts`. They pin down the exact discrimination logic (numeric `code` property, `instanceof` check) so that callers can safely narrow a widened `unknown` catch without accidentally matching messages or duck-typed shapes.

## Key elements

- **`makeDuplicateKeyError()`** – local helper that builds a realistic driver error: an `Error` with `code: 11000` and the typical `E11000` message.
- **`describe('isDuplicateKey')`** – four cases:
    - recognises a real code-11000 error.
    - rejects an error whose _message_ says "E11000" but has no `code` property (guards against message-string matching).
    - returns `false` for unrelated errors and `undefined`.
    - rejects a near-miss code (`11001`).
- **`describe('isBadObjectId')`** – four cases:
    - accepts a real `mongoose.Error.CastError` on an `ObjectId` path.
    - rejects a `CastError` on a non-ObjectId path (e.g. `Number` on `quantity`).
    - returns `false` for unrelated errors and `undefined`.
    - rejects a plain object that merely has `name: 'CastError'` and `kind: 'ObjectId'` — confirms the implementation uses `instanceof`, not duck-typing.

## Relationships

- **`src/infrastructure/persistence/mongo-errors.ts`** – the system under test. This file imports `isDuplicateKey` and `isBadObjectId` and exercises their public contracts; it has no other dependency-graph neighbors.
- **`mongoose`** – imported solely to construct `mongoose.Error.CastError` instances for the `isBadObjectId` tests.

## Notes

- The tests intentionally distinguish _structural_ checks (`.code === 11000`, `instanceof CastError`) from superficial ones (message text, property presence). If you refactor `mongo-errors.ts` to, say, match on a message regex or a `.name` field, these tests will fail by design.
- Both predicates must be total functions safe on `undefined` — every `describe` block includes an explicit `undefined` assertion.
- The `instanceof` requirement for `isBadObjectId` is called out in the inline comment as the motivating reason the helper exists: a hand-built rejection in a `catch (e: unknown)` block must _not_ slip through as a bad-OID error.
