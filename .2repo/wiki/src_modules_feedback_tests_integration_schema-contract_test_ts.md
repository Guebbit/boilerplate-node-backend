# src/modules/feedback/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies the Mongoose schema's **serialization contract** for feedback requests (e.g. `toJSON` exposes `id` and omits `_id`/`__v`). It runs against a real Mongo instance because these guarantees come from Mongoose's schema definitions, not application logic—a mocked model would only assert the mock's interpretation of `default` or `toJSON`.

## Key elements

- **`setupTestDb()`** (from `@tests/setup-test-db`) — spins up a real test database before the suite runs.
- **`feedbackRequestRepository.create(payload)`** (from `@modules/feedback/repository`) — the single call under test; its returned document's `toJSON()` output is asserted.
- **`describe('feedback request schema')`** — contains one test: `serialises to id, never _id or __v`.

## Relationships

- **`src/modules/feedback/repository.ts`** — provides `feedbackRequestRepository`, the only production code exercised here. The test calls `.create()` and inspects the resulting document's serialization.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, invoked at module scope to establish a real Mongo connection for the suite.

## Notes

- The module docblock also mentions verifying `required` fields and `select: false` on credentials, but the current file contains **only** the serialization test. Those cases are either not yet written or live in a sibling spec.
- The payload is cast `as never` to satisfy TypeScript without importing the repository's input type—conventional for keeping the test decoupled from internal types.
