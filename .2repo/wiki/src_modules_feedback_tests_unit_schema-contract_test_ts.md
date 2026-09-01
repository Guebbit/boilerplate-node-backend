# src/modules/feedback/tests/unit/schema-contract.test.ts

## Purpose
Contract test for `feedbackRequestSchema`. Because the feedback form is the sole path by which an external user writes to the database, this test pins down the exact required/optional field set, enum constraints, defaults, index, and timestamp settings so that any schema change that would alter who can reach operators or how the operator queue is queried is caught immediately.

## Key elements
- **`describe('feedbackRequestSchema')`** — single test suite covering every public contract of the schema.
  - *required fields* — asserts `email`, `message`, `subject` are required; `name` is not.
  - *operator-side defaults* — asserts `respondedAt` and `adminNotes` have **no** default (prevents auto-marking submissions as answered).
  - *status enum & default* — asserts the enum matches `Object.values(FeedbackRequestStatus)` and the default is `FeedbackRequestStatus.new`.
  - *index* — asserts a single compound index `status_1_createdAt_-1` (the only queue query: open items, newest first).
  - *timestamps* — asserts `optionsOf(...).timestamps` is `true`, since the queue orders by `createdAt`.

## Relationships
- **`src/modules/feedback/model.ts`** — source of `feedbackRequestSchema`, the object under test.
- **`src/types/index.ts`** — provides `FeedbackRequestStatus`; the test compares the schema's enum against `Object.values(FeedbackRequestStatus)` to keep the two in lockstep.
- **`tests/support/schema.ts`** — provides the Mongoose-schema introspection helpers used here: `requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `optionsOf`.

## Notes
- The test asserts the *absence* of defaults on `respondedAt` / `adminNotes` as a contract guard: adding a `default` would silently mark every new submission as answered.
- The name-optional assertion is intentional and documented inline; a future "fix" that makes `name` required would violate the stated policy that reporting a problem doesn't require self-identification.
- The index assertion is a full string match on the compound key order (`status+1, createdAt-1`), so reordering or adding fields to the index will fail the test.
