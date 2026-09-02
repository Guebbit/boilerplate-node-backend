# tests/unit/infrastructure/persistence/fixtures.test.ts

## Purpose

Unit tests for the four shared fixture helpers (`toObjectId`, `stripUndefined`, `toDate`, `identityOf`) that every module's `fixtures.ts` composes. The tests exist to pin down the contract for what happens when a seeded record omits a field—specifically the silent-failure modes (string leaking into a `$match`, `undefined` suppressing Mongoose defaults, `Invalid Date` persisting as `null`) and the non-obvious derivation rules (timestamps pulled from the ObjectId's embedded time, `updatedAt` defaulting to `createdAt`).

## Key elements

- **`describe('toObjectId')`** — verifies hex→`Types.ObjectId` conversion, fresh-id generation when called with no argument, and that malformed input throws rather than silently minting an unrelated id.
- **`describe('stripUndefined')`** — confirms only `undefined` values are dropped; `null`, `0`, `''`, `false` are preserved. Also asserts the input object is not mutated.
- **`describe('toDate')`** — checks ISO-string parsing, `Date` passthrough, and that `undefined` stays `undefined` (so `stripUndefined` can remove the key instead of producing an `Invalid Date`).
- **`describe('identityOf')`** — the largest block. Validates:
  - `_id` from an explicit id or a freshly generated one.
  - `createdAt` derived from the id's embedded timestamp when not supplied.
  - Explicit `createdAt` overriding the derived value.
  - `updatedAt` defaulting to `createdAt` (not `new Date()`) so an untouched record reads as untouched.
  - Full-identity output (`_id`, `createdAt`, `updatedAt` all present) from an empty input object.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — sole import target. The test file exercises every public export of that module (`toObjectId`, `stripUndefined`, `toDate`, `identityOf`) and asserts their edge-case behavior. No other files are imported.

## Notes

- The `HEX` constant (`65dc8a99604c307b702b5ccc`) is a real 24-char hex string; its embedded timestamp is what `identityOf` extracts for `createdAt`, so tests around `identityOf` implicitly depend on that fixed value.
- The file deliberately tests *negative* silent-failure paths (malformed id, `undefined` timestamp) rather than only the happy path, because those are the failure modes that produce "record not found" or "all records share the same timestamp" bugs far from the seed.
- `stripUndefined` is tested for immutability (`Object.keys(source)` unchanged) even though the implementation likely uses destructuring or `Object.fromEntries`; this guards against a future refactor that mutates in place.
