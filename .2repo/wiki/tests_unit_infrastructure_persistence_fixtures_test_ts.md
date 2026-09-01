# tests/unit/infrastructure/persistence/fixtures.test.ts

## Purpose

Unit tests for the four shared fixture helper functions (`toObjectId`, `compact`, `toDate`, `identityOf`) that every module's `fixtures.ts` composes from. The tests exist to pin down the "missing field" semantics of seeded records — each helper has a silent-failure mode (e.g. a hex string that never becomes a real `ObjectId` matching zero documents in a `$match`) that this suite is written to catch.

## Key elements

- **`describe('toObjectId')`** — verifies hex→`ObjectId` conversion, fresh-id generation when no input is given, and that a malformed string throws rather than silently minting a new id.
- **`describe('compact')`** — confirms `undefined` keys are stripped (so Mongoose `default:` applies), while `null`/`0`/`''`/`false` are preserved as deliberate values; also asserts non-mutation of the input object.
- **`describe('toDate')`** — ensures ISO strings (what seed files actually contain) parse to `Date`, a `Date` passes through unchanged, and `undefined` stays `undefined` (preventing `new Date(undefined)` → Invalid Date → persisted as `null`).
- **`describe('identityOf')`** — the largest block; validates that `_id`, `createdAt`, and `updatedAt` are all produced correctly from: an explicit id only, an explicit `createdAt` (ISO string or `Date`), an explicit `updatedAt`, or no overrides at all. Key assertions: `createdAt` defaults to the timestamp embedded in the `ObjectId`; `updatedAt` defaults to `createdAt` (not `new Date()`).

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — the module under test. All four functions are imported from here via the `@infrastructure/persistence/fixtures` alias.
- **`mongoose`** — `Types.ObjectId` is used in assertions to confirm `toObjectId` returns a genuine BSON id, not a plain string.

## Notes

- The file's leading docblock is the authoritative description of *why* each helper exists and what silent failure it prevents. The test names and inline comments mirror that rationale — reading the comments is as important as reading the assertions.
- `identityOf` derives `createdAt` from the ObjectId's embedded timestamp (`_id.getTimestamp()`). This is what gives a seeded catalogue a stable, meaningful sort order without seed files stating explicit dates.
- `updatedAt` intentionally defaults to `createdAt` rather than `new Date()`, so a seeded-but-never-edited record does not appear in "recently changed" views.
- The tests use a fixed hex constant (`65dc8a99604c307b702b5ccc`) for deterministic assertions; the "fresh id" test only checks inequality between two generated ids, not specific values.
