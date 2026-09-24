---
source: src/modules/feedback/tests/unit/schema-contract.test.ts
sha256: 248f630ace17531844a3e737882b194a356eee936a14df974135fd0b976153d4
generated_at: 2026-09-23T18:43:10.510645+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/schema-contract.test.ts

## Purpose

Pins the social contract of `feedbackRequestSchema` — the one surface where an anonymous stranger writes to the database. It asserts which fields are required, which are optional, which carry defaults, which are indexed, and how long documents are retained, so that a schema refactor cannot silently change what a reporter must provide or how the operator queue behaves.

## Key elements

- **`RETENTION_SECONDS`** – Module-level constant computed from `NODE_FEEDBACK_RETENTION_DAYS` (default 730 days) converted to seconds. Used as the expected TTL value so the test and the policy move together when the env var changes.
- **`describe('feedbackRequestSchema')`** – Single describe block containing seven assertions:
    - Required fields are exactly `email`, `message`, `subject`.
    - `name` is _not_ required.
    - `respondedAt` and `adminNotes` have no default (operator-filled fields).
    - `status` is restricted to the `FeedbackRequestStatus` enum and defaults to `FeedbackRequestStatus.new`.
    - Index specs include `createdAt_1` (TTL) and `status_1_createdAt_-1` (operator queue).
    - `timestamps: true` is set (Mongoose auto-manages `createdAt`/`updatedAt`).
    - TTL `expireAfterSeconds` appears only on the ascending single-field index, not the compound one.
- **Test helpers** (imported from `@tests/schema`): `requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf` — small utilities that extract schema metadata for comparison.

## Relationships

- **`src/modules/feedback/model.ts`** – Source of `feedbackRequestSchema`; every assertion in this file reads a property of that exported schema object.
- **`src/types/index.ts`** – Provides the `FeedbackRequestStatus` enum; the test validates that the schema's `status` field's enum values match `Object.values(FeedbackRequestStatus)` and that its default is `FeedbackRequestStatus.new`.
- **`tests/support/schema.ts`** – Supplies the six introspection helpers (`requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`) that this file uses to interrogate the schema without instantiating a document.

## Notes

- The TTL assertion is written against `RETENTION_SECONDS` (env-derived), not a hard-coded number. Changing `NODE_FEEDBACK_RETENTION_DAYS` in CI or locally updates both the model's TTL and the expected value automatically — but a stray TTL on the compound index will still fail the test because only one `expireAfterSeconds` entry is expected.
- Mongo enforces `expireAfterSeconds` only on a **single-field ascending** index. The test explicitly asserts `createdAt_1` (ascending) exists as its own index to guard against accidentally placing the TTL on the descending `createdAt_-1` member of the compound index, which would silently never expire documents.
- Several assertions are "absence" checks (`not.toContain`, `toBeUndefined`). These are intentional: they encode the policy decision that name is optional and that operator fields must not be pre-filled by the submission schema.
