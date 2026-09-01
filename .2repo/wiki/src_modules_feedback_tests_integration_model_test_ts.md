# src/modules/feedback/tests/integration/model.test.ts

## Purpose

Integration test that verifies feedback-request documents never expose internal MongoDB fields (`_id`, `__v`) to consumers. It covers both serialization paths: a hydrated Mongoose document (via `toJSON`) and a `.lean()` list result (via the service's `search` method, which maps results through a manual transform).

## Key elements

- **`createFeedback()`** – Module-level helper that inserts a fixed feedback record (`reporter@example.com`, subject, message) through `feedbackRequestRepository.create`, returning the hydrated document for use in assertions.
- **`describe('feedback request serialization')`** – Test suite containing two cases:
  - *"normalizes a hydrated document via toJSON"* – Asserts `json.id` equals `_id.toString()` and that neither `_id` nor `__v` appear in the JSON stringification.
  - *"normalizes a lean list via feedbackRequestService.search"* – Calls `search({})`, expects one item with an `id` matching a 24-hex-char pattern and no `_id`/`__v` keys.

## Relationships

- **`src/modules/feedback/repository.ts`** – `feedbackRequestRepository.create` is used to seed test data into the in-memory DB.
- **`src/modules/feedback/service.ts`** – `feedbackRequestService.search` is the unit under test for the lean/list serialization path.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module scope to configure the shared in-memory database before any test runs.
- **`tests/support/stub.ts`** – `asStub` is used solely to cast the lean result item to `Record<string, unknown>` so property existence checks (`toBeUndefined`, regex match) type-check without narrowing to the service's return type.

## Notes

- `setupTestDb()` runs at **module top level**, not inside a `beforeEach`; the DB state persists across both tests in this file. The second test's `toHaveLength(1)` assertion therefore assumes the first test's inserted document is still present (or that `search` returns only its own insert). Be cautious when adding new tests that also create feedback records.
- The `asStub` cast exists to work around TypeScript's stricter type on the service's return; it signals that the assertion is checking shape rather than a typed contract.
