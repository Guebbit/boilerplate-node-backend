---
source: src/modules/feedback/tests/contract/api.contract.test.ts
sha256: ad4c3b46b88218d145d0521dd54c3a5e379f694681727662364006f8f4c4c744
generated_at: 2026-09-23T18:41:30.800076+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/feedback` route, asserting that each response satisfies the OpenAPI spec (`toSatisfyApiSpec()`). Because feedback is the only resource with a genuinely public write endpoint (`POST /feedback/contact`, `security: []`) beside admin-only routes, the tests specifically guard that the public response carries no admin fields and that admin routes return 401/403 rather than leaking data. Records are created through the public endpoint itself (no fixture builder exists), so the payload under assertion is exactly what the app produces.

## Key elements

- **`CONTACT_PAYLOAD`** — the canonical valid submission body (name, email, subject, message) reused across tests.
- **`createFeedbackRequest()`** — helper that `POST`s to `/feedback/contact` and returns the created `id`; throws on non-201.
- **`MISSING_ID`** — a hardcoded valid-shape ObjectId guaranteed not to exist, used to exercise the 404 branch (as opposed to a 422 for a malformed id).
- **`describe('POST /feedback/contact')`** — happy path (201), `new` status default, optional `name` omission, 422 on bad email / missing message / message > 5000 chars (pins the `maxLength` that moved from a zod override into `openapi.yaml`).
- **`describe('GET /feedback')`** — admin 200, empty-list contract, 422 on out-of-range `pageSize`/`page`, 422 on unknown `status` enum value.
- **`describe('POST /feedback/search')`** — the body-carrying sibling of the GET list; verifies body filters work, and that pagination/status bounds mirror the query form exactly (shared schema).
- **`describe('PUT /feedback/{id}')`** — status + adminNotes update (200), 422 on bad enum, 404 on missing id.
- **`describe('POST /feedback/contact — honeypot')`** — submitting a `website` field must still return 201 (bot learns nothing), omit the field from the response, and store the record with status `"spam"`.
- **`describe('DELETE /feedback/{id}')`** — 200 + subsequent empty list, 404 on missing id, 404 (not 500) on a non-ObjectId string.

## Relationships

- **`tests/support/contract.ts`** — imported as `@tests/contract`; registers the `toSatisfyApiSpec()` matcher used in every assertion block to validate responses against the generated OpenAPI schema.
- **`tests/support/http.ts`** — provides `api()` (the supertest-style request builder) and `authenticateAs('admin')` (returns a bearer token for the admin role).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to seed/reset the test database before any test runs.

## Notes

- No fixture builder exists for feedback; the public `POST /feedback/contact` endpoint *is* the data-factory. Tests that need a record call `createFeedbackRequest()` rather than inserting directly.
- The `maxLength: 5000` enforcement on `message` was moved from a controller-level zod override into `openapi.yaml` itself (see D2 comment). The 5001-char test exists to pin that the generated schema still enforces it end-to-end.
- Pagination bounds (`pageSize ≤ 100`, `page ≥ 1`) are asserted identically for the GET query-string form and the POST body form because they share one validation schema; the test guards against a future divergence.
- The honeypot test verifies both the public-facing contract (201, no `website` in response body) *and* the admin-visible side effect (status persisted as `"spam"`), in a single test to keep the two assertions together.
