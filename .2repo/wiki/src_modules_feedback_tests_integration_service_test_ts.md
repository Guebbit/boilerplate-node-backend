# src/modules/feedback/tests/integration/service.test.ts

## Purpose

Integration test suite for the feedback service. Exercises `create`, `search`, `updateStatus`, and `updateStatusById` against a real test database to verify input normalisation, search/filter/pagination semantics, status-transition side-effects (especially `respondedAt` stamping), and the 404 contract of the ID-based update path.

## Key elements

- **`setupTestDb()`** — top-level call that initialises the shared test database before any test runs.
- **`makePayload(overrides?)`** — factory returning a valid creation payload; each test overrides one or two fields.
- **`seed()`** — creates three feedback records via `create`; the third is manually saved as `resolved` to give the search suite a mixed-status corpus.
- **`asSuccess` / `asReject`** — type-cast helpers narrowing `unknown` to `ResponseSuccess<FeedbackRequestDocument>` or `ResponseReject` for assertion ergonomics.
- **`MISSING_ID`** — a fixed invalid ObjectId used for the 404 rejection test.
- **`describe('create')`** — asserts email lowercasing, whitespace trimming on all fields, and that a blank name collapses to `undefined`.
- **`describe('search')`** — covers unfiltered retrieval, status/email/text filters, pagination meta coherence, unknown-status → empty result set, and rejection of uppercase status aliases.
- **`describe('updateStatus')`** — verifies status change, persistence (re-read via repository), admin-notes set/clear, and `respondedAt` stamp-once / no-move-on-resolve behaviour.
- **`describe('updateStatusById')`** — happy-path update and 404 `ResponseReject` for a non-existent ID.

## Relationships

- **`src/modules/feedback/service.ts`** — system under test; all four service functions are imported and exercised directly.
- **`src/modules/feedback/repository.ts`** — `feedbackRequestRepository` is used to (a) manually persist a resolved record in `seed()` and (b) re-fetch a document to confirm `updateStatus` persisted rather than only mutating in memory.
- **`src/modules/feedback/model.ts`** — provides the `FeedbackRequestDocument` type used in the `asSuccess` cast.
- **`src/types/index.ts`** — provides the `FeedbackRequestStatus` enum used throughout assertions and payloads.
- **`src/infrastructure/http/response.ts`** — provides `ResponseSuccess` / `ResponseReject` types that shape the assertion helpers.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` which provisions the in-test database connection.

## Notes

- Tests run against a **real database** (not a mock); `setupTestDb()` is called once at module scope. Tests in each `describe` block rely on `seed()` or individual `create` calls for isolation rather than a per-test transaction rollback.
- The uppercase-status test (`'NEW'` → 0 results) is a deliberate contract-conformance check tied to the `openapi.yaml` enum; it is paired with a positive lowercase assertion to prove the filter mechanism itself works.
- The `respondedAt` idempotency test captures `getTime()` before the second resolve call to guard against drift.
- `seed()` saves the third record by mutating `status` in memory then calling `feedbackRequestRepository.save` — a slightly different code path than `updateStatus`, which is intentional (it tests the repository layer directly).
