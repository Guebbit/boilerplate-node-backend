# src/modules/feedback/tests/integration/schema-contract.test.ts

## Purpose

Integration tests that verify what the Mongoose schema itself declares at the database level — field defaults, `required` constraints, enum boundaries, and JSON serialization shape — as distinct from the transform/validation logic covered by sibling specs. Runs against a real MongoDB instance because these are Mongoose runtime behaviours that a mocked model would only parrot back.

## Key elements

- **`setupTestDb()`** — called at module scope to provision a real Mongo connection before any test runs.
- **`payload`** — a minimal valid feedback document (`email`, `subject`, `message`) reused across tests.
- **"defaults a new request to the 'new' status"** — asserts `status` defaults to `FeedbackRequestStatus.new` when omitted.
- **"requires email, subject and message"** — asserts that omitting any one of the three fields causes a rejection.
- **"treats name as optional"** — asserts `name` is `undefined` on a document created without it.
- **"rejects a status outside the declared enum"** — asserts an arbitrary string (`'NOT_A_STATUS'`) is rejected.
- **"accepts every status the enum declares"** — iterates all `FeedbackRequestStatus` values and asserts each round-trips.
- **"serialises to id, never _id or __v"** — asserts `toJSON()` exposes a string `id` and omits Mongoose internals.

## Relationships

- **`src/modules/feedback/repository.ts`** — provides `feedbackRequestRepository.create()`; every test exercises the schema through this repository method rather than touching the model directly.
- **`src/types/index.ts`** — source of the `FeedbackRequestStatus` enum; used both as the expected default value and as the iteration set for the "accepts every status" test.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, which spins up and tears down a real MongoDB instance for the suite.

## Notes

- Every call to `feedbackRequestRepository.create()` is cast with `as never`, intentionally bypassing TypeScript's compile-time checks so the test can feed invalid shapes (missing fields, out-of-enum status) and rely on the schema's runtime enforcement.
- The enum is documented as mirroring `openapi.yaml`; the "rejects outside enum" test exists to catch drift between the schema and that contract.
- The serialization test (`id` present, `_id`/`__v` absent) is the single assertion that guards the wire/JSON shape; if a future schema change re-exposes Mongoose internals, this test is the first to fail.
