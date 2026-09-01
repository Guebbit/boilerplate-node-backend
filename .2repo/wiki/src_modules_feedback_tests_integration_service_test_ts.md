# src/modules/feedback/tests/integration/service.test.ts

## Purpose

Integration tests for the feedback request service (`create`, `search`, `updateStatus`, `updateStatusById`). The file pins three contractual behaviours: input normalisation on create, strict status-enum filtering on search, and the one-shot `respondedAt` timestamp. It runs against a real test database to verify persistence, not just in-memory mutation.

## Key elements

- **`makePayload(overrides)`** – Builds a valid creation payload; each test overrides a single field to isolate one behaviour.
- **`asSuccess` / `asReject`** – Type-narrowing casts so tests can read `result.data` or `result.status` without repeated guards.
- **`MISSING_ID`** – A fixed 24-char hex string used to assert the 404 path in `updateStatusById`.
- **`seed()`** – Creates three feedback requests (two `new`, one `resolved`) to give `search` a small, varied corpus.
- **`describe('create')`** – Five cases covering default status, email lowercasing, whitespace trimming, blank-name → `undefined`, and whitespace-padded-but-non-blank name retention.
- **`describe('search')`** – Seven cases covering no-filter, status filter, email fragment, free-text, pagination meta consistency, unknown-status narrowing, and rejection of uppercase status aliases.
- **`describe('updateStatus')`** – Eight cases covering status change, persistence, admin notes (set, leave-untouched, clear-to-`''`), and `respondedAt` stamping rules (stamps on resolve, not on other statuses, never overwrites on re-resolve).
- **`describe('updateStatusById')`** – Two cases: successful update by ID and 404 rejection for a nonexistent ID.

## Relationships

- **`@tests/setup-test-db`** → `setupTestDb()` is called once at module top level to provision the test database before any `describe` block runs.
- **`@modules/feedback/service`** → The four exported functions under test (`create`, `search`, `updateStatus`, `updateStatusById`) are called directly; no HTTP layer is involved.
- **`@modules/feedback/repository`** → `feedbackRequestRepository.save()` and `.findById()` are used to persist seed data and to verify that `updateStatus` writes through to the database rather than only mutating the in-memory object.
- **`@types`** → `FeedbackRequestStatus` enum values (`new`, `in_progress`, `resolved`, `spam`) are the canonical status literals used throughout assertions.
- **`@infrastructure/http/response`** → `ResponseSuccess` / `ResponseReject` types are imported for the `asSuccess`/`asReject` casts so tests read the discriminated-union result shape.
- **`@modules/feedback/model`** → `FeedbackRequestDocument` is the generic parameter for the `ResponseSuccess` cast, tying assertions to the persisted document shape.

## Notes

- `setupTestDb()` is invoked at the **top level of the module** (outside any `describe`), so it runs once per test-file load rather than per suite.
- The pagination test asserts `totalPages: 2` for 3 items at pageSize 2 — the comment flags this as a guard against an off-by-one where `totalPages` is computed from the page size rather than the total count.
- The "unknown status" test deliberately uses a **truthy** string (`'NOT_A_STATUS'`) to ensure the failure direction is "narrow to zero results," not "ignore the filter and return everything."
- The `adminNotes: ''` test documents a `!== undefined` guard in the service: an empty string is a deliberate clear, not a falsy no-op.
