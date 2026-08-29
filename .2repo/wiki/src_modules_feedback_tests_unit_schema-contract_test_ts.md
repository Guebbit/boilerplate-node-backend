# src/modules/feedback/tests/unit/schema-contract.test.ts

## Purpose

Contract test that locks in the shape of `feedbackRequestSchema` — required fields, defaults, enum bounds, index spec, and Mongoose options. Its role is to make any unintended schema drift (a new required field, a changed default, a missing index) a visible test failure rather than a silent behavior shift.

## Key elements

- **`describe('feedbackRequestSchema')`** — single suite with six assertions covering:
  - **Required paths** — asserts exactly `['email', 'message', 'subject']` are required and `name` is *not*.
  - **Absent operator fields** — asserts `respondedAt` and `adminNotes` have no `default` (prevents auto-marking messages as answered).
  - **Status enum & default** — asserts the allowed values match `Object.values(FeedbackRequestStatus)` and the default is `FeedbackRequestStatus.new`.
  - **Index spec** — asserts a single compound index: `status_1_createdAt_-1`.
  - **Timestamps option** — asserts `timestamps: true` is enabled.
- **Schema introspection helpers** (`defaultOf`, `enumOf`, `indexSpecs`, `optionsOf`, `requiredPaths`) imported from `@tests/schema` — these extract Mongoose-internal metadata so tests assert on the compiled schema rather than re-implementing validation.

## Relationships

- **`src/modules/feedback/model.ts`** — source of `feedbackRequestSchema`, the system under test.
- **`src/types/index.ts`** — source of the `FeedbackRequestStatus` enum; the test compares the schema's enum values against this canonical list to catch drift.
- **`tests/support/schema.ts`** — provides the five introspection helpers used throughout; changes to how Mongoose exposes its internals surface here first.

## Notes

- The inline comments in each `it` block document the *product rationale* (e.g., why `name` is optional, why `respondedAt` must not default). Treat them as the authoritative "why" — the assertions alone don't convey intent.
- The index assertion uses a human-readable spec string (`'status_1_createdAt_-1: status+1, createdAt-1'`) produced by `indexSpecs`; if the helper's formatting changes, the assertion string must be updated in lockstep.
- This file intentionally contains **no** validation-logic tests (e.g., email format, message length). Those belong in integration/e2e tests against the running API.
