# src/modules/feedback/tests/integration/schema-contract.test.ts

## Purpose

Integration test that pins the **Mongoose schema declarations** for the feedback-request document — defaults, required fields, enum constraints, and serialization shape. Sibling specs in this folder cover repository behavior; this file exists because the schema itself is part of the public API contract and is not exercised anywhere else. It runs against a real MongoDB instance because it asserts Mongoose semantics (default application, `required`, `select: false`, `toJSON`), which a mock would only simulate.

## Key elements

- **`describe('feedback request schema')`** — single test suite containing six `it` blocks, each asserting one schema property:
  - *defaults status to `new`* — creates a minimal payload and verifies the schema default.
  - *requires email, subject, message* — three negative-creation calls that each omit one required field and expect rejection.
  - *treats `name` as optional* — confirms `name` is `undefined` when not supplied.
  - *rejects status outside the declared enum* — sends a bogus string and expects Mongoose validation to throw.
  - *accepts every status the enum declares* — iterates `Object.values(FeedbackRequestStatus)` and round-trips each.
  - *serialises to `id`, never `_id` or `__v`* — calls `toJSON()` and asserts the public key shape.
- **`payload`** (local constant) — minimal valid `{ email, subject, message }` reused across tests.

## Relationships

- **`src/modules/feedback/repository.ts`** — imports `feedbackRequestRepository`; every test calls `.create()` on it to exercise the underlying Mongoose schema.
- **`src/types/index.ts`** — imports `FeedbackRequestStatus` for the default-value assertion and the enum-exhaustion loop.
- **`tests/support/setup-test-db.ts`** — imports and calls `setupTestDb()` at module scope to spin up a real in-memory MongoDB before the suite runs.

## Notes

- Payloads are cast `as never` deliberately: the tests intentionally send partial or invalid shapes that TypeScript's types would reject at compile time.
- The enum values mirror `openapi.yaml`; the "rejects outside enum" test exists to catch drift between the Mongoose schema and that contract.
- This file is **not** testing the repository's transform/mapping logic — that belongs to the sibling behavioral specs. Keep new schema-assertion tests here; keep behavior tests in their own files.
