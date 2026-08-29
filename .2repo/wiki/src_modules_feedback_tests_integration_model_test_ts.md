# src/modules/feedback/tests/integration/model.test.ts

## Purpose

Integration test that verifies feedback request documents never expose Mongoose-internal fields (`_id`, `__v`) in serialized output, covering both the hydrated-document path (`toJSON`) and the lean-query path (manually mapped via the service's `search` method).

## Key elements

- **`createFeedback()`** – helper that inserts a record via `feedbackRequestRepository.create` with a fixed email/subject/message payload, returning the saved document.
- **`describe('feedback request serialization')`** – the single test suite with two cases:
  - *normalizes a hydrated document via `toJSON`* – asserts `json.id` equals the hex `_id`, and that the stringified JSON contains neither `_id` nor `__v`.
  - *normalizes a lean list via `feedbackRequestService.search`* – calls `search({})`, asserts the single item has an `id` matching a 24-char hex string and that `_id`/`__v` are `undefined`.

## Relationships

- **`src/modules/feedback/repository.ts`** – imports `feedbackRequestRepository` solely to create seed data for the tests.
- **`src/modules/feedback/service.ts`** – imports the namespace and exercises `feedbackRequestService.search` to verify the lean-result transform.
- **`tests/support/setup-test-db.ts`** – called once at module scope to provision an in-memory (or isolated) MongoDB instance before any test runs.
- **`tests/support/stub.ts`** – provides `asStub<T>()`, a type-level cast used to assert properties on the untyped lean-result item without a full model interface.

## Notes

- The test file is an **integration** test (spins up a real DB via `setupTestDb`), not a unit test with mocked repositories/services.
- The lean-path test relies on the service performing the `applyFeedbackRequestTransform` mapping; the repository is not called for reads—only for the initial `create`.
- `asStub` is a no-op at runtime (type assertion only); it exists to satisfy the type checker on the `Record<string, unknown>` shape returned by the lean query.
