# src/modules/feedback/tests/unit/schema-contract.test.ts

## Purpose

Contract tests for `feedbackRequestSchema`. Encodes the business rule that a stranger may reach operators only if the schema captures enough to reply (email, subject, message) while keeping the name optional. Verifies required/optional fields, operator-side defaults (or lack thereof), the status enum, index layout, and the TTL retention policy so that schema drift is caught at the unit level.

## Key elements

- **`RETENTION_SECONDS`** – computed from `NODE_FEEDBACK_RETENTION_DAYS` (default 730) and used to assert the TTL value without hard-coding a literal.
- **`describe('feedbackRequestSchema')`** – seven assertions covering:
  - Required paths are exactly `email`, `message`, `subject`.
  - `name` is absent from required paths.
  - `respondedAt` and `adminNotes` have **no** default (operator-filled, not submitter-filled).
  - `status` enum matches `Object.values(FeedbackRequestStatus)` and defaults to `FeedbackRequestStatus.new`.
  - Index specs include `createdAt_1` (ascending) and `status_1_createdAt_-1` (compound queue).
  - `timestamps: true` is set.
  - `expireAfterSeconds` appears only on the ascending `createdAt_1` index.

## Relationships

- **`src/modules/feedback/model.ts`** – source of `feedbackRequestSchema`; the sole subject under test.
- **`src/types/index.ts`** – exports `FeedbackRequestStatus` used to validate the `status` enum values and default.
- **`tests/support/schema.ts`** – provides the extraction helpers (`requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`) that turn Mongoose schema internals into plain values for `expect(...)`.

## Notes

- The retention assertion compares against `RETENTION_SECONDS` (derived from the env var at test time), so changing `NODE_FEEDBACK_RETENTION_DAYS` moves the expected value automatically. It also guards against a TTL sneaking onto the compound index.
- The dedicated "expires ascending by createdAt" test exists because Mongo silently ignores `expireAfterSeconds` on a descending or compound index; `createdAt` appears in both `createdAt_1` (ascending) and `status_1_createdAt_-1` (descending), and only the former is a valid TTL candidate.
- `respondedAt` is checked for the *absence* of a default — a default there would mark every incoming ticket as already answered.
